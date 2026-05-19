import { EventEmitter } from 'node:events';
import { CodexCliProvider } from './codex-cli.provider';
import type { CliExitInfo, CliRunHandle } from './cli-provider.base';
import type {
  LlmTool,
  StreamChunk,
  StreamOptions,
} from '../llm-provider.interface';
import type { LlmSettings } from '../../settings/settings.service';

type RunChildArgs = {
  cmd: string;
  args: string[];
  opts: { env?: NodeJS.ProcessEnv; stdin?: string; signal?: AbortSignal };
};

interface FakeChild extends EventEmitter {
  pid: number;
  killed: boolean;
  kill: jest.Mock<boolean, [NodeJS.Signals?]>;
}

function makeFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.pid = 4242;
  child.killed = false;
  // Cast: jest infers a [] args tuple from this thunk, but tests need to
  // pass a NodeJS.Signals arg through mockImplementation later.
  child.kill = jest.fn(() => {
    child.killed = true;
    return true;
  }) as jest.Mock<boolean, [NodeJS.Signals?]>;
  return child;
}

function makeHandle(opts: {
  lines?: string[];
  exit?: CliExitInfo;
  exitPromise?: Promise<CliExitInfo>;
  stderr?: string[];
  child?: FakeChild;
}): CliRunHandle {
  const child = opts.child ?? makeFakeChild();
  const stderrTail = opts.stderr ?? [];
  const lines = opts.lines ?? [];
  return {
    child: child as unknown as CliRunHandle['child'],
    stdoutLines: (async function* () {
      // Yield a microtask so this satisfies the async-iterable contract
      // even when `lines` is empty (and silences require-await).
      await Promise.resolve();
      for (const line of lines) yield line;
    })(),
    stderrTail: () => [...stderrTail],
    exited:
      opts.exitPromise ??
      Promise.resolve(opts.exit ?? { code: 0, signal: null }),
  };
}

function settings(overrides: Partial<LlmSettings> = {}): LlmSettings {
  return {
    providerType: 'codex-cli',
    modelName: '',
    ...overrides,
  };
}

async function collect(
  iter: AsyncIterable<StreamChunk>,
): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const c of iter) out.push(c);
  return out;
}

function spyRunChild(
  provider: CodexCliProvider,
  impl: (call: RunChildArgs) => CliRunHandle,
): jest.SpyInstance<CliRunHandle, [string, string[], RunChildArgs['opts']?]> & {
  calls: RunChildArgs[];
} {
  const calls: RunChildArgs[] = [];
  const spy = jest
    .spyOn(
      provider as unknown as {
        runChild: CodexCliProvider['stream'] extends never ? never : never;
      },
      'runChild' as never,
    )
    .mockImplementation(((
      cmd: string,
      args: string[],
      o?: RunChildArgs['opts'],
    ) => {
      const call: RunChildArgs = { cmd, args, opts: o ?? {} };
      calls.push(call);
      return impl(call);
    }) as never);
  return Object.assign(spy as never, { calls });
}

