import { defineStore } from 'pinia';
import type { ChatCommand, SpecArtifact } from '@sdd/domain';
import { apiRequest } from '@/shared/api/client';
import type {
  DocumentAnchor,
  DocumentCommentThread,
  DocumentSuggestion,
  JobRef,
  RichDocumentContent,
  WorkspaceState,
} from '@/types';
import { useBackgroundJobStore } from './backgroundJobStore';
import { useLocalDraftStore } from './localDraftStore';

interface ArtifactUpdateResponse {
  artifact: SpecArtifact;
  reaction?: {
    jobs?: JobRef[];
  };
}

interface ChatContextEnvelope {
  selectedText?: string;
  source?: string;
}

interface ChatTextEnvelope {
  kind: 'text';
  text: string;
  context?: ChatContextEnvelope;
}

interface ChatCommandEnvelope {
  kind: 'command';
  command: ChatCommand;
  context?: ChatContextEnvelope;
}

interface ChatQuestionnaireAnswerEnvelope {
  questionArtifactId: string;
  selectedAnswers?: string[];
  customAnswer?: string;
  textAnswer?: string;
}

interface ChatQuestionnaireAnswersEnvelope {
  kind: 'questionnaire_answers';
  sourceMessageId: string;
  answers: ChatQuestionnaireAnswerEnvelope[];
}

type ChatEnvelope = ChatTextEnvelope | ChatCommandEnvelope | ChatQuestionnaireAnswersEnvelope;

function trackJobs(jobs: Array<JobRef | undefined>, onComplete?: () => Promise<void>): void {
  const definedJobs = jobs.filter((job): job is JobRef => Boolean(job));
  if (definedJobs.length === 0) return;

  const jobStore = useBackgroundJobStore();
  definedJobs.forEach((job) => jobStore.track(job));
  void jobStore.poll(
    definedJobs.map((job) => job.jobId),
    onComplete,
  );
}

