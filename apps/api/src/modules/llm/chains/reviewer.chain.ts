import { Injectable } from '@nestjs/common';
import { CriticOutputSchema, ReviewerOutputSchema } from '@sdd/llm-contracts';
import { ProductSpecJsonSchema } from '@sdd/schemas';
import { z } from 'zod';
import { LlmChainRunner } from '../llm-chain-runner.service';
import type { LlmMessage } from '../llm.interfaces';
import { reviewerPromptVersion, reviewerSystemPrompt } from '../prompts/reviewer.prompt';
import { BaseLlmChain } from './base.chain';

const ReviewerInputSchema = z.object({
  spec: ProductSpecJsonSchema,
  criticOutput: CriticOutputSchema,
});

export type ReviewerInput = z.infer<typeof ReviewerInputSchema>;
export type ReviewerOutput = z.infer<typeof ReviewerOutputSchema>;

@Injectable()
export class ReviewerChain extends BaseLlmChain<ReviewerInput, ReviewerOutput> {
  readonly name = 'reviewer';
  readonly promptVersion = reviewerPromptVersion;
  readonly inputSchema = ReviewerInputSchema;
  readonly outputSchema = ReviewerOutputSchema;

  constructor(chainRunner: LlmChainRunner) {
    super(chainRunner);
  }

  buildMessages(input: ReviewerInput): LlmMessage[] {
    return [
      { role: 'system', content: reviewerSystemPrompt() },
      { role: 'user', content: JSON.stringify(input, null, 2) },
    ];
  }
}
