import type {
  Project,
  DocumentAnchor,
  DocumentComment,
  DocumentCommentThread,
  DocumentProjectionStatus,
  DocumentSuggestion,
  ConversationStructuredPayload,
  ReviewReportPayload,
  RichDocumentContent,
  SpecArtifact,
  SpecSession,
  SpecVersion,
} from '@sdd/domain';

export interface WorkspaceDocument {
  id: string;
  sessionId: string;
  markdown: string;
  contentJson: RichDocumentContent;
  schemaVersion: string;
  projectionStatus: DocumentProjectionStatus;
  dirty: boolean;
  currentVersionId?: string;
  updatedAt: string;
}

export interface DocumentSelectionContext {
  documentId: string;
  sessionId: string;
  version?: string;
  range?: {
    start: number;
    end: number;
  };
  href: string;
  label: string;
  text: string;
}

export interface ConversationMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  structured?: ConversationStructuredPayload;
  thinkingSummary?: string;
  generatedArtifactIds?: string[];
  generatedOpenQuestionIds?: string[];
}

export interface WorkspaceState {
  project: Project;
  session: SpecSession;
  conversation: ConversationMessage[];
  artifacts: SpecArtifact[];
  commentThreads: DocumentCommentThread[];
  document?: WorkspaceDocument;
  versions: SpecVersion[];
  review?: {
    id: string;
    canApprove: boolean;
    payload: ReviewReportPayload;
    createdAt: string;
  };
}

export interface JobRef {
  jobId: string;
  type: string;
  status: string;
}

export type {
  DocumentAnchor,
  DocumentComment,
  DocumentCommentThread,
  DocumentProjectionStatus,
  DocumentSuggestion,
  RichDocumentContent,
};

export interface SystemLogJob {
  id: string;
  type: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lockedBy?: string;
  runAfter: string;
  lockedAt?: string;
  createdAt: string;
  updatedAt: string;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: Record<string, unknown>;
}

export interface SystemLogEvent {
  id: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  eventVersion: number;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SystemLogLlmInvocation {
  id: string;
  traceId: string;
  projectId: string;
  sessionId: string;
  chainName: string;
  provider: string;
  model: string;
  promptVersion: string;
  status: string;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  errorCode?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SystemLogsResponse {
  generatedAt: string;
  jobs: SystemLogJob[];
  events: SystemLogEvent[];
  llmInvocations: SystemLogLlmInvocation[];
}
