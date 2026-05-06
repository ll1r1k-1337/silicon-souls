import type { z } from 'zod';
import { LlmChainRunner } from '../llm-chain-runner.service';
import type { LlmMessage, LlmOutputSchema, LlmRequestContext } from '../llm.interfaces';

export abstract class BaseLlmChain<Input, Output> {
  abstract readonly name: string;
  abstract readonly promptVersion: string;
  abstract readonly inputSchema: z.ZodSchema<Input>;
  abstract readonly outputSchema: LlmOutputSchema<Output>;

  constructor(protected readonly chainRunner: LlmChainRunner) {}

  abstract buildMessages(input: Input): LlmMessage[];

  async run(input: Input, context: LlmRequestContext): Promise<Output> {
    const validInput = this.inputSchema.parse(input);
    return this.chainRunner.runStructured({
      chainName: this.name,
      input: validInput,
      messages: this.buildMessages(validInput),
      outputSchema: this.outputSchema,
      context: { ...context, chainName: this.name },
      promptVersion: this.promptVersion,
    });
  }
}
