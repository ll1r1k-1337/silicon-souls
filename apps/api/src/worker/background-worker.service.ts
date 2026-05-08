import { Injectable, Logger } from '@nestjs/common';
import { createPrefixedId, validateApprovalReadiness, type ReviewReportPayload } from '@sdd/domain';
import type { Assumption, OpenQuestion, ProductSpecJson, SpecArtifact } from '@sdd/domain';
import { BackgroundJobsService } from '../modules/background-jobs/background-jobs.service';
import { CriticChain } from '../modules/llm/chains/critic.chain';
import { ExtractorChain } from '../modules/llm/chains/extractor.chain';
import { InterviewerChain } from '../modules/llm/chains/interviewer.chain';
import { ReviewerChain } from '../modules/llm/chains/reviewer.chain';
import { SpecWriterChain } from '../modules/llm/chains/spec-writer.chain';
import type { LlmMessage } from '../modules/llm/llm.interfaces';
import { LlmProviderResolver } from '../modules/llm/llm-provider.resolver';
import { SpecSessionsService } from '../modules/spec-sessions/spec-sessions.service';
import type { BackgroundJobRow } from '../shared/database/schema';

@Injectable()
export class BackgroundWorkerService {
  private readonly logger = new Logger(BackgroundWorkerService.name);
  private readonly workerId = createPrefixedId('job');

  constructor(
    private readonly jobs: BackgroundJobsService,
    private readonly sessions: SpecSessionsService,
    private readonly extractor: ExtractorChain,
    private readonly interviewer: InterviewerChain,
    private readonly specWriter: SpecWriterChain,
    private readonly critic: CriticChain,
    private readonly reviewer: ReviewerChain,
    private readonly providerResolver: LlmProviderResolver,
  ) {}

  async processOnce(): Promise<boolean> {
    const job = await this.jobs.claimNext(this.workerId);
    if (!job) {
      return false;
    }

    try {
      const result = await this.handleJob(job);
      await this.jobs.completeJob(job.id, result);
      return true;
    } catch (error) {
      this.logger.error(`Job failed: ${job.id}`, error instanceof Error ? error.stack : String(error));
      await this.jobs.failJob(job.id, error);
      return true;
    }
  }

  private async handleJob(job: BackgroundJobRow): Promise<Record<string, unknown>> {
    if (job.type === 'extract_artifacts') {
      return this.extractArtifacts(job);
    }

    if (job.type === 'generate_clarifying_questions') {
      return this.generateClarifyingQuestions(job);
    }

    if (job.type === 'generate_draft') {
      return this.generateDraft(job);
    }

    if (job.type === 'run_review' || job.type === 'run_critic' || job.type === 'run_reviewer') {
      return this.runReview(job);
    }

    if (job.type === 'apply_change_request') {
      return this.applyChangeRequest(job);
    }

    if (job.type === 'document_assistant') {
      return this.handleDocumentAssistant(job);
    }

    if (job.type === 'export_bundle') {
      return { skipped: true, reason: 'Exports are generated on demand by API.' };
    }

    return { skipped: true, reason: `Unsupported job type: ${job.type}` };
  }

  private async extractArtifacts(job: BackgroundJobRow): Promise<Record<string, unknown>> {
    const payload = job.payload as {
      projectId: string;
      sessionId: string;
      messageId: string;
      userMessage: string;
    };
    const conversationContext = await this.sessions.getConversation(payload.sessionId);
    const currentSpec = await this.safeAssemble(payload.sessionId);
    const output = await this.extractor.run(
      {
        sessionId: payload.sessionId,
        userMessage: payload.userMessage,
        conversationContext,
        currentSpec,
      },
      {
        projectId: payload.projectId,
        sessionId: payload.sessionId,
        chainName: 'extractor',
        traceId: createPrefixedId('llm'),
        sourceTurnId: payload.messageId,
      },
    );
    const artifacts = await this.sessions.persistExtractedArtifacts({
      sessionId: payload.sessionId,
      requirements: output.requirements,
      assumptions: output.assumptions,
      decisions: output.decisions,
      openQuestions: output.openQuestions,
      risks: output.risks,
      acceptanceCriteria: output.acceptanceCriteria,
      sourceTurnId: payload.messageId,
    });

    return {
      type: 'spec_artifacts',
      count: artifacts.length,
      artifactIds: artifacts.map((artifact) => artifact.id),
    };
  }

