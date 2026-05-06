import { Injectable, Logger } from '@nestjs/common';
import { createPrefixedId, validateApprovalReadiness, type ReviewReportPayload } from '@sdd/domain';
import type { Assumption, OpenQuestion, ProductSpecJson } from '@sdd/domain';
import { BackgroundJobsService } from '../modules/background-jobs/background-jobs.service';
import { CriticChain } from '../modules/llm/chains/critic.chain';
import { ExtractorChain } from '../modules/llm/chains/extractor.chain';
import { InterviewerChain } from '../modules/llm/chains/interviewer.chain';
import { ReviewerChain } from '../modules/llm/chains/reviewer.chain';
import { SpecWriterChain } from '../modules/llm/chains/spec-writer.chain';
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
          .map((artifact) => artifact.payload as OpenQuestion),
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
      questions: output.questions.slice(0, 5),
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

  private async safeAssemble(sessionId: string): Promise<ProductSpecJson | undefined> {
    try {
      return await this.sessions.assembleSpec(sessionId);
    } catch {
      return undefined;
    }
  }
}
