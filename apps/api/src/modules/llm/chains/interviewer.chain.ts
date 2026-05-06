import { Injectable } from '@nestjs/common';
import {
  InterviewerInputSchema,
  InterviewerOutputSchema,
  type InterviewerInput,
  type InterviewerOutput,
} from '@sdd/llm-contracts';
import { LlmChainRunner } from '../llm-chain-runner.service';
import type { LlmMessage } from '../llm.interfaces';
import {
  interviewerPromptVersion,
  interviewerSystemPrompt,
} from '../prompts/interviewer.prompt';
import { BaseLlmChain } from './base.chain';

@Injectable()
export class InterviewerChain extends BaseLlmChain<InterviewerInput, InterviewerOutput> {
  readonly name = 'interviewer';
  readonly promptVersion = interviewerPromptVersion;
  readonly inputSchema = InterviewerInputSchema;
  readonly outputSchema = InterviewerOutputSchema;

  constructor(chainRunner: LlmChainRunner) {
    super(chainRunner);
  }

  buildMessages(input: InterviewerInput): LlmMessage[] {
    return [
      { role: 'system', content: interviewerSystemPrompt() },
      { role: 'user', content: JSON.stringify(input, null, 2) },
    ];
  }
}