describe('CodexCliProvider', () => {
  describe('static metadata', () => {
    it('reports the codex-cli provider id and install hint', () => {
      const p = new CodexCliProvider(settings());
      expect(p.id).toBe('codex-cli');
      expect(p.binaryName).toBe('codex');
      expect(p.installHint).toMatch(/npm install -g @openai\/codex/);
    });
  });

  describe('envForChild', () => {
    it('injects OPENAI_API_KEY when apiKey is configured', () => {
      const p = new CodexCliProvider(settings({ apiKey: 'sk-test-123' }));
      const env = (
        p as unknown as { envForChild(): NodeJS.ProcessEnv }
      ).envForChild();
      expect(env.OPENAI_API_KEY).toBe('sk-test-123');
    });

    it('does not inject OPENAI_API_KEY when apiKey is absent', () => {
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      try {
        const p = new CodexCliProvider(settings());
        const env = (
          p as unknown as { envForChild(): NodeJS.ProcessEnv }
        ).envForChild();
        expect(env.OPENAI_API_KEY).toBeUndefined();
      } finally {
        if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey;
      }
    });
  });

  describe('checkConnection', () => {
    it('returns the install hint when the codex binary is missing', async () => {
      const p = new CodexCliProvider(settings());
      jest
        .spyOn(
          p as unknown as { binaryExists(): Promise<boolean> },
          'binaryExists',
        )
        .mockResolvedValue(false);
      const result = await p.checkConnection();
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Binary "codex" not found/);
      expect(result.message).toMatch(/npm install -g @openai\/codex/);
    });

    it('passes read-only sandbox args and resolves success on exit 0', async () => {
      const p = new CodexCliProvider(settings());
      jest
        .spyOn(
          p as unknown as { binaryExists(): Promise<boolean> },
          'binaryExists',
        )
        .mockResolvedValue(true);
      const spy = spyRunChild(p, () =>
        makeHandle({ exit: { code: 0, signal: null } }),
      );
      const result = await p.checkConnection();
      expect(result).toEqual({
        success: true,
        message: 'Codex CLI reachable.',
      });
      expect(spy.calls).toHaveLength(1);
      const call = spy.calls[0];
      expect(call.cmd).toBe('codex');
      expect(call.args).toEqual([
        'exec',
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        '--json',
        'reply with the word ok',
      ]);
    });

    it('reports the exit code and stderr tail on non-zero exit', async () => {
      const p = new CodexCliProvider(settings());
      jest
        .spyOn(
          p as unknown as { binaryExists(): Promise<boolean> },
          'binaryExists',
        )
        .mockResolvedValue(true);
      spyRunChild(p, () =>
        makeHandle({
          exit: { code: 7, signal: null },
          stderr: ['warm-up failed', 'auth missing'],
        }),
      );
      const result = await p.checkConnection();
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/code=7/);
      expect(result.message).toMatch(
        /Last stderr: warm-up failed \| auth missing/,
      );
    });

    it('reports a friendly message and stderr tail on spawn error', async () => {
      const p = new CodexCliProvider(settings());
      jest
        .spyOn(
          p as unknown as { binaryExists(): Promise<boolean> },
          'binaryExists',
        )
        .mockResolvedValue(true);
      spyRunChild(p, () =>
        makeHandle({
          exit: {
            code: null,
            signal: null,
            error: new Error('spawn ENOENT'),
          },
          stderr: ['boom'],
        }),
      );
      const result = await p.checkConnection();
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/codex error: spawn ENOENT/);
      expect(result.message).toMatch(/Last stderr: boom/);
    });

    it('escalates SIGTERM then SIGKILL when the child ignores SIGTERM', async () => {
      jest.useFakeTimers();
      const p = new CodexCliProvider(settings());
      jest
        .spyOn(
          p as unknown as { binaryExists(): Promise<boolean> },
          'binaryExists',
        )
        .mockResolvedValue(true);
      const child = makeFakeChild();
      // Simulate a child that refuses to die on SIGTERM by leaving
      // `killed=false` after the first kill. SIGKILL flips it.
      child.kill.mockImplementation((signal?: NodeJS.Signals) => {
        if (signal === 'SIGKILL') child.killed = true;
        return true;
      });
      spyRunChild(p, () =>
        makeHandle({
          child,
          exitPromise: new Promise<CliExitInfo>(() => {
            /* never resolves */
          }),
        }),
      );
      const pending = p.checkConnection();
      await jest.advanceTimersByTimeAsync(45_000);
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
      await jest.advanceTimersByTimeAsync(2_000);
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
      const result = await pending;
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/codex check timed out after 45000ms/);
      jest.useRealTimers();
    });

    it('skips SIGKILL escalation when SIGTERM already killed the child', async () => {
      jest.useFakeTimers();
      const p = new CodexCliProvider(settings());
      jest
        .spyOn(
          p as unknown as { binaryExists(): Promise<boolean> },
          'binaryExists',
        )
        .mockResolvedValue(true);
      // Default kill mock already flips `killed=true` on the first call.
      const child = makeFakeChild();
      spyRunChild(p, () =>
        makeHandle({
          child,
          exitPromise: new Promise<CliExitInfo>(() => {
            /* never resolves */
          }),
        }),
      );
      const pending = p.checkConnection();
      await jest.advanceTimersByTimeAsync(45_000);
      expect(child.kill).toHaveBeenCalledTimes(1);
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
      await jest.advanceTimersByTimeAsync(2_000);
      // Source guards the SIGKILL with `if (!handle.child.killed)`, so a
      // well-behaved child that exited on SIGTERM is not re-signaled.
      expect(child.kill).toHaveBeenCalledTimes(1);
      await pending;
      jest.useRealTimers();
    });

    it('does not fire the timeout when the child exits in time', async () => {
      jest.useFakeTimers();
      const p = new CodexCliProvider(settings());
      jest
        .spyOn(
          p as unknown as { binaryExists(): Promise<boolean> },
          'binaryExists',
        )
        .mockResolvedValue(true);
      const child = makeFakeChild();
      spyRunChild(p, () =>
        makeHandle({ child, exit: { code: 0, signal: null } }),
      );
      const result = await p.checkConnection();
      expect(result.success).toBe(true);
      // Advance past both the 45s timeout and the 2s SIGKILL escalation:
      // the timer must have been cleared so kill is never called.
      await jest.advanceTimersByTimeAsync(60_000);
      expect(child.kill).not.toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('stream argument construction', () => {
    async function streamCall(
      provider: CodexCliProvider,
      opts: StreamOptions,
    ): Promise<RunChildArgs[]> {
      const calls: RunChildArgs[] = [];
      jest
        .spyOn(
          provider as unknown as {
            runChild: CodexCliProvider['stream'];
          },
          'runChild' as never,
        )
        .mockImplementation(((
          cmd: string,
          args: string[],
          o?: RunChildArgs['opts'],
        ) => {
          calls.push({ cmd, args, opts: o ?? {} });
          return makeHandle({});
        }) as never);
      // Drain the stream so the spawn happens.
      await collect(provider.stream(opts));
      return calls;
    }

    it('builds a minimal argv with no model/tools and joins system + user prompt', async () => {
      const p = new CodexCliProvider(settings());
      const calls = await streamCall(p, {
        sessionId: 's1',
        messages: [
          { role: 'system', content: 'You are HR.' },
          { role: 'user', content: 'find me a backend dev' },
        ],
      });
      expect(calls).toHaveLength(1);
      const args = calls[0].args;
      expect(args).toEqual([
        'exec',
        '--skip-git-repo-check',
        '--sandbox',
        'danger-full-access',
        '--json',
        '--config',
        'approval_policy="never"',
        'You are HR.\n\nfind me a backend dev',
      ]);
      // No model config and no mcp_servers entries.
      expect(args).not.toContain('mcp_servers.siliconsouls.command="node"');
      expect(args.some((a) => a.startsWith('model='))).toBe(false);
    });

    it('passes the model name to codex via --config when set', async () => {
      const p = new CodexCliProvider(settings({ modelName: 'gpt-5-codex' }));
      const calls = await streamCall(p, {
        sessionId: 's2',
        messages: [{ role: 'user', content: 'hi' }],
      });
      const args = calls[0].args;
      const modelIdx = args.indexOf('model="gpt-5-codex"');
      expect(modelIdx).toBeGreaterThan(0);
      expect(args[modelIdx - 1]).toBe('--config');
    });

    it('wires the internal MCP server when tools are provided', async () => {
      const p = new CodexCliProvider(settings());
      const tool: LlmTool = {
        name: 'present_candidates',
        description: 'noop',
        parametersJsonSchema: { type: 'object' },
        handler: () => Promise.resolve({}),
      };
      const calls = await streamCall(p, {
        sessionId: 'sess-xyz',
        messages: [{ role: 'user', content: 'go' }],
        tools: [tool],
        // Inject a token via the private channel the provider reads.
        _token: 't0k3n',
      } as StreamOptions & { _token: string });
      const args = calls[0].args;
      expect(args).toContain('mcp_servers.siliconsouls.command="node"');
      const envIdx = args.findIndex((a) =>
        a.startsWith('mcp_servers.siliconsouls.env='),
      );
      expect(envIdx).toBeGreaterThan(0);
      const envArg = args[envIdx];
      expect(envArg).toContain('SILSOL_SESSION_ID="sess-xyz"');
      expect(envArg).toContain('SILSOL_TOKEN="t0k3n"');
      expect(envArg).toContain('SILSOL_API_BASE="http://127.0.0.1:');
      // args entry is a JSON-encoded array containing the entrypoint .js path.
      const argsArg =
        args[
          args.findIndex((a) => a.startsWith('mcp_servers.siliconsouls.args='))
        ];
      const argsArrJson = argsArg.slice(
        'mcp_servers.siliconsouls.args='.length,
      );
      const parsed = JSON.parse(argsArrJson) as string[];
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toMatch(/mcp-stdio-entrypoint\.js$/);
    });

    it('omits the mcp_servers config when tools is empty', async () => {
      const p = new CodexCliProvider(settings());
      const calls = await streamCall(p, {
        sessionId: 's3',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [],
      });
      const args = calls[0].args;
      expect(args.some((a) => a.startsWith('mcp_servers.siliconsouls'))).toBe(
        false,
      );
    });

    it('forwards the abort signal to runChild', async () => {
      const p = new CodexCliProvider(settings());
      const ac = new AbortController();
      const calls = await streamCall(p, {
        sessionId: 's4',
        messages: [{ role: 'user', content: 'hi' }],
        signal: ac.signal,
      });
      expect(calls[0].opts.signal).toBe(ac.signal);
    });
  });

  describe('stream event handling', () => {
    it('translates an item.completed agent_message into a text chunk', async () => {
      const p = new CodexCliProvider(settings());
      spyRunChild(p, () =>
        makeHandle({
          lines: [
            JSON.stringify({
              type: 'thread.started',
              thread_id: 'abc',
            }),
            JSON.stringify({ type: 'turn.started' }),
            JSON.stringify({
              type: 'item.completed',
              item: { id: 'item_0', type: 'agent_message', text: 'Hello' },
            }),
            JSON.stringify({ type: 'turn.completed', usage: {} }),
          ],
        }),
      );
      const chunks = await collect(
        p.stream({
          sessionId: 's',
          messages: [{ role: 'user', content: 'x' }],
        }),
      );
      expect(chunks).toEqual([
        { type: 'text', text: 'Hello' },
        { type: 'finish' },
      ]);
    });

    it('translates an item.completed reasoning into a thinking chunk', async () => {
      const p = new CodexCliProvider(settings());
      spyRunChild(p, () =>
        makeHandle({
          lines: [
            JSON.stringify({
              type: 'item.completed',
              item: { type: 'reasoning', text: 'pondering...' },
            }),
            JSON.stringify({
              type: 'item.completed',
              item: { type: 'agent_message', text: 'final answer' },
            }),
            JSON.stringify({ type: 'turn.completed' }),
          ],
        }),
      );
      const chunks = await collect(
        p.stream({
          sessionId: 's',
          messages: [{ role: 'user', content: 'x' }],
        }),
      );
      expect(chunks).toEqual([
        { type: 'thinking', thinking: 'pondering...' },
        { type: 'text', text: 'final answer' },
        { type: 'finish' },
      ]);
    });

    it('ignores transient error events emitted mid-turn', async () => {
      const p = new CodexCliProvider(settings());
      spyRunChild(p, () =>
        makeHandle({
          lines: [
            JSON.stringify({
              type: 'error',
              message: 'Reconnecting... 2/5 (timeout waiting for child)',
            }),
            JSON.stringify({
              type: 'item.completed',
              item: { type: 'agent_message', text: 'ok' },
            }),
            JSON.stringify({ type: 'turn.completed' }),
          ],
        }),
      );
      const chunks = await collect(
        p.stream({
          sessionId: 's',
          messages: [{ role: 'user', content: 'x' }],
        }),
      );
      // The transient error must not leak into the chat stream.
      expect(chunks).toEqual([
        { type: 'text', text: 'ok' },
        { type: 'finish' },
      ]);
    });

    it('still accepts the legacy agent_message_delta / task_complete schema', async () => {
      const p = new CodexCliProvider(settings());
      spyRunChild(p, () =>
        makeHandle({
          lines: [
            JSON.stringify({
              msg: { type: 'agent_message_delta', delta: 'Hel' },
            }),
            JSON.stringify({
              msg: { type: 'agent_message_delta', delta: 'lo' },
            }),
            JSON.stringify({ msg: { type: 'task_complete' } }),
          ],
        }),
      );
      const chunks = await collect(
        p.stream({
          sessionId: 's',
          messages: [{ role: 'user', content: 'x' }],
        }),
      );
      expect(chunks).toEqual([
        { type: 'text', text: 'Hel' },
        { type: 'text', text: 'lo' },
        { type: 'finish' },
      ]);
    });

    it('skips non-JSON lines and blank lines without aborting the stream', async () => {
      const p = new CodexCliProvider(settings());
      spyRunChild(p, () =>
        makeHandle({
          lines: [
            '   ',
            'not-json-this-is-a-banner',
            JSON.stringify({
              type: 'item.completed',
              item: { type: 'agent_message', text: 'ok' },
            }),
            JSON.stringify({ type: 'turn.completed' }),
          ],
        }),
      );
      const chunks = await collect(
        p.stream({
          sessionId: 's',
          messages: [{ role: 'user', content: 'x' }],
        }),
      );
      expect(chunks).toEqual([
        { type: 'text', text: 'ok' },
        { type: 'finish' },
      ]);
    });

    it('emits an inline error + finish when codex fails to spawn', async () => {
      const p = new CodexCliProvider(settings());
      spyRunChild(p, () =>
        makeHandle({
          exit: {
            code: null,
            signal: null,
            error: new Error('spawn ENOENT'),
          },
          stderr: ['could not find binary'],
        }),
      );
      const chunks = await collect(
        p.stream({
          sessionId: 's',
          messages: [{ role: 'user', content: 'x' }],
        }),
      );
      expect(chunks).toHaveLength(2);
      expect(chunks[0].type).toBe('text');
      expect(chunks[0].text).toMatch(/codex failed to start: spawn ENOENT/);
      expect(chunks[0].text).toMatch(/last stderr: could not find binary/);
      expect(chunks[1]).toEqual({ type: 'finish' });
    });

    it('emits a no-output error when codex exits non-zero with no events', async () => {
      const p = new CodexCliProvider(settings());
      spyRunChild(p, () =>
        makeHandle({
          exit: { code: 2, signal: null },
          stderr: ['config parse failed'],
        }),
      );
      const chunks = await collect(
        p.stream({
          sessionId: 's',
          messages: [{ role: 'user', content: 'x' }],
        }),
      );
      expect(chunks).toHaveLength(2);
      expect(chunks[0].type).toBe('text');
      expect(chunks[0].text).toMatch(/codex exited with code=2/);
      expect(chunks[0].text).toMatch(/produced no output/);
      expect(chunks[0].text).toMatch(/Last stderr: config parse failed/);
      expect(chunks[1]).toEqual({ type: 'finish' });
    });

    it('emits a mid-stream-crash note when codex exits non-zero after events', async () => {
      const p = new CodexCliProvider(settings());
      spyRunChild(p, () =>
        makeHandle({
          lines: [
            JSON.stringify({
              type: 'item.completed',
              item: { type: 'agent_message', text: 'ok' },
            }),
          ],
          exit: { code: 1, signal: null },
          stderr: ['panicked at line 42'],
        }),
      );
      const chunks = await collect(
        p.stream({
          sessionId: 's',
          messages: [{ role: 'user', content: 'x' }],
        }),
      );
      // First chunk is the real delta, then the inline crash note + finish.
      expect(chunks[0]).toEqual({ type: 'text', text: 'ok' });
      expect(chunks[1].type).toBe('text');
      expect(chunks[1].text).toMatch(/codex exited mid-stream with code=1/);
      expect(chunks[1].text).toMatch(/Last stderr: panicked at line 42/);
      expect(chunks[2]).toEqual({ type: 'finish' });
    });

    it('does not append an error chunk when codex exits cleanly mid-stream', async () => {
      const p = new CodexCliProvider(settings());
      spyRunChild(p, () =>
        makeHandle({
          lines: [
            JSON.stringify({
              type: 'item.completed',
              item: { type: 'agent_message', text: 'ok' },
            }),
            JSON.stringify({ type: 'turn.completed' }),
          ],
          exit: { code: 0, signal: null },
        }),
      );
      const chunks = await collect(
        p.stream({
          sessionId: 's',
          messages: [{ role: 'user', content: 'x' }],
        }),
      );
      expect(chunks).toEqual([
        { type: 'text', text: 'ok' },
        { type: 'finish' },
      ]);
    });
  });
});
