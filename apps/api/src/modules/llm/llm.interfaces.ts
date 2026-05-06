import type { z } from 'zod';

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmInvokeOptions {
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
  traceId?: string;
  metadata?: Record<string, unknown>;
}

export interface LlmTextResult {
  content: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  raw?: unknown;
}

export type LlmOutputSchema<Output> = z.ZodType<Output, z.ZodTypeDef, unknown>;

export interface LlmProvider {
  readonly providerName: string;
  readonly modelName: string;

  invoke(messages: LlmMessage[], options?: LlmInvokeOptions): Promise<LlmTextResult>;

  invokeStructured<Input, Output>(params: {
    chainName: string;
    input: Input;
    messages: LlmMessage[];
    outputSchema: LlmOutputSchema<Output>;
    options?: LlmInvokeOptions;
  }): Promise<Output>;
}

export interface LlmRequestContext {
  projectId: string;
  sessionId: string;
  userId?: string;
  chainName: string;
  traceId: string;
  sourceTurnId?: string;
  versionId?: string;
}

export interface RunStructuredParams<Input, Output> {
  chainName: string;
  input: Input;
  messages: LlmMessage[];
  outputSchema: LlmOutputSchema<Output>;
  context: LlmRequestContext;
  options?: LlmInvokeOptions;
}
