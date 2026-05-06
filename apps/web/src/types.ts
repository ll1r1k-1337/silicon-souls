import type {
  Project,
  ReviewReportPayload,
  SpecArtifact,
  SpecSession,
  SpecVersion,
} from '@sdd/domain';

export interface WorkspaceDocument {
  id: string;
  sessionId: string;
  markdown: string;
  dirty: boolean;
  currentVersionId?: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface WorkspaceState {
  project: Project;
  session: SpecSession;
  conversation: ConversationMessage[];
  artifacts: SpecArtifact[];
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
