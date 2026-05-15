import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type {
  LlmProvider,
  ProviderId,
  StreamChunk,
  StreamOptions,
} from '../llm-provider.interface.js';
import type { LlmSettings } from '../../settings/settings.service.js';

export interface CliRunHandle {
  child: ChildProcess;
  stdoutLines: AsyncIterable<string>;
  stderrLines: AsyncIterable<string>;
}

export abstract class CliProviderBase implements LlmProvider {
  abstract readonly id: ProviderId;
  abstract readonly binaryName: string;
  abstract readonly installHint: string;

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
    const child = spawn(cmd, args, {
      env: opts.env ?? this.envForChild(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (opts.stdin !== undefined) {
      child.stdin?.write(opts.stdin);
      child.stdin?.end();
    }
    opts.signal?.addEventListener('abort', () => {
      if (!child.killed) child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 2000);
    });

    const stdoutLines = readLines(child.stdout!);
    const stderrLines = readLines(child.stderr!);
    return { child, stdoutLines, stderrLines };
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
