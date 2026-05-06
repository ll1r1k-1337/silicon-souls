import { Injectable } from '@nestjs/common';
import { CriticOutputSchema } from '@sdd/llm-contracts';
import { ProductSpecJsonSchema } from '@sdd/schemas';
import { z } from 'zod';
import { LlmChainRunner } from '../llm-chain-runner.service';
import type { LlmMessage } from '../llm.interfaces';
import { criticPromptVersion, criticSystemPrompt } from '../prompts/critic.prompt';
import { BaseLlmChain } from './base.chain';

const CriticInputSchema = z.object({
  spec: ProductSpecJsonSchema,
});

export type CriticInput = z.infer<typeof CriticInputSchema>;
export type CriticOutput = z.infer<typeof CriticOutputSchema>;

@Injectable()
export class CriticChain extends BaseLlmChain<CriticInput, CriticOutput> {
  readonly name = 'critic';
  readonly promptVersion = criticPromptVersion;
  readonly inputSchema = CriticInputSchema;
  readonly outputSchema = CriticOutputSchema;

  constructor(chainRunner: LlmChainRunner) {
    super(chainRunner);
  }

  buildMessages(input: CriticInput): LlmMessage[] {
    return [
      { role: 'system', content: criticSystemPrompt() },
      { role: 'user', content: JSON.stringify(input, null, 2) },
    ];
  }
}
