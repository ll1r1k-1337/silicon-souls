import { Injectable } from '@nestjs/common';
import {
  SpecWriterInputSchema,
  SpecWriterOutputSchema,
  type SpecWriterInput,
  type SpecWriterOutput,
} from '@sdd/llm-contracts';
import { LlmChainRunner } from '../llm-chain-runner.service';
import type { LlmMessage } from '../llm.interfaces';
import { specWriterPromptVersion, specWriterSystemPrompt } from '../prompts/spec-writer.prompt';
import { BaseLlmChain } from './base.chain';

@Injectable()
export class SpecWriterChain extends BaseLlmChain<SpecWriterInput, SpecWriterOutput> {
  readonly name = 'spec_writer';
  readonly promptVersion = specWriterPromptVersion;
  readonly inputSchema = SpecWriterInputSchema;
  readonly outputSchema = SpecWriterOutputSchema;

  constructor(chainRunner: LlmChainRunner) {
    super(chainRunner);
  }

  buildMessages(input: SpecWriterInput): LlmMessage[] {
    return [
      { role: 'system', content: specWriterSystemPrompt() },
      { role: 'user', content: JSON.stringify(input, null, 2) },
    ];
  }
}
