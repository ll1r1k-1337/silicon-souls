export type ProviderId = 'openai' | 'claude-cli' | 'codex-cli' | 'gemini-cli';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  parametersJsonSchema: Record<string, unknown>;
}

export interface ToolCallContext {
  sessionId: string;
  signal: AbortSignal;
}

export type ToolHandler = (
  args: unknown,
  ctx: ToolCallContext,
) => Promise<unknown>;

export interface LlmTool extends LlmToolDefinition {
  handler: ToolHandler;
}

export interface StreamChunk {
  type: 'text' | 'tool-call' | 'tool-result' | 'finish' | 'error';
  text?: string;
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: unknown;
  error?: string;
}

export interface StreamOptions {
  messages: LlmMessage[];
  tools?: LlmTool[];
  sessionId: string;
  signal?: AbortSignal;
}

export interface LlmProvider {
  readonly id: ProviderId;
  checkConnection(): Promise<{ success: boolean; message: string }>;
  stream(opts: StreamOptions): AsyncIterable<StreamChunk>;
}
