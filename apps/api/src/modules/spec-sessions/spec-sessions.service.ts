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
  type DocumentAnchor,
  type DocumentComment,
  type DocumentCommentThread,
  type DocumentCommentThreadStatus,
  type DocumentProjectionStatus,
  type DocumentSuggestion,
  type DocumentSuggestionStatus,
  type RichDocumentContent,
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
import {
  buildProductSpecJson,
  richDocumentFromMarkdown,
  richDocumentSchemaVersion,
} from '@sdd/spec-format';
import { and, desc, eq } from 'drizzle-orm';
import { BackgroundJobsService } from '../background-jobs/background-jobs.service';
import { ProjectsService } from '../projects/projects.service';
import { DatabaseService } from '../../shared/database/database.service';
import {
  conversationTurns,
  documentComments,
  documentCommentThreads,
  documentSuggestions,
  projects,
  reviewReports,
  specArtifacts,
  specDocuments,
  specSessions,
  specVersions,
  type DocumentCommentRow,
  type DocumentCommentThreadRow,
  type DocumentSuggestionRow,
  type ConversationTurnRow,
  type ReviewReportRow,
  type SpecDocumentRow,
  type SpecArtifactRow,
  type SpecSessionRow,
  type SpecVersionRow,
} from '../../shared/database/schema';
import { EventStoreService } from '../../shared/events/event-store.service';
import { throwNotFound } from '../../shared/errors/not-found';

type NullableOptional<T, TKey extends keyof T> = Omit<T, TKey> & {
  [Key in TKey]?: T[Key] | null;
};
type LlmRequirementArtifact = NullableOptional<Requirement, 'rationale'>;
type LlmOpenQuestionArtifact = NullableOptional<
  OpenQuestion,
  | 'answer'
  | 'answerMode'
  | 'allowOtherAnswer'
  | 'customAnswer'
  | 'otherAnswerLabel'
  | 'suggestedAnswers'
>;
type LlmRiskArtifact = NullableOptional<Risk, 'mitigation'>;
type MappedDocument = {
  id: string;
  sessionId: string;
  markdown: string;
  contentJson: RichDocumentContent;
  schemaVersion: string;
  projectionStatus: DocumentProjectionStatus;
  dirty: boolean;
  currentVersionId?: string;
  updatedAt: string;
};

function stripNullProperties<T extends Record<string, unknown>>(payload: T): T {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== null),
  ) as T;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  return typeof value === 'string' ? [value] : [];
}

function mergeIds(...groups: string[][]): string[] {
  return Array.from(new Set(groups.flat()));
}

const specStatusDisplay: Record<
  SpecSession['status'],
  { label: string; description: string }
> = {
  raw_idea: {
    label: 'Raw idea',
    description: 'The initial product idea has been captured.',
  },
  clarifying: {
    label: 'Clarifying',
    description: 'The assistant is extracting details and asking follow-up questions.',
  },
  draft: {
    label: 'Draft',
    description: 'A draft specification exists and can be reviewed or edited.',
  },
  needs_user_input: {
    label: 'Needs user input',
    description: 'The specification is blocked until the user answers open questions or resolves gaps.',
  },
  review: {
    label: 'In review',
    description: 'The specification is being reviewed for gaps, risks, and approval readiness.',
  },
  approved: {
    label: 'Approved',
    description: 'The specification has been approved.',
  },
  ready_for_decomposition: {
    label: 'Ready for decomposition',
    description: 'The approved specification is ready for Stage 1 decomposition.',
  },
  archived: {
    label: 'Archived',
    description: 'The specification session is archived.',
  },
};

