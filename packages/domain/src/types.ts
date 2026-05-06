export type ProjectStatus =
  | 'created'
  | 'specification_in_progress'
  | 'specification_approved'
  | 'ready_for_decomposition'
  | 'archived';

export type SpecStatus =
  | 'raw_idea'
  | 'clarifying'
  | 'draft'
  | 'needs_user_input'
  | 'review'
  | 'approved'
  | 'ready_for_decomposition'
  | 'archived';

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  status: ProjectStatus;
  currentSpecSessionId?: string;
}

export interface SpecSession {
  id: string;
  projectId: string;
  status: SpecStatus;
  rawIdea: string;
  currentVersionId?: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: 'user';
}

export interface ConversationTurn {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  extractedFactIds: string[];
  extractedRequirementIds: string[];
  extractedAssumptionIds: string[];
  extractedDecisionIds: string[];
}

export type ArtifactSourceType =
  | 'user_explicit'
  | 'user_implicit'
  | 'llm_inferred'
  | 'llm_suggested'
  | 'system_generated';

export interface ArtifactSource {
  type: ArtifactSourceType;
  confidence: number;
  requiresUserConfirmation: boolean;
}

export type RequirementType =
  | 'functional'
  | 'non_functional'
  | 'business'
  | 'technical'
  | 'ux'
  | 'security'
  | 'data'
  | 'integration';

export type RequirementPriority = 'must' | 'should' | 'could' | 'wont';

export type RequirementStatus =
  | 'draft'
  | 'confirmed'
  | 'rejected'
  | 'changed'
  | 'deprecated';

export interface Requirement {
  id: string;
  sessionId: string;
  type: RequirementType;
  title: string;
  description: string;
  priority: RequirementPriority;
  status: RequirementStatus;
  source: ArtifactSource;
  sourceTurnIds: string[];
  rationale?: string;
  dependencies: string[];
  conflictsWith: string[];
  acceptanceCriteriaIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type AssumptionImpact = 'low' | 'medium' | 'high' | 'critical';

export type AssumptionStatus =
  | 'unconfirmed'
  | 'confirmed'
  | 'rejected'
  | 'replaced';

export interface Assumption {
  id: string;
  sessionId: string;
  text: string;
  impact: AssumptionImpact;
  status: AssumptionStatus;
  reason: string;
  source: ArtifactSource;
  relatedRequirementIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type OpenQuestionSeverity = 'minor' | 'normal' | 'important' | 'blocking';

export type OpenQuestionStatus =
  | 'open'
  | 'answered'
  | 'converted_to_assumption'
  | 'dismissed';

export interface OpenQuestion {
  id: string;
  sessionId: string;
  question: string;
  whyItMatters: string;
  severity: OpenQuestionSeverity;
  status: OpenQuestionStatus;
  suggestedAnswers?: string[];
  answer?: string;
  relatedRequirementIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type AcceptanceCriterionStatus =
  | 'draft'
  | 'confirmed'
  | 'rejected'
  | 'deprecated';

export interface AcceptanceCriterion {
  id: string;
  sessionId: string;
  requirementId: string;
  title: string;
  description: string;
  verificationMethod: 'manual' | 'automated' | 'review' | 'test' | 'inspection';
  status: AcceptanceCriterionStatus;
  createdAt: string;
  updatedAt: string;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type RiskStatus = 'identified' | 'accepted' | 'mitigated' | 'dismissed';

export interface Risk {
  id: string;
  sessionId: string;
  title: string;
  description: string;
  level: RiskLevel;
  mitigation?: string;
  status: RiskStatus;
  relatedRequirementIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Decision {
  id: string;
  sessionId: string;
  title: string;
  context: string;
  decision: string;
  alternatives: string[];
  rationale: string;
  sourceTurnIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SpecMeta {
  id: string;
  projectId: string;
  sessionId: string;
  title: string;
  version: string;
  status: SpecStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
}

export interface ProductSection {
  name: string;
  summary: string;
  elevatorPitch?: string;
}

export interface ProblemSection {
  description: string;
  currentAlternatives?: string[];
  painPoints: string[];
}

export interface TargetUser {
  id: string;
  name: string;
  description: string;
  needs: string[];
  constraints: string[];
}

export interface Goal {
  id: string;
  description: string;
  successMetric?: string;
}

export interface NonGoal {
  id: string;
  description: string;
  rationale?: string;
}

export type ScenarioPriority = 'primary' | 'secondary' | 'edge_case';

export interface UserScenario {
  id: string;
  title: string;
  actor: string;
  goal: string;
  preconditions: string[];
  steps: string[];
  expectedOutcome: string;
  priority: ScenarioPriority;
  relatedRequirementIds: string[];
}

export interface ProductSpecJson {
  meta: SpecMeta;
  product: ProductSection;
  problem: ProblemSection;
  users: TargetUser[];
  goals: Goal[];
  nonGoals: NonGoal[];
  scenarios: UserScenario[];
  requirements: Requirement[];
  assumptions: Assumption[];
  openQuestions: OpenQuestion[];
  acceptanceCriteria: AcceptanceCriterion[];
  risks: Risk[];
  decisions: Decision[];
}

export interface SpecVersion {
  id: string;
  sessionId: string;
  version: string;
  status: SpecStatus;
  markdownSnapshot: string;
  jsonSnapshot: ProductSpecJson;
  changeSummary: string;
  createdAt: string;
  createdBy: 'user' | 'assistant' | 'system';
}

export interface Stage1InputBundle {
  specMeta: SpecMeta;
  productSpecMarkdown: string;
  productSpecJson: ProductSpecJson;
  requirements: Requirement[];
  acceptanceCriteria: AcceptanceCriterion[];
  decisions: Decision[];
  risks: Risk[];
}

export interface ApprovalValidationResult {
  canApprove: boolean;
  errors: string[];
  warnings: string[];
}

export interface ReviewReportPayload {
  canApprove: boolean;
  blockingIssues: string[];
  warnings: string[];
  missingSections: string[];
  contradictions: string[];
  recommendedChanges: string[];
  approvalSummary: string;
}

export type BackgroundJobType =
  | 'extract_artifacts'
  | 'generate_clarifying_questions'
  | 'generate_draft'
  | 'run_critic'
  | 'run_reviewer'
  | 'run_review'
  | 'apply_change_request'
  | 'export_bundle';

export type BackgroundJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type SpecArtifactType =
  | 'requirement'
  | 'assumption'
  | 'open_question'
  | 'acceptance_criterion'
  | 'risk'
  | 'decision'
  | 'goal'
  | 'non_goal'
  | 'scenario'
  | 'target_user';

export interface SpecArtifact<TPayload = unknown> {
  id: string;
  sessionId: string;
  artifactType: SpecArtifactType;
  status: string;
  payload: TPayload;
  source: ArtifactSource;
  createdAt: string;
  updatedAt: string;
}

export interface DomainEvent {
  id: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  eventVersion: number;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
}
