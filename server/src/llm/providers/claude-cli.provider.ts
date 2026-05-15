import * as path from 'node:path';
import { CliProviderBase } from './cli-provider.base.js';
import type {
  ProviderId,
  StreamChunk,
  StreamOptions,
} from '../llm-provider.interface.js';

function entrypointPath(): string {
  return path.join(__dirname, '..', 'mcp', 'mcp-stdio-entrypoint.js');
}

export class ClaudeCliProvider extends CliProviderBase {
  readonly id: ProviderId = 'claude-cli';
  readonly binaryName = 'claude';
  readonly installHint = 'Install with: npm install -g @anthropic-ai/claude-code';

  protected envForChild(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    if (this.settings.apiKey) env.ANTHROPIC_API_KEY = this.settings.apiKey;
    return env;
  }

  protected async checkConnectionImpl(): Promise<{
    success: boolean;
    message: string;
  }> {
    return new Promise((resolve) => {
      const args = ['-p', 'reply with the word ok', '--max-turns', '1'];
      if (this.settings.modelName) {
        args.push('--model', this.settings.modelName);
      }
      const handle = this.runChild('claude', args);
      const timeout = setTimeout(() => {
        handle.child.kill('SIGTERM');
        resolve({ success: false, message: 'claude check timed out (30s)' });
      }, 30_000);
      handle.child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve({ success: true, message: 'Claude CLI reachable.' });
        } else {
          resolve({
            success: false,
            message: `claude exited with code ${code}`,
          });
        }
      });
      handle.child.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ success: false, message: `claude error: ${err.message}` });
      });
    });
  }

  async *stream(opts: StreamOptions): AsyncIterable<StreamChunk> {
    const sessionToken = opts.sessionId; // session store provides token via callback below
    const token = (opts as StreamOptions & { _token?: string })._token ?? '';
    const port = process.env.PORT ?? '3000';
    const apiBase = `http://127.0.0.1:${port}`;

    const systemMessages = opts.messages.filter((m) => m.role === 'system');
    const turnMessages = opts.messages.filter((m) => m.role !== 'system');
    const lastUser = [...turnMessages].reverse().find((m) => m.role === 'user');
    const prompt = lastUser?.content ?? '';

    const systemPrompt = systemMessages.map((m) => m.content).join('\n\n');

    const mcpConfig = {
      mcpServers: {
        siliconsouls: {
          command: 'node',
          args: [entrypointPath()],
          env: {
            SILSOL_SESSION_ID: opts.sessionId,
            SILSOL_TOKEN: token,
            SILSOL_API_BASE: apiBase,
          },
        },
      },
    };
    const mcpConfigFile = this.makeTempFile(
      'silsol-claude-mcp-',
      JSON.stringify(mcpConfig),
    );

    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];
    if (opts.tools && opts.tools.length > 0) {
      args.push('--mcp-config', mcpConfigFile);
      args.push(
        '--allowed-tools',
        opts.tools.map((t) => `mcp__siliconsouls__${t.name}`).join(','),
      );
      args.push('--permission-mode', 'bypassPermissions');
    }
    if (this.settings.modelName) args.push('--model', this.settings.modelName);
    if (systemPrompt) args.push('--append-system-prompt', systemPrompt);

    const handle = this.runChild('claude', args, {
      env: this.envForChild(),
      signal: opts.signal,
    });

    for await (const line of handle.stdoutLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let event: unknown;
      try {
        event = JSON.parse(trimmed);
      } catch {
        continue;
      }
      const ev = event as {
        type?: string;
        message?: {
          content?: Array<{ type: string; text?: string }>;
        };
      };
      if (ev.type === 'assistant' && ev.message?.content) {
        for (const part of ev.message.content) {
          if (part.type === 'text' && part.text) {
            yield { type: 'text', text: part.text };
          }
        }
      } else if (ev.type === 'result') {
        yield { type: 'finish' };
      }
    }
  }
}
