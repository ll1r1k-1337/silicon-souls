import { z } from 'zod';

export const ProjectStatusSchema = z.enum([
  'created',
  'specification_in_progress',
  'specification_approved',
  'ready_for_decomposition',
  'archived',
]);

export const SpecStatusSchema = z.enum([
  'raw_idea',
  'clarifying',
  'draft',
  'needs_user_input',
  'review',
  'approved',
  'ready_for_decomposition',
  'archived',
]);

export const ArtifactSourceTypeSchema = z.enum([
  'user_explicit',
  'user_implicit',
  'llm_inferred',
  'llm_suggested',
  'system_generated',
]);

export const ArtifactSourceSchema = z.object({
  type: ArtifactSourceTypeSchema,
  confidence: z.number().min(0).max(1),
  requiresUserConfirmation: z.boolean(),
});

export const RequirementSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  type: z.enum([
    'functional',
    'non_functional',
    'business',
    'technical',
    'ux',
    'security',
    'data',
    'integration',
  ]),
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(['must', 'should', 'could', 'wont']),
  status: z.enum(['draft', 'confirmed', 'rejected', 'changed', 'deprecated']),
  source: ArtifactSourceSchema,
  sourceTurnIds: z.array(z.string()),
  rationale: z.string().optional(),
  dependencies: z.array(z.string()),
  conflictsWith: z.array(z.string()),
  acceptanceCriteriaIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const AssumptionSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  text: z.string().min(1),
  impact: z.enum(['low', 'medium', 'high', 'critical']),
  status: z.enum(['unconfirmed', 'confirmed', 'rejected', 'replaced']),
  reason: z.string().min(1),
  source: ArtifactSourceSchema,
  relatedRequirementIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const OpenQuestionSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  question: z.string().min(1),
  whyItMatters: z.string().min(1),
  severity: z.enum(['minor', 'normal', 'important', 'blocking']),
  status: z.enum(['open', 'answered', 'converted_to_assumption', 'dismissed']),
  answerMode: z.enum(['free_text', 'single_choice', 'multiple_choice']).optional(),
  suggestedAnswers: z.array(z.string()).optional(),
  allowOtherAnswer: z.boolean().optional(),
  otherAnswerLabel: z.string().optional(),
  answer: z.string().optional(),
  customAnswer: z.string().optional(),
  relatedRequirementIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ChatContextSchema = z.object({
  selectedText: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
});

export const ChatTextInputSchema = z.object({
  kind: z.literal('text'),
  text: z.string().min(1),
  context: ChatContextSchema.optional(),
});

export const ChatCommandSchema = z.enum(['clarify', 'generate_draft', 'review_spec']);

export const ChatCommandInputSchema = z.object({
  kind: z.literal('command'),
  command: ChatCommandSchema,
  context: ChatContextSchema.optional(),
});

export const ChatQuestionnaireAnswerInputSchema = z
  .object({
    questionArtifactId: z.string().min(1),
    selectedAnswers: z.array(z.string().min(1)).optional(),
    customAnswer: z.string().optional(),
    textAnswer: z.string().optional(),
  })
  .refine(
    (value) =>
      Boolean(value.textAnswer?.trim()) ||
      Boolean(value.customAnswer?.trim()) ||
      (value.selectedAnswers?.length ?? 0) > 0,
    {
      message: 'Each question answer must include textAnswer, customAnswer, or selectedAnswers.',
    },
  );

export const ChatQuestionnaireAnswersInputSchema = z.object({
  kind: z.literal('questionnaire_answers'),
  sourceMessageId: z.string().min(1),
  answers: z.array(ChatQuestionnaireAnswerInputSchema).min(1),
});

export const ChatInputSchema = z.discriminatedUnion('kind', [
  ChatTextInputSchema,
  ChatCommandInputSchema,
  ChatQuestionnaireAnswersInputSchema,
]);

export const LegacyChatInputSchema = z.object({
  message: z.string().min(1),
});

export const ChatInputEnvelopeSchema = z.union([ChatInputSchema, LegacyChatInputSchema]);

export const AcceptanceCriterionSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  requirementId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  verificationMethod: z.enum(['manual', 'automated', 'review', 'test', 'inspection']),
  status: z.enum(['draft', 'confirmed', 'rejected', 'deprecated']),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const RiskSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  level: z.enum(['low', 'medium', 'high', 'critical']),
  mitigation: z.string().optional(),
  status: z.enum(['identified', 'accepted', 'mitigated', 'dismissed']),
  relatedRequirementIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const DecisionSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  title: z.string().min(1),
  context: z.string(),
  decision: z.string().min(1),
  alternatives: z.array(z.string()),
  rationale: z.string(),
  sourceTurnIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const SpecMetaSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  title: z.string().min(1),
  version: z.string().min(1),
  status: SpecStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  approvedAt: z.string().optional(),
});

export const ProductSectionSchema = z.object({
  name: z.string().min(1),
  summary: z.string(),
  elevatorPitch: z.string().optional(),
});

export const ProblemSectionSchema = z.object({
  description: z.string(),
  currentAlternatives: z.array(z.string()).optional(),
  painPoints: z.array(z.string()),
});