  private async generateClarifyingQuestions(
    job: BackgroundJobRow,
  ): Promise<Record<string, unknown>> {
    const payload = job.payload as {
      projectId: string;
      sessionId: string;
      sourceTurnId?: string;
    };
    const artifacts = await this.sessions.getArtifacts(payload.sessionId);
    const currentSpec = await this.safeAssemble(payload.sessionId);
    const output = await this.interviewer.run(
      {
        rawIdea: currentSpec?.problem.description ?? '',
        currentSpec,
        openQuestions: artifacts
          .filter((artifact) => artifact.artifactType === 'open_question')
          .map(toInterviewerOpenQuestion),
        assumptions: artifacts
          .filter((artifact) => artifact.artifactType === 'assumption')
          .map((artifact) => artifact.payload as Assumption),
      },
      {
        projectId: payload.projectId,
        sessionId: payload.sessionId,
        chainName: 'interviewer',
        traceId: createPrefixedId('llm'),
        sourceTurnId: payload.sourceTurnId,
      },
    );
    const inserted = await this.sessions.persistInterviewerQuestions({
      sessionId: payload.sessionId,
      assistantMessage:
        output.assistantMessage ||
        'I processed the latest message and updated the specification context.',
      thinkingSummary: output.thinkingSummary,
      questions: output.questions.slice(0, 5),
      sourceTurnId: payload.sourceTurnId,
    });

    return {
      type: 'open_questions',
      count: inserted.length,
      artifactIds: inserted.map((artifact) => artifact.id),
    };
  }

  private async generateDraft(job: BackgroundJobRow): Promise<Record<string, unknown>> {
    const payload = job.payload as { projectId: string; sessionId: string };
    const spec = await this.sessions.assembleSpec(payload.sessionId);
    const output = await this.specWriter.run(
      { spec, targetFormat: 'markdown' },
      {
        projectId: payload.projectId,
        sessionId: payload.sessionId,
        chainName: 'spec_writer',
        traceId: createPrefixedId('llm'),
      },
    );
    const version = await this.sessions.saveGeneratedDraft({
      sessionId: payload.sessionId,
      spec,
      markdown: output.markdown,
      changeSummary: 'Generated draft specification from structured artifacts.',
      createdBy: 'assistant',
    });

    return {
      type: 'spec_version',
      id: version.id,
      version: version.version,
    };
  }

  private async runReview(job: BackgroundJobRow): Promise<Record<string, unknown>> {
    const payload = job.payload as { projectId: string; sessionId: string };
    const latest = await this.sessions.getLatestVersion(payload.sessionId);
    const spec = latest?.jsonSnapshot ?? (await this.sessions.assembleSpec(payload.sessionId));
    const criticOutput = await this.critic.run(
      { spec },
      {
        projectId: payload.projectId,
        sessionId: payload.sessionId,
        chainName: 'critic',
        traceId: createPrefixedId('llm'),
        versionId: latest?.id,
      },
    );
    const reviewerOutput = await this.reviewer.run(
      { spec, criticOutput },
      {
        projectId: payload.projectId,
        sessionId: payload.sessionId,
        chainName: 'reviewer',
        traceId: createPrefixedId('llm'),
        versionId: latest?.id,
      },
    );
    const domainValidation = validateApprovalReadiness(spec);
    const blockingGaps = criticOutput.gaps
      .filter((gap) => gap.severity === 'blocking')
      .map((gap) => `${gap.section}: ${gap.description}`);
    const contradictions = criticOutput.contradictions.map(
      (contradiction) => contradiction.description,
    );
    const blockingIssues = Array.from(
      new Set([...domainValidation.errors, ...reviewerOutput.blockingIssues, ...blockingGaps]),
    );
    const payloadReport: ReviewReportPayload = {
      canApprove:
        domainValidation.canApprove &&
        reviewerOutput.canApprove &&
        blockingGaps.length === 0 &&
        contradictions.length === 0,
      blockingIssues,
      warnings: domainValidation.warnings,
      missingSections: criticOutput.gaps.map((gap) => gap.section),
      contradictions,
      recommendedChanges: Array.from(
        new Set([
          ...reviewerOutput.recommendedChanges,
          ...criticOutput.gaps.map((gap) => gap.recommendation),
        ]),
      ),
      approvalSummary: reviewerOutput.approvalSummary,
    };

    if (criticOutput.suggestedQuestions.length > 0) {
      await this.sessions.persistExtractedArtifacts({
        sessionId: payload.sessionId,
        openQuestions: criticOutput.suggestedQuestions,
      });
    }

    const report = await this.sessions.saveReviewReport({
      sessionId: payload.sessionId,
      versionId: latest?.id,
      payload: payloadReport,
    });
    await this.sessions.markReviewOutcome(payload.sessionId, payloadReport.canApprove);

    return {
      type: 'review_report',
      id: report.id,
      canApprove: payloadReport.canApprove,
      blockingIssues: payloadReport.blockingIssues.length,
    };
  }

  private async applyChangeRequest(job: BackgroundJobRow): Promise<Record<string, unknown>> {
    const payload = job.payload as {
      sessionId: string;
      changeRequest: string;
      baseVersionId?: string;
    };
    const latest = await this.sessions.getLatestVersion(payload.sessionId);
    const currentMarkdown =
      latest?.markdownSnapshot ??
      `# Product Specification\n\n## Change Requests\n\n${payload.changeRequest}\n`;
    const result = await this.sessions.directEdit({
      sessionId: payload.sessionId,
      markdown: `${currentMarkdown.trim()}\n\n## Change Request\n\n${payload.changeRequest}\n`,
      baseVersionId: payload.baseVersionId ?? latest?.id,
      changeSummary: `Applied change request: ${payload.changeRequest.slice(0, 120)}`,
    });

    return {
      type: 'change_request',
      ...result,
    };
  }

