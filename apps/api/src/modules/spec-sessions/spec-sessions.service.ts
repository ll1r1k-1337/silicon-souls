import { ConflictException, Injectable } from '@nestjs/common';
import {
  approvedVersion,
  createPrefixedId,
  nextDraftVersion,
  nowIso,
  validateApprovalReadiness,
  type AcceptanceCriterion,
  type Assumption,
  type ConversationTurn,
  type Decision,
  type Goal,
  type NonGoal,
  type OpenQuestion,
  type ProductSpecJson,
  type Requirement,
  type ReviewReportPayload,
  type Risk,
  type SpecArtifact,
  type SpecArtifactType,
  type SpecSession,
  type SpecVersion,
  type TargetUser,
  type UserScenario,
} from '@sdd/domain';
import { ProductSpecJsonSchema, ReviewReportPayloadSchema } from '@sdd/schemas';
import { buildProductSpecJson } from '@sdd/spec-format';
import { and, desc, eq } from 'drizzle-orm';
import { BackgroundJobsService } from '../background-jobs/background-jobs.service';
import { ProjectsService } from '../projects/projects.service';
import { DatabaseService } from '../../shared/database/database.service';
import {
  conversationTurns,
  projects,
  reviewReports,
  specArtifacts,
  specDocuments,
  specSessions,
  specVersions,
  type ConversationTurnRow,
  type ReviewReportRow,
  type SpecArtifactRow,
  type SpecSessionRow,
  type SpecVersionRow,
} from '../../shared/database/schema';
import { EventStoreService } from '../../shared/events/event-store.service';
import { throwNotFound } from '../../shared/errors/not-found';

