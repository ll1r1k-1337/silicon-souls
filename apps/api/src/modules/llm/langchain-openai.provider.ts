import { ChatOpenAI } from '@langchain/openai';
import type { z } from 'zod';
import type {
  LlmInvokeOptions,
  LlmMessage,
  LlmOutputSchema,
  LlmProvider,
  LlmTextResult,
} from './llm.interfaces';
import { toLangChainMessages } from './langchain-message.mapper';

export interface OpenAiProviderConfig {
  apiKey: string;
  model: string;
  temperature: number;
  timeoutMs: number;
  maxRetries: number;
}

export class LangChainOpenAiProvider implements LlmProvider {
  readonly providerName = 'openai';
  readonly modelName: string;
  private readonly model: ChatOpenAI;

  constructor(config: OpenAiProviderConfig) {
    this.modelName = config.model;
    this.model = new ChatOpenAI({
      apiKey: config.apiKey,
      model: config.model,
      temperature: config.temperature,
      timeout: config.timeoutMs,
      maxRetries: config.maxRetries,
    });
  }

  async invoke(messages: LlmMessage[], options?: LlmInvokeOptions): Promise<LlmTextResult> {
    const response = await this.model.invoke(toLangChainMessages(messages), {
      metadata: options?.metadata,
      runName: options?.traceId,
    });

    return {
      content: Array.isArray(response.content)
        ? response.content.map((part) => String(part)).join('\n')
        : String(response.content),
      raw: response,
    };
  }

  async invokeStructured<Input, Output>(params: {
    chainName: string;
    input: Input;
    messages: LlmMessage[];
    outputSchema: LlmOutputSchema<Output>;
    options?: LlmInvokeOptions;
  }): Promise<Output> {
    const structuredModel = (
      this.model as unknown as {
        withStructuredOutput(
          schema: z.ZodTypeAny,
          options: { name: string },
        ): { invoke(input: unknown, options?: unknown): Promise<unknown> };
      }
    ).withStructuredOutput(params.outputSchema as z.ZodTypeAny, {
      name: params.chainName,
    }) as {
      invoke(input: unknown, options?: unknown): Promise<unknown>;
    };

    const output = await structuredModel.invoke(toLangChainMessages(params.messages), {
      metadata: params.options?.metadata,
      runName: params.options?.traceId,
    });
    return params.outputSchema.parse(output);
  }
}
