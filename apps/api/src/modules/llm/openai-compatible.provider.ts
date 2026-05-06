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

export interface OpenAiCompatibleProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  timeoutMs: number;
  maxRetries: number;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const firstObject = withoutFence.indexOf('{');
  const firstArray = withoutFence.indexOf('[');
  const startCandidates = [firstObject, firstArray].filter((index) => index >= 0);
  const start = startCandidates.length > 0 ? Math.min(...startCandidates) : 0;
  const lastObject = withoutFence.lastIndexOf('}');
  const lastArray = withoutFence.lastIndexOf(']');
  const end = Math.max(lastObject, lastArray);
  const candidate = end >= start ? withoutFence.slice(start, end + 1) : withoutFence;

  return JSON.parse(candidate);
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly providerName = 'openai_compatible';
  readonly modelName: string;
  readonly baseUrl: string;
  private readonly model: ChatOpenAI;

  constructor(config: OpenAiCompatibleProviderConfig) {
    this.modelName = config.model;
    this.baseUrl = config.baseUrl;
    this.model = new ChatOpenAI({
      apiKey: config.apiKey,
      model: config.model,
      temperature: config.temperature,
      timeout: config.timeoutMs,
      maxRetries: config.maxRetries,
      streamUsage: false,
      configuration: {
        baseURL: config.baseUrl,
      },
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
    try {
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
    } catch {
      const response = await this.invoke(
        [
          ...params.messages,
          {
            role: 'system',
            content:
              'Return only valid JSON matching the expected schema. Do not include markdown fences, comments, or explanation.',
          },
        ],
        params.options,
      );

      return params.outputSchema.parse(extractJson(response.content));
    }
  }
}
