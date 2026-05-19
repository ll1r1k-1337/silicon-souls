import { ChatOpenAI } from '@langchain/openai';
import type {
  LlmProvider,
  LlmTool,
  ProviderId,
  StreamChunk,
  StreamOptions,
} from '../llm-provider.interface.js';
import type { LlmSettings } from '../../settings/settings.service.js';

function extractReasoning(chunk: unknown): string | null {
  const kw = (chunk as { additional_kwargs?: Record<string, unknown> })
    .additional_kwargs;
  if (!kw) return null;

  const rc = kw.reasoning_content;
  if (typeof rc === 'string' && rc.length > 0) return rc;

  const r = kw.reasoning as
    | { summary?: Array<{ text?: string }>; text?: string }
    | string
    | undefined;
  if (typeof r === 'string' && r.length > 0) return r;
  if (r && typeof r === 'object') {
    if (Array.isArray(r.summary)) {
      const joined = r.summary
        .map((s) => s.text ?? '')
        .filter((t) => t.length > 0)
        .join('');
      if (joined.length > 0) return joined;
    }
    if (typeof r.text === 'string' && r.text.length > 0) return r.text;
  }
  return null;
}

export class OpenAiHttpProvider implements LlmProvider {
  readonly id: ProviderId = 'openai';

  constructor(private readonly settings: LlmSettings) {}

  private buildLlm(): ChatOpenAI {
    return new ChatOpenAI({
      openAIApiKey: this.settings.apiKey ?? '',
      apiKey: this.settings.apiKey ?? '',
      modelName: this.settings.modelName,
      configuration: this.settings.baseURL
        ? { baseURL: this.settings.baseURL }
        : undefined,
      streaming: true,
    });
  }

  async checkConnection(): Promise<{ success: boolean; message: string }> {
    try {
      for await (const chunk of this.stream({
        messages: [{ role: 'user', content: 'Say "ok"' }],
        sessionId: 'connection-check',
      })) {
        if (chunk.type === 'error') {
          return {
            success: false,
            message: `Connection failed: ${chunk.error ?? 'unknown error'}`,
          };
        }
      }
      return {
        success: true,
        message: 'Connection successful! Model is reachable.',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Connection failed: ${msg}` };
    }
  }

  async *stream(opts: StreamOptions): AsyncIterable<StreamChunk> {
    const llm = this.buildLlm();

    let bound: ReturnType<ChatOpenAI['bindTools']> | ChatOpenAI = llm;
    const toolByName = new Map<string, LlmTool>();
    if (opts.tools && opts.tools.length > 0) {
      for (const t of opts.tools) toolByName.set(t.name, t);
      bound = llm.bindTools(
        opts.tools.map((t) => ({
          type: 'function' as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parametersJsonSchema,
          },
        })),
      );
    }

    const lcMessages = opts.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let pendingToolCall: {
      id: string;
      name: string;
      argsBuffer: string;
    } | null = null;

    const continuationMessages: Array<Record<string, unknown>> = [
      ...lcMessages,
    ];

    const MAX_ROUNDS = 6;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const stream = await bound.stream(
        continuationMessages as unknown as Parameters<typeof bound.stream>[0],
      );

      for await (const chunk of stream) {
        if (opts.signal?.aborted) return;

        const content = chunk.content;
        if (typeof content === 'string' && content.length > 0) {
          yield { type: 'text', text: content };
        } else if (Array.isArray(content)) {
          for (const part of content) {
            const p = part as { type?: string; text?: string };
            if (p.type === 'reasoning' && p.text) {
              yield { type: 'thinking', thinking: p.text };
            } else if (p.type === 'text' && p.text) {
              yield { type: 'text', text: p.text };
            }
          }
        }

        const reasoning = extractReasoning(chunk);
        if (reasoning) {
          yield { type: 'thinking', thinking: reasoning };
        }

        const toolCalls =
          (
            chunk as unknown as {
              tool_call_chunks?: Array<{
                id?: string;
                name?: string;
                args?: string;
              }>;
            }
          ).tool_call_chunks ?? [];

        for (const tc of toolCalls) {
          if (tc.id && tc.name) {
            pendingToolCall = {
              id: tc.id,
              name: tc.name,
              argsBuffer: tc.args ?? '',
            };
          } else if (pendingToolCall && tc.args) {
            pendingToolCall.argsBuffer += tc.args;
          }
        }
      }

      if (!pendingToolCall) {
        yield { type: 'finish' };
        return;
      }

      const call = pendingToolCall;
      pendingToolCall = null;

      const tool = toolByName.get(call.name);
      if (!tool) {
        yield {
          type: 'error',
          error: `Model called unknown tool: ${call.name}`,
        };
        return;
      }

      let args: unknown;
      try {
        args = call.argsBuffer ? JSON.parse(call.argsBuffer) : {};
      } catch {
        args = {};
      }

      yield { type: 'tool-call', toolName: call.name, toolArgs: args };

      const result = await tool.handler(args, {
        sessionId: opts.sessionId,
        signal: opts.signal ?? new AbortController().signal,
      });

      yield { type: 'tool-result', toolName: call.name, toolResult: result };

      continuationMessages.push({
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: call.id,
            type: 'function',
            function: {
              name: call.name,
              arguments: call.argsBuffer || '{}',
            },
          },
        ],
      });
      continuationMessages.push({
        role: 'tool',
        content: JSON.stringify(result),
        tool_call_id: call.id,
        name: call.name,
      });
    }

    yield {
      type: 'error',
      error: 'Tool-call loop exceeded maximum rounds',
    };
  }
}
