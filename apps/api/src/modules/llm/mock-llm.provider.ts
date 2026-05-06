import { createPrefixedId, nowIso, validateApprovalReadiness } from '@sdd/domain';
import { renderProductSpecMarkdown } from '@sdd/spec-format';
import type {
  AcceptanceCriterion,
  Assumption,
  Decision,
  OpenQuestion,
  ProductSpecJson,
  Requirement,
  Risk,
} from '@sdd/domain';
import type { ExtractorInput } from '@sdd/llm-contracts';
import type {
  LlmInvokeOptions,
  LlmMessage,
  LlmOutputSchema,
  LlmProvider,
  LlmTextResult,
} from './llm.interfaces';

export class MockLlmProvider implements LlmProvider {
  readonly providerName = 'mock';
  readonly modelName = 'mock-stage0';

  async invoke(messages: LlmMessage[], _options?: LlmInvokeOptions): Promise<LlmTextResult> {
    return {
      content: messages.at(-1)?.content ?? '',
    };
  }

  async invokeStructured<Input, Output>(params: {
    chainName: string;
    input: Input;
    messages: LlmMessage[];
    outputSchema: LlmOutputSchema<Output>;
    options?: LlmInvokeOptions;
  }): Promise<Output> {
    const output = this.buildOutput(params.chainName, params.input);
    return params.outputSchema.parse(output);
  }

  private buildOutput(chainName: string, input: unknown): unknown {
    if (chainName === 'extractor') {
      return this.extract(input as ExtractorInput);
    }

    if (chainName === 'interviewer') {
      return {
        questions: [
          {
            question: 'Who are the primary target users for this product?',
            whyItMatters: 'Target users are required before approval and shape core scenarios.',
            severity: 'blocking',
            suggestedAnswers: ['Internal product owner', 'End customers', 'Operations team'],
          },
          {
            question: 'What is explicitly out of scope for the first approved specification?',
            whyItMatters: 'Non-goals are required for approval and prevent scope drift.',
            severity: 'important',
          },
        ],
      };
    }

    if (chainName === 'spec_writer') {
      const spec = (input as { spec: ProductSpecJson }).spec;
      return {
        markdown: renderProductSpecMarkdown(spec),
        sections: [
          {
            title: 'Product Summary',
            completeness: spec.product.summary ? 0.8 : 0.2,
            notes: [],
          },
          {
            title: 'Requirements',
            completeness: spec.requirements.length > 0 ? 0.7 : 0.1,
            notes: [],
          },
        ],
      };
    }

    if (chainName === 'critic') {
      return this.critic(input as { spec: ProductSpecJson });
    }

    if (chainName === 'reviewer') {
      const spec = (input as { spec: ProductSpecJson }).spec;
      const result = validateApprovalReadiness(spec);
      return {
        canApprove: result.canApprove,
        blockingIssues: result.errors,
        recommendedChanges: result.errors,
        approvalSummary: result.canApprove
          ? 'Specification is ready for approval.'
          : 'Specification still has blocking approval issues.',
      };
    }

    return {};
  }

  private extract(input: ExtractorInput): {
    requirements: Requirement[];
    assumptions: Assumption[];
    decisions: Decision[];
    openQuestions: OpenQuestion[];
    risks: Risk[];
    acceptanceCriteria: AcceptanceCriterion[];
  } {
    const now = nowIso();
    const requirementId = createPrefixedId('req');
    const text = input.userMessage.trim();
    const title =
      text
        .split(/\s+/)
        .slice(0, 8)
        .join(' ')
        .replace(/[^\w\s-]/g, '') || 'User requirement';

    const requirement: Requirement = {
      id: requirementId,
      sessionId: input.sessionId,
      type: 'functional',
      title,
      description: text,
      priority: /must|mvp|required/i.test(text) ? 'must' : 'should',
      status: 'confirmed',
      source: { type: 'user_explicit', confidence: 0.85, requiresUserConfirmation: false },
      sourceTurnIds: input.conversationContext.at(-1)?.id ? [input.conversationContext.at(-1)!.id] : [],
      dependencies: [],
      conflictsWith: [],
      acceptanceCriteriaIds: [],
      createdAt: now,
      updatedAt: now,
    };

    const criterion: AcceptanceCriterion = {
      id: createPrefixedId('ac'),
      sessionId: input.sessionId,
      requirementId,
      title: `Verify ${title}`,
      description: `The product specification clearly covers: ${text}`,
      verificationMethod: 'review',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };
    requirement.acceptanceCriteriaIds = [criterion.id];

    const assumptions: Assumption[] = /assume/i.test(text)
      ? [
          {
            id: createPrefixedId('asm'),
            sessionId: input.sessionId,
            text,
            impact: 'medium',
            status: 'unconfirmed',
            reason: 'User phrased this as an assumption.',
            source: { type: 'user_explicit', confidence: 0.8, requiresUserConfirmation: false },
            relatedRequirementIds: [requirementId],
            createdAt: now,
            updatedAt: now,
          },
        ]
      : [];

    const risks: Risk[] = /risk/i.test(text)
      ? [
          {
            id: createPrefixedId('risk'),
            sessionId: input.sessionId,
            title: 'User mentioned risk',
            description: text,
            level: 'medium',
            status: 'identified',
            relatedRequirementIds: [requirementId],
            createdAt: now,
            updatedAt: now,
          },
        ]
      : [];

    return {
      requirements: [requirement],
      acceptanceCriteria: [criterion],
      assumptions,
      decisions: [],
      openQuestions: [],
      risks,
    };
  }

  private critic(input: { spec: ProductSpecJson }): unknown {
    const gaps: Array<Record<string, unknown>> = [];
    const spec = input.spec;

    if (spec.users.length === 0) {
      gaps.push({
        id: createPrefixedId('rev'),
        section: 'Target Users',
        description: 'No target users are defined.',
        severity: 'blocking',
        recommendation: 'Add at least one target user.',
      });
    }

    if (spec.nonGoals.length === 0) {
      gaps.push({
        id: createPrefixedId('rev'),
        section: 'Non-Goals',
        description: 'No non-goals are defined.',
        severity: 'important',
        recommendation: 'Define what is out of scope.',
      });
    }

    if (spec.scenarios.length === 0) {
      gaps.push({
        id: createPrefixedId('rev'),
        section: 'Scenarios',
        description: 'No core user scenarios are defined.',
        severity: 'blocking',
        recommendation: 'Add primary user scenarios.',
      });
    }

    return {
      gaps,
      contradictions: [],
      risks: [],
      suggestedQuestions: gaps.map((gap) => ({
        id: createPrefixedId('oq'),
        sessionId: spec.meta.sessionId,
        question: String(gap.recommendation),
        whyItMatters: String(gap.description),
        severity: gap.severity === 'blocking' ? 'blocking' : 'important',
        status: 'open',
        relatedRequirementIds: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      })),
    };
  }
}