function mapSession(row: SpecSessionRow): SpecSession {
  return {
    id: row.id,
    projectId: row.projectId,
    status: row.status as SpecSession['status'],
    rawIdea: row.rawIdea,
    currentVersionId: row.currentVersionId ?? undefined,
    approvedAt: row.approvedAt?.toISOString(),
    approvedBy: row.approvedAt ? 'user' : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapTurn(row: ConversationTurnRow): ConversationTurn {
  const metadata = row.metadata as Partial<ConversationTurn>;
  return {
    id: row.id,
    sessionId: row.sessionId,
    role: row.role as ConversationTurn['role'],
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    extractedFactIds: metadata.extractedFactIds ?? [],
    extractedRequirementIds: metadata.extractedRequirementIds ?? [],
    extractedAssumptionIds: metadata.extractedAssumptionIds ?? [],
    extractedDecisionIds: metadata.extractedDecisionIds ?? [],
  };
}

function mapArtifact(row: SpecArtifactRow): SpecArtifact {
  return {
    id: row.id,
    sessionId: row.sessionId,
    artifactType: row.artifactType as SpecArtifactType,
    status: row.status,
    payload: row.payload,
    source: row.source as unknown as SpecArtifact['source'],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapVersion(row: SpecVersionRow): SpecVersion {
  return {
    id: row.id,
    sessionId: row.sessionId,
    version: row.version,
    status: row.status as SpecVersion['status'],
    markdownSnapshot: row.markdownSnapshot,
    jsonSnapshot: row.jsonSnapshot as unknown as ProductSpecJson,
    changeSummary: row.changeSummary ?? '',
    createdBy: row.createdBy as SpecVersion['createdBy'],
    createdAt: row.createdAt.toISOString(),
  };
}

function artifactKey(type: SpecArtifactType, payload: Record<string, unknown>): string {
  const value =
    payload.title ??
    payload.question ??
    payload.text ??
    payload.description ??
    payload.name ??
    JSON.stringify(payload);

  return `${type}:${String(value).trim().toLowerCase()}`;
}

@Injectable()
export class SpecSessionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly jobs: BackgroundJobsService,
    private readonly projectsService: ProjectsService,
    private readonly events: EventStoreService,
  ) {}

  async start(projectId: string, rawIdea: string): Promise<SpecSession> {
    await this.projectsService.get(projectId);
    const now = new Date(nowIso());
    const [session] = await this.database.db
      .insert(specSessions)
      .values({
        id: createPrefixedId('spec'),
        projectId,
        status: 'raw_idea',
        rawIdea,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await this.database.db.insert(specDocuments).values({
      id: createPrefixedId('doc'),
      sessionId: session.id,
      markdown: `# Product Specification\n\n${rawIdea}\n`,
      dirty: false,
      createdAt: now,
      updatedAt: now,
    });

    await this.projectsService.setCurrentSession(projectId, session.id);
    await this.events.append({
      aggregateId: session.id,
      aggregateType: 'spec_session',
      eventType: 'spec_session.started',
      payload: { projectId, rawIdea },
    });

    return mapSession(session);
  }

  async getSession(sessionId: string): Promise<SpecSession> {
    const [session] = await this.database.db
      .select()
      .from(specSessions)
      .where(eq(specSessions.id, sessionId))
      .limit(1);

    if (!session) {
      throwNotFound('Spec session', sessionId);
    }

    return mapSession(session);
  }

  async getWorkspace(sessionId: string): Promise<Record<string, unknown>> {
    const session = await this.getSession(sessionId);
    const project = await this.projectsService.get(session.projectId);
    const turns = await this.getConversation(sessionId);
    const artifacts = await this.getArtifacts(sessionId);
    const [document] = await this.database.db
      .select()
      .from(specDocuments)
      .where(eq(specDocuments.sessionId, sessionId))
      .orderBy(desc(specDocuments.updatedAt))
      .limit(1);
    const versions = await this.getVersions(sessionId);
    const review = await this.getLatestReview(sessionId);

    return {
      project,
      session,
      conversation: turns,
      artifacts,
      document,
      versions,
      review,
    };
  }

  async sendUserMessage(
    sessionId: string,
    message: string,
  ): Promise<Record<string, unknown>> {
    const session = await this.getSession(sessionId);
    const turn = await this.addConversationTurn(sessionId, 'user', message);
    await this.updateSessionStatus(sessionId, 'clarifying');

    const extractJob = await this.jobs.createJob({
      type: 'extract_artifacts',
      payload: {
        projectId: session.projectId,
        sessionId,
        messageId: turn.id,
        userMessage: message,
      },
    });
    const questionsJob = await this.jobs.createJob({
      type: 'generate_clarifying_questions',
      payload: {
        projectId: session.projectId,
        sessionId,
        sourceTurnId: turn.id,
      },
    });

    await this.events.append({
      aggregateId: sessionId,
      aggregateType: 'spec_session',
      eventType: 'conversation.message_added',
      payload: { messageId: turn.id, role: 'user' },
    });

    return {
      messageId: turn.id,
      jobs: [
        { jobId: extractJob.id, type: extractJob.type, status: extractJob.status },
        { jobId: questionsJob.id, type: questionsJob.type, status: questionsJob.status },
      ],
      status: 'clarifying',
    };
  }

  async enqueueDraft(sessionId: string): Promise<Record<string, unknown>> {
    const session = await this.getSession(sessionId);
    const job = await this.jobs.createJob({
      type: 'generate_draft',
      payload: { projectId: session.projectId, sessionId },
    });

    return { jobId: job.id, type: job.type, status: job.status };
  }

  async enqueueReview(sessionId: string): Promise<Record<string, unknown>> {
    const session = await this.getSession(sessionId);
    await this.updateSessionStatus(sessionId, 'review');
    const job = await this.jobs.createJob({
      type: 'run_review',
      payload: { projectId: session.projectId, sessionId },
    });

    return { jobId: job.id, type: job.type, status: job.status };
  }

  async addConversationTurn(
    sessionId: string,
    role: ConversationTurn['role'],
    content: string,
    metadata: Record<string, unknown> = {},
  ): Promise<ConversationTurn> {
    const [turn] = await this.database.db
      .insert(conversationTurns)
      .values({
        id: createPrefixedId('msg'),
        sessionId,
        role,
        content,
        metadata,
        createdAt: new Date(),
      })
      .returning();

    return mapTurn(turn);
  }

  async getConversation(sessionId: string): Promise<ConversationTurn[]> {
    const rows = await this.database.db
      .select()
      .from(conversationTurns)
      .where(eq(conversationTurns.sessionId, sessionId))
      .orderBy(conversationTurns.createdAt);

    return rows.map(mapTurn);
  }

  async getArtifacts(sessionId: string): Promise<SpecArtifact[]> {
    const rows = await this.database.db
      .select()
      .from(specArtifacts)
      .where(eq(specArtifacts.sessionId, sessionId))
      .orderBy(specArtifacts.createdAt);

    return rows.map(mapArtifact);
  }

  async persistExtractedArtifacts(params: {
    sessionId: string;
    requirements?: Requirement[];
    assumptions?: Assumption[];
    decisions?: Decision[];
    openQuestions?: OpenQuestion[];
    risks?: Risk[];
    acceptanceCriteria?: AcceptanceCriterion[];
    goals?: Goal[];
    nonGoals?: NonGoal[];
    scenarios?: UserScenario[];
    users?: TargetUser[];
  }): Promise<SpecArtifact[]> {
    const rows: Array<{
      artifactType: SpecArtifactType;
      payload: Record<string, unknown>;
      status: string;
      source: SpecArtifact['source'];
    }> = [];

    const push = <T extends Record<string, unknown>>(
      type: SpecArtifactType,
      payloads: T[] | undefined,
      defaultStatus = 'draft',
    ): void => {
      for (const payload of payloads ?? []) {
        rows.push({
          artifactType: type,
          payload,
          status: String(payload.status ?? defaultStatus),
          source:
            (payload.source as SpecArtifact['source'] | undefined) ?? {
              type: 'system_generated',
              confidence: 1,
              requiresUserConfirmation: false,
            },
        });
      }
    };

    push('requirement', params.requirements as unknown as Record<string, unknown>[]);
    push('assumption', params.assumptions as unknown as Record<string, unknown>[]);
    push('decision', params.decisions as unknown as Record<string, unknown>[]);
    push('open_question', params.openQuestions as unknown as Record<string, unknown>[]);
    push('risk', params.risks as unknown as Record<string, unknown>[]);
    push(
      'acceptance_criterion',
      params.acceptanceCriteria as unknown as Record<string, unknown>[],
    );
    push('goal', params.goals as unknown as Record<string, unknown>[]);
    push('non_goal', params.nonGoals as unknown as Record<string, unknown>[]);
    push('scenario', params.scenarios as unknown as Record<string, unknown>[]);
    push('target_user', params.users as unknown as Record<string, unknown>[]);

    const existing = await this.getArtifacts(params.sessionId);
    const existingKeys = new Set(
      existing.map((artifact) =>
        artifactKey(artifact.artifactType, artifact.payload as Record<string, unknown>),
      ),
    );
    const inserted: SpecArtifact[] = [];

    for (const row of rows) {
      const key = artifactKey(row.artifactType, row.payload);
      if (existingKeys.has(key)) {
        continue;
      }
      existingKeys.add(key);

      const now = new Date();
      const [artifact] = await this.database.db
        .insert(specArtifacts)
        .values({
          id: createPrefixedId('art'),
          sessionId: params.sessionId,
          artifactType: row.artifactType,
          status: row.status,
          payload: row.payload,
          source: row.source as unknown as Record<string, unknown>,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      inserted.push(mapArtifact(artifact));
    }

    if (inserted.length > 0) {
      await this.events.append({
        aggregateId: params.sessionId,
        aggregateType: 'spec_session',
        eventType: 'spec_artifacts.extracted',
        payload: {
          count: inserted.length,
          artifactIds: inserted.map((artifact) => artifact.id),
        },
      });
    }

    return inserted;
  }

  async persistInterviewerQuestions(params: {
    sessionId: string;
    questions: Array<{
      question: string;
      whyItMatters: string;
      severity: OpenQuestion['severity'];
      suggestedAnswers?: string[];
    }>;
  }): Promise<SpecArtifact[]> {
    const now = nowIso();
    const openQuestions = params.questions.map<OpenQuestion>((question) => ({
      id: createPrefixedId('oq'),
      sessionId: params.sessionId,
      question: question.question,
      whyItMatters: question.whyItMatters,
      severity: question.severity,
      status: 'open',
      suggestedAnswers: question.suggestedAnswers,
      relatedRequirementIds: [],
      createdAt: now,
      updatedAt: now,
    }));

    const inserted = await this.persistExtractedArtifacts({
      sessionId: params.sessionId,
      openQuestions,
    });

    if (params.questions.length > 0) {
      const content = params.questions
        .slice(0, 5)
        .map((question, index) => `${index + 1}. ${question.question}`)
        .join('\n');
      await this.addConversationTurn(params.sessionId, 'assistant', content, {
        extractedQuestionIds: openQuestions.map((question) => question.id),
      });
    }

    return inserted;
  }

  async assembleSpec(sessionId: string, version = '0.1.0'): Promise<ProductSpecJson> {
    const session = await this.getSession(sessionId);
    const [project] = await this.database.db
      .select()
      .from(projects)
      .where(eq(projects.id, session.projectId))
      .limit(1);

    if (!project) {
      throwNotFound('Project', session.projectId);
    }

    const artifacts = await this.getArtifacts(sessionId);
    const spec = buildProductSpecJson({
      project: {
        id: project.id,
        name: project.name,
        description: project.description ?? undefined,
      },
      session,
      artifacts,
      version,
    });

    return ProductSpecJsonSchema.parse(spec) as ProductSpecJson;
  }

  async saveGeneratedDraft(params: {
    sessionId: string;
    spec: ProductSpecJson;
    markdown: string;
    changeSummary: string;
    createdBy: SpecVersion['createdBy'];
  }): Promise<SpecVersion> {
    const latest = await this.getLatestVersion(params.sessionId);
    const version = nextDraftVersion(latest, latest ? 'minor' : 'minor');
    const spec = {
      ...params.spec,
      meta: { ...params.spec.meta, version, status: 'draft' as const, updatedAt: nowIso() },
    };
    const saved = await this.createVersion({
      sessionId: params.sessionId,
      version,
      status: 'draft',
      markdownSnapshot: params.markdown,
      jsonSnapshot: spec,
      changeSummary: params.changeSummary,
      createdBy: params.createdBy,
    });

    await this.upsertDocument(params.sessionId, params.markdown, saved.id, false);
    await this.database.db
      .update(specSessions)
      .set({
        status: 'draft',
        currentVersionId: saved.id,
        updatedAt: new Date(),
      })
      .where(eq(specSessions.id, params.sessionId));

    await this.events.append({
      aggregateId: params.sessionId,
      aggregateType: 'spec_session',
      eventType: 'spec_draft.generated',
      payload: { versionId: saved.id, version: saved.version },
    });

    return saved;
  }

  async saveReviewReport(params: {
    sessionId: string;
    versionId?: string;
    payload: ReviewReportPayload;
  }): Promise<ReviewReportRow> {
    const parsed = ReviewReportPayloadSchema.parse(params.payload);
    const [report] = await this.database.db
      .insert(reviewReports)
      .values({
        id: createPrefixedId('rev'),
        sessionId: params.sessionId,
        versionId: params.versionId,
        canApprove: parsed.canApprove,
        payload: parsed,
        createdAt: new Date(),
      })
      .returning();

    await this.events.append({
      aggregateId: params.sessionId,
      aggregateType: 'spec_session',
      eventType: 'spec_review.completed',
      payload: { reportId: report.id, canApprove: report.canApprove },
    });

    return report;
  }

  async approve(sessionId: string): Promise<Record<string, unknown>> {
    const latestVersion = await this.getLatestVersion(sessionId);
    if (!latestVersion) {
      throw new ConflictException('Cannot approve before a draft version exists.');
    }

    const review = await this.getLatestReview(sessionId);
    const spec = ProductSpecJsonSchema.parse(latestVersion.jsonSnapshot) as ProductSpecJson;
    const reviewPayload = review
      ? (ReviewReportPayloadSchema.parse(review.payload) as ReviewReportPayload)
      : undefined;
    const validation = validateApprovalReadiness(spec, reviewPayload);

    if (!validation.canApprove) {
      throw new ConflictException({
        message: 'Approval blocked.',
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }

    const version = approvedVersion();
    const approvedAt = nowIso();
    const approvedSpec = {
      ...spec,
      meta: {
        ...spec.meta,
        version,
        status: 'ready_for_decomposition' as const,
        approvedAt,
        updatedAt: approvedAt,
      },
    };
    const saved = await this.createVersion({
      sessionId,
      version,
      status: 'ready_for_decomposition',
      markdownSnapshot: latestVersion.markdownSnapshot,
      jsonSnapshot: approvedSpec,
      changeSummary: 'Approved specification for Stage 1 decomposition.',
      createdBy: 'user',
    });

    const session = await this.getSession(sessionId);
    await this.database.db
      .update(specSessions)
      .set({
        status: 'ready_for_decomposition',
        approvedAt: new Date(approvedAt),
        currentVersionId: saved.id,
        updatedAt: new Date(),
      })
      .where(eq(specSessions.id, sessionId));
    await this.projectsService.setStatus(session.projectId, 'ready_for_decomposition');
    await this.upsertDocument(sessionId, latestVersion.markdownSnapshot, saved.id, false);
    await this.events.append({
      aggregateId: sessionId,
      aggregateType: 'spec_session',
      eventType: 'spec.approved',
      payload: { versionId: saved.id, approvedAt },
    });

    return {
      status: 'ready_for_decomposition',
      version,
      versionId: saved.id,
      approvedAt,
    };
  }

  async directEdit(params: {
    sessionId: string;
    markdown: string;
    baseVersionId?: string;
    changeSummary: string;
  }): Promise<Record<string, unknown>> {
    const session = await this.getSession(params.sessionId);
    const latestVersion = await this.getLatestVersion(params.sessionId);
    const nextVersion = nextDraftVersion(latestVersion, 'patch');
    const spec = await this.assembleSpec(params.sessionId, nextVersion);
    const saved = await this.createVersion({
      sessionId: params.sessionId,
      version: nextVersion,
      status: 'draft',
      markdownSnapshot: params.markdown,
      jsonSnapshot: { ...spec, meta: { ...spec.meta, status: 'draft' } },
      changeSummary: params.changeSummary,
      createdBy: 'user',
    });
    const documentId = await this.upsertDocument(
      params.sessionId,
      params.markdown,
      saved.id,
      false,
    );
    await this.database.db
      .update(specSessions)
      .set({
        status: 'draft',
        approvedAt: session.status === 'draft' ? session.approvedAt ? new Date(session.approvedAt) : null : null,
        currentVersionId: saved.id,
        updatedAt: new Date(),
      })
      .where(eq(specSessions.id, params.sessionId));

    const eventId = await this.events.append({
      aggregateId: params.sessionId,
      aggregateType: 'spec_session',
      eventType: 'spec_document.directly_edited',
      payload: {
        baseVersionId: params.baseVersionId,
        versionId: saved.id,
        changeSummary: params.changeSummary,
        requiresReapproval:
          session.status === 'approved' || session.status === 'ready_for_decomposition',
      },
    });

    return {
      documentId,
      status: 'draft',
      versionId: saved.id,
      eventId,
    };
  }

  async getVersions(sessionId: string): Promise<SpecVersion[]> {
    const rows = await this.database.db
      .select()
      .from(specVersions)
      .where(eq(specVersions.sessionId, sessionId))
      .orderBy(desc(specVersions.createdAt));

    return rows.map(mapVersion);
  }

  async getLatestVersion(sessionId: string): Promise<SpecVersion | undefined> {
    const [row] = await this.database.db
      .select()
      .from(specVersions)
      .where(eq(specVersions.sessionId, sessionId))
      .orderBy(desc(specVersions.createdAt))
      .limit(1);

    return row ? mapVersion(row) : undefined;
  }

  async getLatestReview(sessionId: string): Promise<ReviewReportRow | undefined> {
    const [report] = await this.database.db
      .select()
      .from(reviewReports)
      .where(eq(reviewReports.sessionId, sessionId))
      .orderBy(desc(reviewReports.createdAt))
      .limit(1);

    return report;
  }

  async markReviewOutcome(sessionId: string, canApprove: boolean): Promise<void> {
    await this.database.db
      .update(specSessions)
      .set({
        status: canApprove ? 'review' : 'needs_user_input',
        updatedAt: new Date(),
      })
      .where(eq(specSessions.id, sessionId));
  }

  private async createVersion(params: {
    sessionId: string;
    version: string;
    status: SpecVersion['status'];
    markdownSnapshot: string;
    jsonSnapshot: ProductSpecJson;
    changeSummary: string;
    createdBy: SpecVersion['createdBy'];
  }): Promise<SpecVersion> {
    const [version] = await this.database.db
      .insert(specVersions)
      .values({
        id: createPrefixedId('ver'),
        sessionId: params.sessionId,
        version: params.version,
        status: params.status,
        markdownSnapshot: params.markdownSnapshot,
        jsonSnapshot: params.jsonSnapshot as unknown as Record<string, unknown>,
        changeSummary: params.changeSummary,
        createdBy: params.createdBy,
        createdAt: new Date(),
      })
      .returning();

    await this.events.append({
      aggregateId: params.sessionId,
      aggregateType: 'spec_session',
      eventType: 'spec_version.created',
      payload: { versionId: version.id, version: version.version, status: version.status },
    });

    return mapVersion(version);
  }

  private async updateSessionStatus(
    sessionId: string,
    status: SpecSession['status'],
  ): Promise<void> {
    await this.database.db
      .update(specSessions)
      .set({ status, updatedAt: new Date() })
      .where(eq(specSessions.id, sessionId));
  }

  private async upsertDocument(
    sessionId: string,
    markdown: string,
    versionId: string,
    dirty: boolean,
  ): Promise<string> {
    const [existing] = await this.database.db
      .select()
      .from(specDocuments)
      .where(eq(specDocuments.sessionId, sessionId))
      .limit(1);

    if (existing) {
      await this.database.db
        .update(specDocuments)
        .set({
          markdown,
          currentVersionId: versionId,
          dirty,
          updatedAt: new Date(),
        })
        .where(eq(specDocuments.id, existing.id));
      return existing.id;
    }

    const id = createPrefixedId('doc');
    await this.database.db.insert(specDocuments).values({
      id,
      sessionId,
      markdown,
      currentVersionId: versionId,
      dirty,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return id;
  }
}
