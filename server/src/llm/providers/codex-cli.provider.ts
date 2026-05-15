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

export class CodexCliProvider extends CliProviderBase {
  readonly id: ProviderId = 'codex-cli';
  readonly binaryName = 'codex';
  readonly installHint = 'Install with: npm install -g @openai/codex';

  protected envForChild(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    if (this.settings.apiKey) env.OPENAI_API_KEY = this.settings.apiKey;
    return env;
  }

  protected async checkConnectionImpl(): Promise<{
    success: boolean;
    message: string;
  }> {
    return new Promise((resolve) => {
      const args = [
        'exec',
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        '--json',
        'reply with the word ok',
      ];
      const handle = this.runChild('codex', args);
      const timeout = setTimeout(() => {
        handle.child.kill('SIGTERM');
        resolve({ success: false, message: 'codex check timed out (45s)' });
      }, 45_000);
      handle.child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve({ success: true, message: 'Codex CLI reachable.' });
        } else {
          resolve({ success: false, message: `codex exited with code ${code}` });
        }
      });
      handle.child.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ success: false, message: `codex error: ${err.message}` });
      });
    });
  }

  async *stream(opts: StreamOptions): AsyncIterable<StreamChunk> {
    const token = (opts as StreamOptions & { _token?: string })._token ?? '';
    const port = process.env.PORT ?? '3000';
    const apiBase = `http://127.0.0.1:${port}`;

    const systemMessages = opts.messages.filter((m) => m.role === 'system');
    const turnMessages = opts.messages.filter((m) => m.role !== 'system');
    const lastUser = [...turnMessages].reverse().find((m) => m.role === 'user');
    const systemPrompt = systemMessages.map((m) => m.content).join('\n\n');
    const promptParts: string[] = [];
    if (systemPrompt) promptParts.push(systemPrompt);
    if (lastUser?.content) promptParts.push(lastUser.content);

    const args: string[] = [
      'exec',
      '--skip-git-repo-check',
      '--sandbox',
      'danger-full-access',
      '--json',
      '--config',
      'approval_policy="never"',
    ];
    if (this.settings.modelName) {
      args.push('--config', `model="${this.settings.modelName}"`);
    }
    if (opts.tools && opts.tools.length > 0) {
      const argsJson = JSON.stringify([
        entrypointPath(),
      ]);
      args.push(
        '--config',
        `mcp_servers.siliconsouls.command="node"`,
        '--config',
        `mcp_servers.siliconsouls.args=${argsJson}`,
        '--config',
        `mcp_servers.siliconsouls.env={SILSOL_SESSION_ID="${opts.sessionId}",SILSOL_TOKEN="${token}",SILSOL_API_BASE="${apiBase}"}`,
      );
    }
    args.push(promptParts.join('\n\n'));

    const handle = this.runChild('codex', args, {
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
        msg?: { type?: string; delta?: string; message?: string };
      };
      const msgType = ev.msg?.type;
      if (msgType === 'agent_message_delta' && ev.msg?.delta) {
        yield { type: 'text', text: ev.msg.delta };
      } else if (msgType === 'agent_message' && ev.msg?.message) {
        // Final aggregated message: only emit if we haven't seen deltas (unknown here).
        // Skip to avoid double-output; deltas are the canonical stream.
      } else if (msgType === 'task_complete') {
        yield { type: 'finish' };
      }
    }
  }
}