export const useSpecSessionStore = defineStore('specSessionStore', {
  state: () => ({
    workspace: undefined as WorkspaceState | undefined,
    loading: false,
    error: undefined as string | undefined,
  }),
  getters: {
    session: (state) => state.workspace?.session,
    document: (state) => state.workspace?.document,
    artifacts: (state) => state.workspace?.artifacts ?? [],
    commentThreads: (state) => state.workspace?.commentThreads ?? [],
    review: (state) => state.workspace?.review,
    versions: (state) => state.workspace?.versions ?? [],
    canApprove: (state) => Boolean(state.workspace?.review?.canApprove),
  },
  actions: {
    async startSession(projectId: string, rawIdea: string) {
      const response = await apiRequest<{ sessionId: string }>(
        `/projects/${projectId}/spec-sessions`,
        {
          method: 'POST',
          body: JSON.stringify({ rawIdea }),
        },
      );
      await this.loadWorkspace(response.sessionId);
      return response.sessionId;
    },
    async loadWorkspace(sessionId: string) {
      this.loading = true;
      this.error = undefined;
      try {
        this.workspace = await apiRequest<WorkspaceState>(`/spec-sessions/${sessionId}`);
        const drafts = useLocalDraftStore();
        drafts.hydrate(sessionId);
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
    async sendMessage(message: string | ChatEnvelope) {
      if (!this.workspace) return;
      const payload =
        typeof message === 'string' ? ({ message } as Record<string, unknown>) : message;
      const response = await apiRequest<{ jobs: JobRef[] }>(
        `/spec-sessions/${this.workspace.session.id}/messages`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
      const jobStore = useBackgroundJobStore();
      response.jobs.forEach((job) => jobStore.track(job));
      await this.loadWorkspace(this.workspace.session.id);
      void jobStore.poll(
        response.jobs.map((job) => job.jobId),
        async () => this.workspace && this.loadWorkspace(this.workspace.session.id),
      );
    },
    async sendCommand(command: ChatCommand, context?: ChatContextEnvelope) {
      await this.sendMessage({ kind: 'command', command, ...(context ? { context } : {}) });
    },
    async sendQuestionnaireAnswers(input: {
      sourceMessageId: string;
      answers: ChatQuestionnaireAnswerEnvelope[];
    }) {
      await this.sendMessage({
        kind: 'questionnaire_answers',
        sourceMessageId: input.sourceMessageId,
        answers: input.answers,
      });
    },
    async generateDraft() {
      await this.sendCommand('generate_draft');
    },
    async reviewSpec() {
      await this.sendCommand('review_spec');
    },
    async approveSpec() {
      if (!this.workspace) return;
      await apiRequest(`/spec-sessions/${this.workspace.session.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await this.loadWorkspace(this.workspace.session.id);
    },
    async saveDocument(
      contentJson: RichDocumentContent,
      markdown: string,
      changeSummary = 'Direct document edit',
      projectionStatus: 'synced' | 'stale' | 'failed' = 'stale',
    ) {
      if (!this.workspace) return;
      await apiRequest(`/spec-sessions/${this.workspace.session.id}/document`, {
        method: 'PATCH',
        body: JSON.stringify({
          contentJson,
          markdown,
          projectionStatus,
          baseVersionId: this.workspace.session.currentVersionId,
          changeSummary,
        }),
      });
      useLocalDraftStore().clearDraft(this.workspace.session.id);
      await this.loadWorkspace(this.workspace.session.id);
    },
    async createCommentThread(input: {
      anchor: DocumentAnchor;
      selectedText?: string;
      content: string;
    }) {
      if (!this.workspace) return undefined;
      const response = await apiRequest<{ thread: DocumentCommentThread; job?: JobRef }>(
        `/spec-sessions/${this.workspace.session.id}/document/comments`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      );
      this.workspace.commentThreads = [response.thread, ...this.workspace.commentThreads];
      trackJobs([response.job], async () => {
        if (this.workspace) {
          await this.loadWorkspace(this.workspace.session.id);
        }
      });
      return response.thread;
    },
    async addComment(threadId: string, content: string) {
      if (!this.workspace) return;
      const response = await apiRequest<{ job?: JobRef }>(`/document-comment-threads/${threadId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      trackJobs([response.job], async () => {
        if (this.workspace) {
          await this.loadWorkspace(this.workspace.session.id);
        }
      });
      await this.loadWorkspace(this.workspace.session.id);
    },
    async updateCommentThread(threadId: string, status: 'open' | 'resolved') {
      if (!this.workspace) return;
      await apiRequest(`/document-comment-threads/${threadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await this.loadWorkspace(this.workspace.session.id);
    },
    async updateSuggestion(suggestionId: string, status: 'pending' | 'accepted' | 'rejected') {
      if (!this.workspace) return undefined;
      const response = await apiRequest<{ suggestion: DocumentSuggestion }>(
        `/document-suggestions/${suggestionId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        },
      );
      await this.loadWorkspace(this.workspace.session.id);
      return response.suggestion;
    },
    async requestDocumentAssistant(input: {
      mode: 'comment' | 'suggestion';
      prompt: string;
      threadId?: string;
      anchor?: DocumentAnchor;
      selectedText?: string;
    }) {
      if (!this.workspace) return;
      const response = await apiRequest<JobRef>(
        `/spec-sessions/${this.workspace.session.id}/document/assistant`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      );
      const jobStore = useBackgroundJobStore();
      jobStore.track(response);
      void jobStore.poll([response.jobId], async () => {
        if (this.workspace) {
          await this.loadWorkspace(this.workspace.session.id);
        }
      });
    },
    async updateArtifact(artifact: SpecArtifact, action: 'confirm' | 'reject' | 'edit') {
      await this.patchArtifact(artifact, { action });
    },
    async saveOpenQuestionAnswer(
      artifact: SpecArtifact,
      answer: string,
      selectedAnswers: string[] = [],
      customAnswer = '',
    ) {
      await this.patchArtifact(artifact, {
        status: 'answered',
        payload: {
          answer,
          selectedAnswers,
          customAnswer,
          status: 'answered',
        },
      });
    },
    async patchArtifact(
      artifact: SpecArtifact,
      body: {
        action?: 'confirm' | 'reject' | 'edit';
        status?: string;
        payload?: Record<string, unknown>;
      },
    ) {
      const response = await apiRequest<ArtifactUpdateResponse>(`/spec-artifacts/${artifact.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      const jobs = response.reaction?.jobs ?? [];
      const jobStore = useBackgroundJobStore();
      jobs.forEach((job) => jobStore.track(job));
      if (this.workspace) {
        await this.loadWorkspace(this.workspace.session.id);
      }
      if (jobs.length > 0) {
        void jobStore.poll(
          jobs.map((job) => job.jobId),
          async () => this.workspace && this.loadWorkspace(this.workspace.session.id),
        );
      }
    },
    async enqueueAndPoll(action: 'generate-draft' | 'review') {
      if (!this.workspace) return;
      const response = await apiRequest<JobRef>(
        `/spec-sessions/${this.workspace.session.id}/${action}`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      const jobStore = useBackgroundJobStore();
      jobStore.track(response);
      void jobStore.poll([response.jobId], async () => {
        if (this.workspace) {
          await this.loadWorkspace(this.workspace.session.id);
        }
      });
    },
  },
});