  private async handleDocumentAssistant(job: BackgroundJobRow): Promise<Record<string, unknown>> {
    const payload = job.payload as {
      sessionId: string;
      mode?: 'comment' | 'suggestion';
      prompt: string;
      threadId?: string;
      anchor?: { from?: number; to?: number; selectedText?: string; documentVersionId?: string };
      selectedText?: string;
    };
    const selection = payload.selectedText || payload.anchor?.selectedText;
    const mode = payload.mode ?? 'comment';
    const provider = await this.providerResolver.resolve();
    const messages = await this.buildDocumentAssistantMessages({
      sessionId: payload.sessionId,
      mode,
      prompt: payload.prompt,
      threadId: payload.threadId,
      selection,
    });
    const response = await provider.invoke(messages, {
      traceId: createPrefixedId('llm'),
      metadata: {
        chainName: 'document_assistant',
        sessionId: payload.sessionId,
        mode,
        threadId: payload.threadId,
      },
    });
    const assistantMessage =
      response.content.trim() ||
      'I reviewed the request, but could not produce a useful response.';
    const thread = await this.sessions.saveDocumentAssistantResult({
      sessionId: payload.sessionId,
      mode,
      prompt: payload.prompt,
      threadId: payload.threadId,
      anchor: payload.anchor,
      selectedText: selection,
      assistantMessage,
      replacementMarkdown: mode === 'suggestion' ? assistantMessage : undefined,
    });

    return {
      type: 'document_assistant',
      threadId: thread.id,
      mode,
    };
  }

  private async buildDocumentAssistantMessages(params: {
    sessionId: string;
    mode: 'comment' | 'suggestion';
    prompt: string;
    threadId?: string;
    selection?: string;
  }): Promise<LlmMessage[]> {
    const [document, currentSpec, review, threads] = await Promise.all([
      this.sessions.getDocument(params.sessionId),
      this.safeAssemble(params.sessionId),
      this.sessions.getLatestReview(params.sessionId),
      params.threadId ? this.sessions.getDocumentCommentThreads(params.sessionId) : Promise.resolve([]),
    ]);
    const activeThread = threads.find((thread) => thread.id === params.threadId);
    const reviewPayload = review?.payload as ReviewReportPayload | undefined;
    const blockers = [
      ...(reviewPayload?.blockingIssues ?? []),
      ...(reviewPayload?.contradictions ?? []),
    ];
    const documentExcerpt = (document?.markdown ?? '').slice(0, 8000);
    const specExcerpt = currentSpec ? JSON.stringify(currentSpec, null, 2).slice(0, 8000) : undefined;
    const threadTranscript = activeThread
      ? activeThread.comments
          .map((comment) => `${comment.author}: ${comment.content}`)
          .join('\n')
          .slice(0, 4000)
      : undefined;

    return [
      {
        role: 'system',
        content: [
          'You help resolve a product specification document.',
          'Use the current document, structured spec, review blockers, selected text, and comment thread as source context.',
          params.mode === 'suggestion'
            ? 'Return only the replacement Markdown for the selected section or the smallest useful document change. Do not wrap it in code fences.'
            : 'Return a concise assistant reply with concrete next steps or proposed wording.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify(
          {
            mode: params.mode,
            userRequest: params.prompt,
            selectedText: params.selection,
            reviewBlockers: blockers,
            thread: activeThread
              ? {
                  id: activeThread.id,
                  status: activeThread.status,
                  selectedText: activeThread.selectedText,
                  transcript: threadTranscript,
                }
              : undefined,
            documentMarkdownExcerpt: documentExcerpt,
            structuredSpecExcerpt: specExcerpt,
          },
          null,
          2,
        ),
      },
    ];
  }

  private async safeAssemble(sessionId: string): Promise<ProductSpecJson | undefined> {
    try {
      return await this.sessions.assembleSpec(sessionId);
    } catch {
      return undefined;
    }
  }
}

const openQuestionStatuses = new Set<OpenQuestion['status']>([
  'open',
  'answered',
  'converted_to_assumption',
  'dismissed',
]);

function toInterviewerOpenQuestion(artifact: SpecArtifact): OpenQuestion {
  const payload = artifact.payload as OpenQuestion & Record<string, unknown>;
  return {
    ...payload,
    status: normalizeOpenQuestionStatus(payload.status, artifact.status, payload.answer),
  };
}

function normalizeOpenQuestionStatus(
  payloadStatus: unknown,
  artifactStatus: string,
  answer: unknown,
): OpenQuestion['status'] {
  if (
    typeof payloadStatus === 'string' &&
    openQuestionStatuses.has(payloadStatus as OpenQuestion['status'])
  ) {
    return payloadStatus as OpenQuestion['status'];
  }

  if (artifactStatus === 'answered' || (typeof answer === 'string' && answer.trim())) {
    return 'answered';
  }

  if (artifactStatus === 'confirmed' || artifactStatus === 'rejected') {
    return 'dismissed';
  }

  return 'open';
}
