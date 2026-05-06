import { Injectable } from '@nestjs/common';
import {
  ExtractorInputSchema,
  ExtractorOutputSchema,
  type ExtractorInput,
  type ExtractorOutput,
} from '@sdd/llm-contracts';
import { extractorPromptVersion, extractorSystemPrompt } from '../prompts/extractor.prompt';
import { LlmChainRunner } from '../llm-chain-runner.service';
import type { LlmMessage } from '../llm.interfaces';
import { BaseLlmChain } from './base.chain';

@Injectable()
export class ExtractorChain extends BaseLlmChain<ExtractorInput, ExtractorOutput> {
  readonly name = 'extractor';
  readonly promptVersion = extractorPromptVersion;
  readonly inputSchema = ExtractorInputSchema;
  readonly outputSchema = ExtractorOutputSchema;

  constructor(chainRunner: LlmChainRunner) {
    super(chainRunner);
  }

  buildMessages(input: ExtractorInput): LlmMessage[] {
    return [
      { role: 'system', content: extractorSystemPrompt() },
      {
        role: 'user',
        content: JSON.stringify(
          {
            currentSpec: input.currentSpec,
            conversationContext: input.conversationContext,
            userMessage: input.userMessage,
          },
          null,
          2,
        ),
      },
    ];
  }
}