export const TargetUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  needs: z.array(z.string()),
  constraints: z.array(z.string()),
});

export const GoalSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  successMetric: z.string().optional(),
});

export const NonGoalSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  rationale: z.string().optional(),
});

export const UserScenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  actor: z.string().min(1),
  goal: z.string().min(1),
  preconditions: z.array(z.string()),
  steps: z.array(z.string()),
  expectedOutcome: z.string(),
  priority: z.enum(['primary', 'secondary', 'edge_case']),
  relatedRequirementIds: z.array(z.string()),
});

export const ProductSpecJsonSchema = z.object({
  meta: SpecMetaSchema,
  product: ProductSectionSchema,
  problem: ProblemSectionSchema,
  users: z.array(TargetUserSchema),
  goals: z.array(GoalSchema),
  nonGoals: z.array(NonGoalSchema),
  scenarios: z.array(UserScenarioSchema),
  requirements: z.array(RequirementSchema),
  assumptions: z.array(AssumptionSchema),
  openQuestions: z.array(OpenQuestionSchema),
  acceptanceCriteria: z.array(AcceptanceCriterionSchema),
  risks: z.array(RiskSchema),
  decisions: z.array(DecisionSchema),
});

export const Stage1InputBundleSchema = z.object({
  specMeta: SpecMetaSchema,
  productSpecMarkdown: z.string().min(1),
  productSpecJson: ProductSpecJsonSchema,
  requirements: z.array(RequirementSchema),
  acceptanceCriteria: z.array(AcceptanceCriterionSchema),
  decisions: z.array(DecisionSchema),
  risks: z.array(RiskSchema),
});

export const SpecArtifactTypeSchema = z.enum([
  'requirement',
  'assumption',
  'open_question',
  'acceptance_criterion',
  'risk',
  'decision',
  'goal',
  'non_goal',
  'scenario',
  'target_user',
]);

export const SpecArtifactSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  artifactType: SpecArtifactTypeSchema,
  status: z.string().min(1),
  payload: z.unknown(),
  source: ArtifactSourceSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const RichDocumentContentSchema = z.record(z.unknown()).refine(
  (value) => value.type === 'doc',
  'Rich document content must be a Tiptap doc node.',
);

export const DocumentProjectionStatusSchema = z.enum(['synced', 'stale', 'failed']);

export const DocumentAnchorSchema = z.object({
  from: z.number().int().min(0).optional(),
  to: z.number().int().min(0).optional(),
  selectedText: z.string().optional(),
  documentVersionId: z.string().optional(),
});

export const DocumentCommentSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  author: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  createdAt: z.string(),
});

export const DocumentSuggestionSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  status: z.enum(['pending', 'accepted', 'rejected']),
  replacementMarkdown: z.string().optional(),
  replacementContentJson: RichDocumentContentSchema.optional(),
  rationale: z.string().optional(),
  createdBy: z.enum(['assistant', 'user', 'system']),
  createdAt: z.string(),
  updatedAt: z.string(),
  acceptedAt: z.string().optional(),
});

export const DocumentCommentThreadSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  documentId: z.string().optional(),
  versionId: z.string().optional(),
  status: z.enum(['open', 'resolved']),
  anchor: DocumentAnchorSchema,
  selectedText: z.string().optional(),
  createdBy: z.enum(['user', 'assistant', 'system']),
  comments: z.array(DocumentCommentSchema),
  suggestions: z.array(DocumentSuggestionSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ReviewReportPayloadSchema = z.object({
  canApprove: z.boolean(),
  blockingIssues: z.array(z.string()),
  warnings: z.array(z.string()),
  missingSections: z.array(z.string()),
  contradictions: z.array(z.string()),
  recommendedChanges: z.array(z.string()),
  approvalSummary: z.string(),
});

export const ConversationStructuredTextBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string().min(1),
});

export const ConversationStructuredQuestionSchema = z.object({
  questionArtifactId: z.string().min(1),
  question: z.string().min(1),
  whyItMatters: z.string().min(1),
  severity: z.enum(['minor', 'normal', 'important', 'blocking']),
  answerMode: z.enum(['free_text', 'single_choice', 'multiple_choice']),
  suggestedAnswers: z.array(z.string()).optional(),
  allowOtherAnswer: z.boolean().optional(),
  otherAnswerLabel: z.string().optional(),
});

export const ConversationStructuredQuestionnaireBlockSchema = z.object({
  type: z.literal('questionnaire'),
  questions: z.array(ConversationStructuredQuestionSchema).min(1),
});

export const ConversationStructuredBlockSchema = z.union([
  ConversationStructuredTextBlockSchema,
  ConversationStructuredQuestionnaireBlockSchema,
]);

export const ConversationStructuredPayloadSchema = z.object({
  version: z.literal('chat_response.v1'),
  blocks: z.array(ConversationStructuredBlockSchema).min(1),
});

export type ProductSpecJsonInput = z.infer<typeof ProductSpecJsonSchema>;
export type ChatInputEnvelope = z.infer<typeof ChatInputEnvelopeSchema>;
