import { CliProviderBase } from './cli-provider.base.js';
import type {
  ProviderId,
  StreamChunk,
  StreamOptions,
} from '../llm-provider.interface.js';

export class GeminiCliProvider extends CliProviderBase {
  readonly id: ProviderId = 'gemini-cli';
  readonly binaryName = 'gemini';
  readonly installHint = 'Install with: npm install -g @google/gemini-cli';

  protected envForChild(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    if (this.settings.apiKey) env.GEMINI_API_KEY = this.settings.apiKey;
    return env;
  }

  protected async checkConnectionImpl(): Promise<{
    success: boolean;
    message: string;
  }> {
    return new Promise((resolve) => {
      const args = ['-p', 'reply with the word ok'];
      if (this.settings.modelName) args.push('--model', this.settings.modelName);
      const handle = this.runChild('gemini', args);
      const timeout = setTimeout(() => {
        handle.child.kill('SIGTERM');
        resolve({ success: false, message: 'gemini check timed out (30s)' });
      }, 30_000);
      handle.child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve({ success: true, message: 'Gemini CLI reachable.' });
        } else {
          resolve({ success: false, message: `gemini exited with code ${code}` });
        }
      });
      handle.child.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ success: false, message: `gemini error: ${err.message}` });
      });
    });
  }

  async *stream(opts: StreamOptions): AsyncIterable<StreamChunk> {
    const systemMessages = opts.messages.filter((m) => m.role === 'system');
    const turnMessages = opts.messages.filter((m) => m.role !== 'system');
    const lastUser = [...turnMessages].reverse().find((m) => m.role === 'user');
    const systemPrompt = systemMessages.map((m) => m.content).join('\n\n');
    const prompt = [systemPrompt, lastUser?.content ?? '']
      .filter(Boolean)
      .join('\n\n');

    const args = ['-p', prompt];
    if (this.settings.modelName) args.push('--model', this.settings.modelName);

    const handle = this.runChild('gemini', args, {
      env: this.envForChild(),
      signal: opts.signal,
    });

    for await (const line of handle.stdoutLines) {
      if (line.length === 0) continue;
      yield { type: 'text', text: line + '\n' };
    }
    yield { type: 'finish' };
  }
}
