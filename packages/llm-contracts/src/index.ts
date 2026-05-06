import { z } from 'zod';
import {
  AcceptanceCriterionSchema,
  AssumptionSchema,
  DecisionSchema,
  OpenQuestionSchema,
  ProductSpecJsonSchema,
  RequirementSchema,
  RiskSchema,
} from '@sdd/schemas';

export const InterviewerInputSchema = z.object({
  rawIdea: z.string(),
  currentSpec: ProductSpecJsonSchema.optional(),
  openQuestions: z.array(OpenQuestionSchema),
  assumptions: z.array(AssumptionSchema),
});

export const InterviewerOutputSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      whyItMatters: z.string(),
      severity: z.enum(['minor', 'normal', 'important', 'blocking']),
      suggestedAnswers: z.array(z.string()).optional(),
    }),
  ),
});

export const ExtractorInputSchema = z.object({
  sessionId: z.string(),
  userMessage: z.string(),
  conversationContext: z.array(
    z.object({
      id: z.string(),
      sessionId: z.string(),
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
      createdAt: z.string(),
      extractedFactIds: z.array(z.string()),
      extractedRequirementIds: z.array(z.string()),
      extractedAssumptionIds: z.array(z.string()),
      extractedDecisionIds: z.array(z.string()),
    }),
  ),
  currentSpec: ProductSpecJsonSchema.optional(),
});

export const ExtractorOutputSchema = z.object({
  requirements: z.array(RequirementSchema),
  assumptions: z.array(AssumptionSchema),
  decisions: z.array(DecisionSchema),
  openQuestions: z.array(OpenQuestionSchema),
  risks: z.array(RiskSchema),
  acceptanceCriteria: z.array(AcceptanceCriterionSchema).default([]),
});

export const SpecWriterInputSchema = z.object({
  spec: ProductSpecJsonSchema,
  targetFormat: z.literal('markdown'),
});

export const SpecWriterOutputSchema = z.object({
  markdown: z.string(),
  sections: z.array(
    z.object({
      title: z.string(),
      completeness: z.number().min(0).max(1),
      notes: z.array(z.string()),
    }),
  ),
});

export const CriticOutputSchema = z.object({
  gaps: z.array(
    z.object({
      id: z.string(),
      section: z.string(),
      description: z.string(),
      severity: z.enum(['minor', 'normal', 'important', 'blocking']),
      recommendation: z.string(),
    }),
  ),
  contradictions: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      relatedRequirementIds: z.array(z.string()),
      severity: z.enum(['minor', 'normal', 'important', 'blocking']),
      recommendation: z.string(),
    }),
  ),
  risks: z.array(RiskSchema),
  suggestedQuestions: z.array(OpenQuestionSchema),
});

export const ReviewerOutputSchema = z.object({
  canApprove: z.boolean(),
  blockingIssues: z.array(z.string()),
  recommendedChanges: z.array(z.string()),
  approvalSummary: z.string(),
});

export type InterviewerInput = z.infer<typeof InterviewerInputSchema>;
export type InterviewerOutput = z.infer<typeof InterviewerOutputSchema>;
export type ExtractorInput = z.infer<typeof ExtractorInputSchema>;
export type ExtractorOutput = z.infer<typeof ExtractorOutputSchema>;
export type SpecWriterInput = z.infer<typeof SpecWriterInputSchema>;
export type SpecWriterOutput = z.infer<typeof SpecWriterOutputSchema>;
