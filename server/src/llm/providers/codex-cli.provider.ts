import * as path from 'node:path';
import { CliProviderBase, type CliExitInfo } from './cli-provider.base.js';
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
    const args = [
      'exec',
      '--skip-git-repo-check',
      '--sandbox',
      'read-only',
      '--json',
      'reply with the word ok',
    ];
    const handle = this.runChild('codex', args);

    // Drain stdout so the pipe doesn't fill while we wait for exit; we don't
    // need to parse it for the connection check.
    void (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of handle.stdoutLines) {
          // discard
        }
      } catch {
        // ignored — exit handler reports the failure
      }
    })();

    const timeoutMs = 45_000;
    let timeoutTimer: NodeJS.Timeout | undefined;
    const timeout = new Promise<CliExitInfo>((resolve) => {
      timeoutTimer = setTimeout(() => {
        if (!handle.child.killed) handle.child.kill('SIGTERM');
        // Escalate to SIGKILL if codex ignores SIGTERM, matching the abort
        // path in runChild. Without this the child could outlive the check.
        setTimeout(() => {
          if (!handle.child.killed) handle.child.kill('SIGKILL');
        }, 2000);
        resolve({
          code: null,
          signal: 'SIGTERM',
          error: new Error(`codex check timed out after ${timeoutMs}ms`),
        });
      }, timeoutMs);
    });

    const exit = await Promise.race([handle.exited, timeout]);
    // If exited won the race, cancel the pending timeout so we don't
    // SIGTERM (and SIGKILL 2s later) a possibly-recycled PID. If the
    // timeout fired first, clearTimeout is a harmless no-op here.
    if (timeoutTimer) clearTimeout(timeoutTimer);
    const tail = handle.stderrTail();
    const tailSummary =
      tail.length > 0 ? ` Last stderr: ${tail.slice(-5).join(' | ')}` : '';

    if (exit.error) {
      return {
        success: false,
        message: `codex error: ${exit.error.message}.${tailSummary}`,
      };
    }
    if (exit.code === 0) {
      return { success: true, message: 'Codex CLI reachable.' };
    }
    return {
      success: false,
      message:
        `codex exited with code=${exit.code ?? 'null'} ` +
        `signal=${exit.signal ?? 'null'}.${tailSummary}`,
    };
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
      const argsJson = JSON.stringify([entrypointPath()]);
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

    this.logger.log(
      `codex stream: session=${opts.sessionId} model=${this.settings.modelName ?? '(default)'} ` +
        `tools=${opts.tools?.length ?? 0} apiKey=${this.settings.apiKey ? 'set' : 'unset'}`,
    );

    const handle = this.runChild('codex', args, {
      env: this.envForChild(),
      signal: opts.signal,
    });

    let sawAnyEvent = false;
    let unparsedSamples = 0;
    const MAX_UNPARSED_LOG = 5;

    for await (const line of handle.stdoutLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let event: unknown;
      try {
        event = JSON.parse(trimmed);
      } catch (err) {
        // Codex stream-json shouldn't emit non-JSON, but if startup fails it
        // often does (e.g. a config-parse error printed to stdout). Logging a
        // sample is critical for debugging why it "fails to start".
        if (unparsedSamples < MAX_UNPARSED_LOG) {
          unparsedSamples += 1;
          this.logger.warn(
            `codex stdout: non-JSON line (sample ${unparsedSamples}/${MAX_UNPARSED_LOG}, ` +
              `parse error: ${(err as Error).message}): ` +
              trimmed.slice(0, 500),
          );
        }
        continue;
      }
      sawAnyEvent = true;
      // codex 0.130 schema: `{ type, item?, message?, ... }`. The old
      // top-level `msg` envelope (agent_message_delta / task_complete) is
      // gone. For backwards compat we still look at `msg.type` if present.
      const ev = event as {
        type?: string;
        item?: { type?: string; text?: string; message?: string };
        message?: string;
        msg?: { type?: string; delta?: string; message?: string };
      };
      const topType = ev.type;
      const legacyType = ev.msg?.type;
      if (topType === 'item.completed' && ev.item?.type === 'reasoning') {
        if (ev.item.text) yield { type: 'thinking', thinking: ev.item.text };
      } else if (
        topType === 'item.completed' &&
        ev.item?.type === 'agent_message'
      ) {
        // Codex emits one item.completed per assistant message with the
        // full text. There are no streaming deltas in 0.130+, so this is
        // the canonical text event.
        if (ev.item.text) yield { type: 'text', text: ev.item.text };
      } else if (topType === 'turn.completed') {
        yield { type: 'finish' };
      } else if (topType === 'error') {
        // codex prints transient "Reconnecting..." errors mid-turn that
        // resolve on their own; don't surface them to the chat.
        this.logger.debug(`codex error event: ${ev.message ?? '(no message)'}`);
      } else if (legacyType === 'agent_message_delta' && ev.msg?.delta) {
        yield { type: 'text', text: ev.msg.delta };
      } else if (legacyType === 'task_complete') {
        yield { type: 'finish' };
      } else if (topType || legacyType) {
        this.logger.debug(`codex event: ${topType ?? legacyType}`);
      }
    }

    // stdout closed — confirm how the child exited so failures surface in
    // the chat stream instead of looking like an empty response.
    const exit: CliExitInfo = await handle.exited;
    if (exit.error) {
      const tail = handle.stderrTail();
      const tailMsg =
        tail.length > 0 ? ` (last stderr: ${tail.slice(-5).join(' | ')})` : '';
      this.logger.error(
        `codex stream: spawn error: ${exit.error.message}${tailMsg}`,
      );
      yield {
        type: 'text',
        text: `\n\n[codex failed to start: ${exit.error.message}${tailMsg}]\n`,
      };
      yield { type: 'finish' };
      return;
    }
    if (exit.code !== 0 && !sawAnyEvent) {
      const tail = handle.stderrTail();
      const tailMsg =
        tail.length > 0
          ? `\nstderr (last ${Math.min(tail.length, 10)} lines):\n` +
            tail
              .slice(-10)
              .map((l) => `  ${l}`)
              .join('\n')
          : '';
      this.logger.error(
        `codex stream: exited code=${exit.code} signal=${exit.signal ?? 'null'} with no events${tailMsg}`,
      );
      yield {
        type: 'text',
        text:
          `\n\n[codex exited with code=${exit.code ?? 'null'} ` +
          `signal=${exit.signal ?? 'null'} and produced no output.` +
          (tail.length > 0
            ? ` Last stderr: ${tail.slice(-3).join(' | ')}`
            : '') +
          `]\n`,
      };
      yield { type: 'finish' };
    } else if (exit.code !== 0) {
      // Codex produced some output before crashing. Surface a brief inline
      // note + finish so the chat consumer doesn't hang waiting for more.
      this.logger.warn(
        `codex stream: exited code=${exit.code} signal=${exit.signal ?? 'null'} after producing events`,
      );
      const tail = handle.stderrTail();
      yield {
        type: 'text',
        text:
          `\n\n[codex exited mid-stream with code=${exit.code ?? 'null'} ` +
          `signal=${exit.signal ?? 'null'}.` +
          (tail.length > 0
            ? ` Last stderr: ${tail.slice(-3).join(' | ')}`
            : '') +
          `]\n`,
      };
      yield { type: 'finish' };
    }
  }
}
