import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Logger } from '@nestjs/common';
import type {
  LlmProvider,
  ProviderId,
  StreamChunk,
  StreamOptions,
} from '../llm-provider.interface.js';
import type { LlmSettings } from '../../settings/settings.service.js';

export interface CliExitInfo {
  code: number | null;
  signal: NodeJS.Signals | null;
  /** Set if the child process failed to spawn (e.g. ENOENT). */
  error?: Error;
}

export interface CliRunHandle {
  child: ChildProcess;
  stdoutLines: AsyncIterable<string>;
  /** Snapshot of the last ~50 captured stderr lines so far. */
  stderrTail(): string[];
  /** Resolves once the child has exited or errored. Never rejects. */
  exited: Promise<CliExitInfo>;
}

const MAX_STDERR_TAIL_LINES = 50;
/** Truncate a single CLI argument when logging so we don't dump multi-KB prompts. */
const MAX_ARG_LOG_CHARS = 400;

const IS_WINDOWS = process.platform === 'win32';

function formatArgsForLog(args: string[]): string {
  return args
    .map((a) => {
      const truncated =
        a.length > MAX_ARG_LOG_CHARS
          ? `${a.slice(0, MAX_ARG_LOG_CHARS)}…(+${a.length - MAX_ARG_LOG_CHARS} chars)`
          : a;
      return JSON.stringify(truncated);
    })
    .join(' ');
}

const binaryPathCache = new Map<string, string>();