function mapSession(row: SpecSessionRow): SpecSession {
  const status = row.status as SpecSession['status'];
  const display = specStatusDisplay[status] ?? {
    label: row.status,
    description: row.status,
  };
  return {
    id: row.id,
    projectId: row.projectId,
    status,
    statusLabel: display.label,
    statusDescription: display.description,
    rawIdea: row.rawIdea,
    currentVersionId: row.currentVersionId ?? undefined,
    approvedAt: row.approvedAt?.toISOString(),
    approvedBy: row.approvedAt ? 'user' : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapTurn(row: ConversationTurnRow): ConversationTurn {
  const metadata = row.metadata as Record<string, unknown>;
  return {
    id: row.id,
    sessionId: row.sessionId,
    role: row.role as ConversationTurn['role'],
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    thinkingSummary:
      typeof metadata.thinkingSummary === 'string'
        ? metadata.thinkingSummary
        : undefined,
    extractedFactIds: stringArray(metadata.extractedFactIds),
    extractedRequirementIds: stringArray(metadata.extractedRequirementIds),
    extractedAssumptionIds: stringArray(metadata.extractedAssumptionIds),
    extractedDecisionIds: stringArray(metadata.extractedDecisionIds),
    generatedArtifactIds: stringArray(metadata.generatedArtifactIds),
    generatedOpenQuestionIds: mergeIds(
      stringArray(metadata.generatedOpenQuestionIds),
      stringArray(metadata.extractedQuestionIds),
    ),
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
    documentContentSnapshot: row.documentContentSnapshot as RichDocumentContent | undefined,
    jsonSnapshot: row.jsonSnapshot as unknown as ProductSpecJson,
    changeSummary: row.changeSummary ?? '',
    createdBy: row.createdBy as SpecVersion['createdBy'],
    createdAt: row.createdAt.toISOString(),
  };
}

function mapDocument(row: SpecDocumentRow): MappedDocument {
  return {
    id: row.id,
    sessionId: row.sessionId,
    markdown: row.markdown,
    contentJson:
      (row.contentJson as RichDocumentContent | null | undefined) ??
      richDocumentFromMarkdown(row.markdown),
    schemaVersion: row.schemaVersion ?? richDocumentSchemaVersion,
    projectionStatus: (row.projectionStatus ?? 'synced') as DocumentProjectionStatus,
    dirty: row.dirty,
    currentVersionId: row.currentVersionId ?? undefined,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapComment(row: DocumentCommentRow): DocumentComment {
  return {
    id: row.id,
    threadId: row.threadId,
    author: row.author as DocumentComment['author'],
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapSuggestion(row: DocumentSuggestionRow): DocumentSuggestion {
  return {
    id: row.id,
    threadId: row.threadId,
    status: row.status as DocumentSuggestionStatus,
    replacementMarkdown: row.replacementMarkdown ?? undefined,
    replacementContentJson: row.replacementContentJson as RichDocumentContent | undefined,
    rationale: row.rationale ?? undefined,
    createdBy: row.createdBy as DocumentSuggestion['createdBy'],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString(),
  };
}

function mapCommentThread(
  row: DocumentCommentThreadRow,
  comments: DocumentComment[] = [],
  suggestions: DocumentSuggestion[] = [],
): DocumentCommentThread {
  return {
    id: row.id,
    sessionId: row.sessionId,
    documentId: row.documentId ?? undefined,
    versionId: row.versionId ?? undefined,
    status: row.status as DocumentCommentThreadStatus,
    anchor: (row.anchor as DocumentAnchor | null | undefined) ?? {},
    selectedText: row.selectedText ?? undefined,
    createdBy: row.createdBy as DocumentCommentThread['createdBy'],
    comments,
    suggestions,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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

const questionStopWords = new Set([
  'the',
  'and',
  'are',
  'any',
  'for',
  'with',
  'that',
  'this',
  'what',
  'which',
  'should',
  'would',
  'could',
  'will',
  'does',
  'need',
  'needs',
  'user',
  'users',
  'application',
  'product',
  'spec',
  'specification',
]);

function normalizeQuestionText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function questionTokens(value: unknown): Set<string> {
  const normalized = normalizeQuestionText(value);
  return new Set(
    normalized
      .split(' ')
      .map((token) => token.replace(/s$/i, ''))
      .filter((token) => token.length > 2 && !questionStopWords.has(token)),
  );
}

function questionSimilarity(left: unknown, right: unknown): number {
  const leftText = normalizeQuestionText(left);
  const rightText = normalizeQuestionText(right);

  if (!leftText || !rightText) {
    return 0;
  }

  if (leftText === rightText) {
    return 1;
  }

  const leftTokens = questionTokens(leftText);
  const rightTokens = questionTokens(rightText);
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const jaccard = intersection / union;
  const containment = intersection / Math.min(leftTokens.size, rightTokens.size);
  return Math.max(jaccard, containment);
}

function isDuplicateQuestion(
  candidate: Record<string, unknown>,
  existingQuestionPayloads: Record<string, unknown>[],
): boolean {
  const question = candidate.question ?? candidate.title ?? candidate.description;
  return existingQuestionPayloads.some((existing) => {
    const existingQuestion = existing.question ?? existing.title ?? existing.description;
    return questionSimilarity(question, existingQuestion) >= 0.72;
  });
}

function openQuestionReadRank(artifact: SpecArtifact): number {
  const payload = artifact.payload as Record<string, unknown>;
  const status = String(payload.status ?? artifact.status);
  if (
    status === 'answered' ||
    status === 'confirmed' ||
    artifact.status === 'answered' ||
    artifact.status === 'confirmed' ||
    typeof payload.answer === 'string'
  ) {
    return 0;
  }

  if (status === 'open' || artifact.status === 'open') {
    return 1;
  }

  return 2;
}

function dedupeOpenQuestionArtifacts(artifacts: SpecArtifact[]): SpecArtifact[] {
  const result: SpecArtifact[] = [];

  for (const artifact of artifacts) {
    if (artifact.artifactType !== 'open_question') {
      result.push(artifact);
      continue;
    }

    const duplicateIndex = result.findIndex(
      (existing) =>
        existing.artifactType === 'open_question' &&
        isDuplicateQuestion(
          artifact.payload as Record<string, unknown>,
          [existing.payload as Record<string, unknown>],
        ),
    );

    if (duplicateIndex < 0) {
      result.push(artifact);
      continue;
    }

    if (openQuestionReadRank(artifact) < openQuestionReadRank(result[duplicateIndex])) {
      result[duplicateIndex] = artifact;
    }
  }

  return result;
}

function addArtifactLink(turn: ConversationTurn, artifact: SpecArtifact): ConversationTurn {
  const generatedArtifactIds = mergeIds(turn.generatedArtifactIds, [artifact.id]);
  const generatedOpenQuestionIds =
    artifact.artifactType === 'open_question'
      ? mergeIds(turn.generatedOpenQuestionIds, [artifact.id])
      : turn.generatedOpenQuestionIds;

  return {
    ...turn,
    generatedArtifactIds,
    generatedOpenQuestionIds,
  };
}

function withInferredArtifactLinks(
  turns: ConversationTurn[],
  artifacts: SpecArtifact[],
): ConversationTurn[] {
  const linked = turns.map((turn) => ({ ...turn }));
  const linkedById = new Map(linked.map((turn) => [turn.id, turn]));
  const explicitlyLinkedArtifactIds = new Set(
    linked.flatMap((turn) => turn.generatedArtifactIds),
  );

  for (const artifact of artifacts) {
    if (explicitlyLinkedArtifactIds.has(artifact.id)) {
      continue;
    }

    const payload = artifact.payload as Record<string, unknown>;
    const explicitTurnIds = mergeIds(
      stringArray(payload.sourceTurnId),
      stringArray(payload.sourceTurnIds),
    );
    const targetTurnIds =
      explicitTurnIds.length > 0
        ? explicitTurnIds
        : [
            linked
              .filter(
                (turn) =>
                  turn.role !== 'system' &&
                  Date.parse(turn.createdAt) <= Date.parse(artifact.createdAt),
              )
              .at(-1)?.id,
          ].filter((id): id is string => Boolean(id));

    for (const turnId of targetTurnIds) {
      const turn = linkedById.get(turnId);
      if (!turn) continue;
      const nextTurn = addArtifactLink(turn, artifact);
      Object.assign(turn, nextTurn);
    }
  }

  return linked;
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

    const initialMarkdown = `# Product Specification\n\n${rawIdea}\n`;
    await this.database.db.insert(specDocuments).values({
      id: createPrefixedId('doc'),
      sessionId: session.id,
      contentJson: richDocumentFromMarkdown(initialMarkdown),
      schemaVersion: richDocumentSchemaVersion,
      projectionStatus: 'synced',
      markdown: initialMarkdown,
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
    const conversation = withInferredArtifactLinks(turns, artifacts);
    const [document] = await this.database.db
      .select()
      .from(specDocuments)
      .where(eq(specDocuments.sessionId, sessionId))
      .orderBy(desc(specDocuments.updatedAt))
      .limit(1);
    const versions = await this.getVersions(sessionId);
    const review = await this.getLatestReview(sessionId);
    const commentThreads = await this.getDocumentCommentThreads(sessionId);

    return {
      project,
      session,
      conversation,
      artifacts,
      document: document ? mapDocument(document) : undefined,
      commentThreads,
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

    return dedupeOpenQuestionArtifacts(rows.map(mapArtifact));
  }

  async persistExtractedArtifacts(params: {
    sessionId: string;
    requirements?: LlmRequirementArtifact[];
    assumptions?: Assumption[];
    decisions?: Decision[];
    openQuestions?: LlmOpenQuestionArtifact[];
    risks?: LlmRiskArtifact[];
    acceptanceCriteria?: AcceptanceCriterion[];
    goals?: Goal[];
    nonGoals?: NonGoal[];
    scenarios?: UserScenario[];
    users?: TargetUser[];
    sourceTurnId?: string;
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
          payload: stripNullProperties(payload),
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
    const existingQuestionPayloads = existing
      .filter((artifact) => artifact.artifactType === 'open_question')
      .map((artifact) => artifact.payload as Record<string, unknown>);
    const inserted: SpecArtifact[] = [];

    for (const row of rows) {
      const key = artifactKey(row.artifactType, row.payload);
      if (existingKeys.has(key)) {
        continue;
      }
      if (
        row.artifactType === 'open_question' &&
        isDuplicateQuestion(row.payload, existingQuestionPayloads)
      ) {
        continue;
      }
      existingKeys.add(key);
      if (row.artifactType === 'open_question') {
        existingQuestionPayloads.push(row.payload);
      }

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
      if (params.sourceTurnId) {
        await this.appendArtifactLinksToTurn(params.sourceTurnId, inserted);
      }
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
    assistantMessage: string;
    thinkingSummary?: string | null;
    questions: Array<{
      question: string;
      whyItMatters: string;
      severity: OpenQuestion['severity'];
      answerMode?: OpenQuestion['answerMode'] | null;
      suggestedAnswers?: string[] | null;
      allowOtherAnswer?: boolean | null;
      otherAnswerLabel?: string | null;
    }>;
    sourceTurnId?: string;
  }): Promise<SpecArtifact[]> {
    const now = nowIso();
    const openQuestions = params.questions.map<OpenQuestion>((question) => ({
      id: createPrefixedId('oq'),
      sessionId: params.sessionId,
      question: question.question,
      whyItMatters: question.whyItMatters,
      severity: question.severity,
      status: 'open',
      answerMode:
        question.answerMode ??
        (question.suggestedAnswers?.length ? 'single_choice' : 'free_text'),
      suggestedAnswers: question.suggestedAnswers ?? undefined,
      allowOtherAnswer: question.allowOtherAnswer ?? undefined,
      otherAnswerLabel: question.otherAnswerLabel ?? undefined,
      relatedRequirementIds: [],
      createdAt: now,
      updatedAt: now,
    }));

    const inserted = await this.persistExtractedArtifacts({
      sessionId: params.sessionId,
      openQuestions,
    });

    const assistantMessage =
      params.assistantMessage.trim() ||
      'I processed the latest message and updated the specification context.';
    const questionList = inserted
      .filter((artifact) => artifact.artifactType === 'open_question')
      .slice(0, 5)
      .map((artifact, index) => {
        const payload = artifact.payload as Record<string, unknown>;
        return `${index + 1}. ${String(payload.question ?? artifact.id)}`;
      })
      .join('\n');
    const content = questionList
      ? `${assistantMessage}\n\n${questionList}`.trim()
      : assistantMessage;

    await this.addConversationTurn(params.sessionId, 'assistant', content, {
      sourceTurnId: params.sourceTurnId,
      thinkingSummary: params.thinkingSummary?.trim() || undefined,
      generatedArtifactIds: inserted.map((artifact) => artifact.id),
      generatedOpenQuestionIds: inserted
        .filter((artifact) => artifact.artifactType === 'open_question')
        .map((artifact) => artifact.id),
    });

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
    const contentJson = richDocumentFromMarkdown(params.markdown);
    const saved = await this.createVersion({
      sessionId: params.sessionId,
      version,
      status: 'draft',
      markdownSnapshot: params.markdown,
      documentContentSnapshot: contentJson,
      jsonSnapshot: spec,
      changeSummary: params.changeSummary,
      createdBy: params.createdBy,
    });

    await this.upsertDocument({
      sessionId: params.sessionId,
      markdown: params.markdown,
      contentJson,
      versionId: saved.id,
      dirty: false,
      projectionStatus: 'synced',
    });
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
    const document = await this.getDocument(sessionId);
    if (document && document.projectionStatus !== 'synced') {
      throw new ConflictException({
        message: 'Approval blocked.',
        errors: ['Document changes are not synchronized with structured artifacts.'],
        warnings: [],
      });
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
      documentContentSnapshot: latestVersion.documentContentSnapshot,
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
    await this.upsertDocument({
      sessionId,
      markdown: latestVersion.markdownSnapshot,
      contentJson:
        latestVersion.documentContentSnapshot ??
        richDocumentFromMarkdown(latestVersion.markdownSnapshot),
      versionId: saved.id,
      dirty: false,
      projectionStatus: 'synced',
    });
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
    contentJson?: RichDocumentContent;
    projectionStatus?: DocumentProjectionStatus;
    baseVersionId?: string;
    changeSummary: string;
  }): Promise<Record<string, unknown>> {
    const session = await this.getSession(params.sessionId);
    const latestVersion = await this.getLatestVersion(params.sessionId);
    const nextVersion = nextDraftVersion(latestVersion, 'patch');
    const spec = await this.assembleSpec(params.sessionId, nextVersion);
    const contentJson = params.contentJson ?? richDocumentFromMarkdown(params.markdown);
    const saved = await this.createVersion({
      sessionId: params.sessionId,
      version: nextVersion,
      status: 'draft',
      markdownSnapshot: params.markdown,
      documentContentSnapshot: contentJson,
      jsonSnapshot: { ...spec, meta: { ...spec.meta, status: 'draft' } },
      changeSummary: params.changeSummary,
      createdBy: 'user',
    });
    const documentId = await this.upsertDocument({
      sessionId: params.sessionId,
      markdown: params.markdown,
      contentJson,
      versionId: saved.id,
      dirty: false,
      projectionStatus: params.projectionStatus ?? 'stale',
    });
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

  async getDocument(sessionId: string): Promise<MappedDocument | undefined> {
    const [document] = await this.database.db
      .select()
      .from(specDocuments)
      .where(eq(specDocuments.sessionId, sessionId))
      .orderBy(desc(specDocuments.updatedAt))
      .limit(1);

    return document ? mapDocument(document) : undefined;
  }

  async getDocumentCommentThreads(sessionId: string): Promise<DocumentCommentThread[]> {
    const threads = await this.database.db
      .select()
      .from(documentCommentThreads)
      .where(eq(documentCommentThreads.sessionId, sessionId))
      .orderBy(desc(documentCommentThreads.updatedAt));
    if (threads.length === 0) {
      return [];
    }

    const threadIds = new Set(threads.map((thread) => thread.id));
    const comments = (
      await this.database.db
        .select()
        .from(documentComments)
        .orderBy(documentComments.createdAt)
    )
      .filter((comment) => threadIds.has(comment.threadId))
      .map(mapComment);
    const suggestions = (
      await this.database.db
        .select()
        .from(documentSuggestions)
        .orderBy(desc(documentSuggestions.createdAt))
    )
      .filter((suggestion) => threadIds.has(suggestion.threadId))
      .map(mapSuggestion);

    return threads.map((thread) =>
      mapCommentThread(
        thread,
        comments.filter((comment) => comment.threadId === thread.id),
        suggestions.filter((suggestion) => suggestion.threadId === thread.id),
      ),
    );
  }

  async getDocumentCommentThread(threadId: string): Promise<DocumentCommentThread> {
    const row = await this.getDocumentCommentThreadRow(threadId);
    const [thread] = await this.getDocumentCommentThreads(row.sessionId).then((threads) =>
      threads.filter((item) => item.id === threadId),
    );
    return thread ?? mapCommentThread(row);
  }

  async createDocumentCommentThread(params: {
    sessionId: string;
    anchor: DocumentAnchor;
    selectedText?: string;
    content: string;
    createdBy?: DocumentCommentThread['createdBy'];
  }): Promise<DocumentCommentThread> {
    const session = await this.getSession(params.sessionId);
    const document = await this.getDocument(params.sessionId);
    const now = new Date();
    const [thread] = await this.database.db
      .insert(documentCommentThreads)
      .values({
        id: createPrefixedId('dct'),
        sessionId: params.sessionId,
        documentId: document?.id,
        versionId: document?.currentVersionId ?? session.currentVersionId,
        status: 'open',
        anchor: params.anchor as Record<string, unknown>,
        selectedText: params.selectedText,
        createdBy: params.createdBy ?? 'user',
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const comment = await this.addDocumentComment(thread.id, {
      author: params.createdBy ?? 'user',
      content: params.content,
    });

    await this.events.append({
      aggregateId: params.sessionId,
      aggregateType: 'spec_session',
      eventType: 'document_comment_thread.created',
      payload: { threadId: thread.id },
    });

    return mapCommentThread(thread, [comment], []);
  }

  async addDocumentComment(
    threadId: string,
    params: { author: DocumentComment['author']; content: string },
  ): Promise<DocumentComment> {
    const thread = await this.getDocumentCommentThreadRow(threadId);
    const [comment] = await this.database.db
      .insert(documentComments)
      .values({
        id: createPrefixedId('dcm'),
        threadId,
        author: params.author,
        content: params.content,
        createdAt: new Date(),
      })
      .returning();
    await this.database.db
      .update(documentCommentThreads)
      .set({ updatedAt: new Date() })
      .where(eq(documentCommentThreads.id, threadId));

    await this.events.append({
      aggregateId: thread.sessionId,
      aggregateType: 'spec_session',
      eventType: 'document_comment.added',
      payload: { threadId, commentId: comment.id, author: params.author },
    });

    return mapComment(comment);
  }

  async updateDocumentCommentThread(
    threadId: string,
    params: { status: DocumentCommentThreadStatus },
  ): Promise<DocumentCommentThread> {
    await this.getDocumentCommentThreadRow(threadId);
    const [updated] = await this.database.db
      .update(documentCommentThreads)
      .set({ status: params.status, updatedAt: new Date() })
      .where(eq(documentCommentThreads.id, threadId))
      .returning();

    const [thread] = await this.getDocumentCommentThreads(updated.sessionId).then((threads) =>
      threads.filter((item) => item.id === threadId),
    );
    return thread ?? mapCommentThread(updated);
  }

  async updateDocumentSuggestion(
    suggestionId: string,
    params: { status: DocumentSuggestionStatus },
  ): Promise<DocumentSuggestion> {
    const [existing] = await this.database.db
      .select()
      .from(documentSuggestions)
      .where(eq(documentSuggestions.id, suggestionId))
      .limit(1);

    if (!existing) {
      throwNotFound('Document suggestion', suggestionId);
    }

    const [updated] = await this.database.db
      .update(documentSuggestions)
      .set({
        status: params.status,
        acceptedAt: params.status === 'accepted' ? new Date() : existing.acceptedAt,
        updatedAt: new Date(),
      })
      .where(eq(documentSuggestions.id, suggestionId))
      .returning();

    return mapSuggestion(updated);
  }

  async enqueueDocumentAssistant(params: {
    sessionId: string;
    mode: 'comment' | 'suggestion';
    prompt: string;
    threadId?: string;
    anchor?: DocumentAnchor;
    selectedText?: string;
  }): Promise<Record<string, unknown>> {
    const session = await this.getSession(params.sessionId);
    const job = await this.jobs.createJob({
      type: 'document_assistant',
      payload: {
        projectId: session.projectId,
        sessionId: params.sessionId,
        mode: params.mode,
        prompt: params.prompt,
        threadId: params.threadId,
        anchor: params.anchor,
        selectedText: params.selectedText,
      },
    });

    return { jobId: job.id, type: job.type, status: job.status };
  }

  async saveDocumentAssistantResult(params: {
    sessionId: string;
    mode: 'comment' | 'suggestion';
    prompt: string;
    threadId?: string;
    anchor?: DocumentAnchor;
    selectedText?: string;
    assistantMessage: string;
    replacementMarkdown?: string;
    replacementContentJson?: RichDocumentContent;
  }): Promise<DocumentCommentThread> {
    const thread = params.threadId
      ? mapCommentThread(await this.getDocumentCommentThreadRow(params.threadId))
      : await this.createDocumentCommentThread({
          sessionId: params.sessionId,
          anchor: params.anchor ?? {},
          selectedText: params.selectedText,
          content: params.prompt,
        });

    const comment = await this.addDocumentComment(thread.id, {
      author: 'assistant',
      content: params.assistantMessage,
    });
    let suggestions = thread.suggestions;
    if (params.mode === 'suggestion') {
      const now = new Date();
      const [suggestion] = await this.database.db
        .insert(documentSuggestions)
        .values({
          id: createPrefixedId('dsg'),
          threadId: thread.id,
          status: 'pending',
          replacementMarkdown: params.replacementMarkdown,
          replacementContentJson: params.replacementContentJson,
          rationale: params.assistantMessage,
          createdBy: 'assistant',
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      suggestions = [mapSuggestion(suggestion), ...suggestions];
    }

    return {
      ...thread,
      comments: [...thread.comments, comment],
      suggestions,
      updatedAt: new Date().toISOString(),
    };
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
    documentContentSnapshot?: RichDocumentContent;
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
        documentContentSnapshot: params.documentContentSnapshot,
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

  private async appendArtifactLinksToTurn(
    turnId: string,
    artifacts: SpecArtifact[],
  ): Promise<void> {
    const [turn] = await this.database.db
      .select()
      .from(conversationTurns)
      .where(eq(conversationTurns.id, turnId))
      .limit(1);

    if (!turn) {
      return;
    }

    const metadata = turn.metadata as Record<string, unknown>;
    const nextMetadata = {
      ...metadata,
      generatedArtifactIds: mergeIds(
        stringArray(metadata.generatedArtifactIds),
        artifacts.map((artifact) => artifact.id),
      ),
      generatedOpenQuestionIds: mergeIds(
        stringArray(metadata.generatedOpenQuestionIds),
        artifacts
          .filter((artifact) => artifact.artifactType === 'open_question')
          .map((artifact) => artifact.id),
      ),
    };

    await this.database.db
      .update(conversationTurns)
      .set({ metadata: nextMetadata })
      .where(eq(conversationTurns.id, turnId));
  }

  private async getDocumentCommentThreadRow(threadId: string): Promise<DocumentCommentThreadRow> {
    const [thread] = await this.database.db
      .select()
      .from(documentCommentThreads)
      .where(eq(documentCommentThreads.id, threadId))
      .limit(1);

    if (!thread) {
      throwNotFound('Document comment thread', threadId);
    }

    return thread;
  }

  private async upsertDocument(params: {
    sessionId: string;
    markdown: string;
    contentJson: RichDocumentContent;
    versionId: string;
    dirty: boolean;
    projectionStatus: DocumentProjectionStatus;
  }): Promise<string> {
    const [existing] = await this.database.db
      .select()
      .from(specDocuments)
      .where(eq(specDocuments.sessionId, params.sessionId))
      .limit(1);

    if (existing) {
      await this.database.db
        .update(specDocuments)
        .set({
          markdown: params.markdown,
          contentJson: params.contentJson,
          schemaVersion: richDocumentSchemaVersion,
          projectionStatus: params.projectionStatus,
          currentVersionId: params.versionId,
          dirty: params.dirty,
          updatedAt: new Date(),
        })
        .where(eq(specDocuments.id, existing.id));
      return existing.id;
    }

    const id = createPrefixedId('doc');
    await this.database.db.insert(specDocuments).values({
      id,
      sessionId: params.sessionId,
      markdown: params.markdown,
      contentJson: params.contentJson,
      schemaVersion: richDocumentSchemaVersion,
      projectionStatus: params.projectionStatus,
      currentVersionId: params.versionId,
      dirty: params.dirty,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return id;
  }
}