function resolveBinarySync(name: string): string | null {
  const cached = binaryPathCache.get(name);
  if (cached !== undefined) return cached;

  const result = spawnSync(IS_WINDOWS ? 'where' : 'which', [name], {
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) return null;

  const candidates = result.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (candidates.length === 0) return null;

  let pick: string | undefined;
  if (IS_WINDOWS) {
    // `where` lists every match in PATH+PATHEXT order. npm-installed CLIs
    // typically produce three entries in the same directory:
    //   - an extensionless Git-Bash / MSYS shell script (e.g. `codex`)
    //   - a Windows batch shim (`codex.cmd`)
    //   - a PowerShell wrapper (`codex.ps1`)
    // The extensionless one is listed first but is NOT runnable from
    // cmd.exe / CreateProcessW — spawning it gives ENOENT. Prefer real
    // Windows executable forms: .exe > .cmd > .bat, falling back to the
    // first entry only if none match.
    pick =
      candidates.find((c) => /\.exe$/i.test(c)) ??
      candidates.find((c) => /\.cmd$/i.test(c)) ??
      candidates.find((c) => /\.bat$/i.test(c)) ??
      candidates[0];
  } else {
    pick = candidates[0];
  }

  if (!pick) return null;
  binaryPathCache.set(name, pick);
  return pick;
}

// Cmd.exe metacharacters that would be reinterpreted outside of double-quotes.
// (`%` is intentionally excluded — see CAVEAT below.)
const CMD_METACHARS = /[\s"&|<>^()@,;=!]/;

function escapeWindowsArg(arg: string): string {
  // Always quote when going through cmd.exe (shell: true) to neutralize cmd
  // metacharacters (&, |, <, >, ^, parens, etc.). Inside double quotes cmd
  // treats them as literal.
  //
  // CAVEAT: cmd.exe still expands `%VAR%` sequences inside double-quoted
  // arguments and there is no in-line escape for `%` from a `cmd /c` invocation
  // (the `%%` trick only works inside .bat files). Callers on Windows should
  // avoid embedding `%X%` patterns in args; `runChild` logs a warning when it
  // sees one so the leak is at least visible.
  if (arg.length === 0) return '""';
  if (!CMD_METACHARS.test(arg) && !arg.includes('\\')) return arg;
  let out = '"';
  let backslashes = 0;
  for (const c of arg) {
    if (c === '\\') {
      backslashes++;
    } else if (c === '"') {
      out += '\\'.repeat(backslashes * 2 + 1);
      out += '"';
      backslashes = 0;
    } else {
      out += '\\'.repeat(backslashes);
      out += c;
      backslashes = 0;
    }
  }
  out += '\\'.repeat(backslashes * 2);
  out += '"';
  return out;
}

export abstract class CliProviderBase implements LlmProvider {
  abstract readonly id: ProviderId;
  abstract readonly binaryName: string;
  abstract readonly installHint: string;

  protected readonly logger = new Logger(this.constructor.name);

  constructor(protected readonly settings: LlmSettings) {}

  protected envForChild(): NodeJS.ProcessEnv {
    return { ...process.env };
  }

  protected async binaryExists(): Promise<boolean> {
    return new Promise((resolve) => {
      const which = spawn(process.platform === 'win32' ? 'where' : 'which', [
        this.binaryName,
      ]);
      which.on('close', (code) => resolve(code === 0));
      which.on('error', () => resolve(false));
    });
  }

  async checkConnection(): Promise<{ success: boolean; message: string }> {
    if (!(await this.binaryExists())) {
      return {
        success: false,
        message: `Binary "${this.binaryName}" not found on PATH. ${this.installHint}`,
      };
    }
    return this.checkConnectionImpl();
  }

  protected abstract checkConnectionImpl(): Promise<{
    success: boolean;
    message: string;
  }>;

  protected runChild(
    cmd: string,
    args: string[],
    opts: {
      env?: NodeJS.ProcessEnv;
      stdin?: string;
      signal?: AbortSignal;
    } = {},
  ): CliRunHandle {
    this.logger.log(`Spawning ${cmd} (${args.length} args)`);
    this.logger.debug(`argv: ${cmd} ${formatArgsForLog(args)}`);

    const env = opts.env ?? this.envForChild();

    let spawnTarget = cmd;
    let spawnArgs = args;
    let spawnShell = false;

    if (IS_WINDOWS) {
      const resolved = resolveBinarySync(cmd);
      if (resolved && /\.(cmd|bat)$/i.test(resolved)) {
        const argsWithPercent = args.filter((a) => a.includes('%'));
        if (argsWithPercent.length > 0) {
          this.logger.warn(
            `${cmd}: ${argsWithPercent.length} arg(s) contain '%'; ` +
              `cmd.exe will expand %VAR% sequences inside them. ` +
              `Strip or pre-escape '%' if this content is user-supplied.`,
          );
        }
        spawnTarget = [resolved, ...args].map(escapeWindowsArg).join(' ');
        spawnArgs = [];
        spawnShell = true;
        this.logger.debug(
          `windows shell command: ${spawnTarget.slice(0, 600)}`,
        );
      } else if (resolved) {
        spawnTarget = resolved;
      }
    }

    const child = spawn(spawnTarget, spawnArgs, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: spawnShell,
    });

    this.logger.debug(
      `${cmd} spawned: pid=${child.pid ?? '?'} cwd=${process.cwd()}`,
    );

    if (opts.stdin !== undefined) {
      child.stdin?.write(opts.stdin);
      child.stdin?.end();
    }
    opts.signal?.addEventListener('abort', () => {
      this.logger.warn(
        `Aborting ${cmd} pid=${child.pid ?? '?'} (signal received)`,
      );
      if (!child.killed) child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 2000);
    });

    const stderrTail: string[] = [];
    void (async () => {
      try {
        for await (const rawLine of readLines(child.stderr)) {
          const line = rawLine.replace(/\r$/, '');
          if (line.length === 0) continue;
          stderrTail.push(line);
          if (stderrTail.length > MAX_STDERR_TAIL_LINES) stderrTail.shift();
          this.logger.warn(`[${cmd} stderr] ${line}`);
        }
      } catch (err) {
        this.logger.warn(
          `[${cmd} stderr] reader error: ${(err as Error).message}`,
        );
      }
    })();

    const exited = new Promise<CliExitInfo>((resolve) => {
      let resolved = false;
      child.on('error', (error: Error) => {
        if (resolved) return;
        resolved = true;
        this.logger.error(
          `${cmd} failed to spawn: ${error.message}`,
          error.stack,
        );
        resolve({ code: null, signal: null, error });
      });
      child.on('close', (code, signal) => {
        if (resolved) return;
        resolved = true;
        const msg =
          `${cmd} pid=${child.pid ?? '?'} exited ` +
          `code=${code ?? 'null'} signal=${signal ?? 'null'}`;
        if (code === 0) {
          this.logger.log(msg);
        } else {
          this.logger.warn(msg);
          if (stderrTail.length > 0) {
            this.logger.warn(
              `${cmd} last stderr (${stderrTail.length} lines): ` +
                stderrTail.slice(-10).join(' | '),
            );
          }
        }
        resolve({ code, signal });
      });
    });

    const stdoutLines = readLines(child.stdout);
    return {
      child,
      stdoutLines,
      stderrTail: () => stderrTail.slice(),
      exited,
    };
  }

  protected makeTempFile(prefix: string, content: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(file, content);
    return file;
  }

  abstract stream(opts: StreamOptions): AsyncIterable<StreamChunk>;
}

export async function* readLines(
  stream: NodeJS.ReadableStream,
): AsyncIterable<string> {
  let buffer = '';
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    buffer += chunk.toString('utf8');
    let nl = buffer.indexOf('\n');
    while (nl !== -1) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      yield line;
      nl = buffer.indexOf('\n');
    }
  }
  if (buffer.length > 0) yield buffer;
}
