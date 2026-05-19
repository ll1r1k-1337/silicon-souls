// Real-binary integration tests for the Codex CLI provider.
//
// Gated so the suite is a no-op when the host doesn't have what it needs:
//   - if `codex` isn't on PATH → the whole describe is skipped
//   - if no auth is available (neither OPENAI_API_KEY nor SILSOL_E2E_CODEX_AUTHED=1)
//     → the LLM-touching tests skip and only the binary-resolution test runs
//
// Run with: `npm run test:e2e` from server/. Set OPENAI_API_KEY to your codex
// key (or SILSOL_E2E_CODEX_AUTHED=1 if codex is already host-logged-in via
// `codex login`) to enable the slow tests.

import { spawnSync } from 'node:child_process';
import { CodexCliProvider } from '../src/llm/providers/codex-cli.provider';
import type { StreamChunk } from '../src/llm/llm-provider.interface';
import type { LlmSettings } from '../src/settings/settings.service';

function codexAvailable(): boolean {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(cmd, ['codex'], { encoding: 'utf8' });
  return result.status === 0;
}

const HAS_CODEX = codexAvailable();
const HAS_AUTH = Boolean(
  process.env.OPENAI_API_KEY ?? process.env.SILSOL_E2E_CODEX_AUTHED,
);

const describeIfCodex = HAS_CODEX ? describe : describe.skip;
const itIfAuth = HAS_AUTH ? it : it.skip;

function settings(overrides: Partial<LlmSettings> = {}): LlmSettings {
  return {
    providerType: 'codex-cli',
    modelName: '',
    apiKey: process.env.OPENAI_API_KEY,
    ...overrides,
  };
}

describeIfCodex('CodexCliProvider (real codex binary)', () => {
  beforeAll(() => {
    if (!HAS_CODEX) return;
    console.log(
      `[e2e] codex resolved on PATH; auth=${HAS_AUTH ? 'present' : 'missing (slow tests will skip)'}`,
    );
  });

  it('binaryExists() resolves true when codex is on PATH', async () => {
    const p = new CodexCliProvider(settings());
    const exists = await (
      p as unknown as { binaryExists(): Promise<boolean> }
    ).binaryExists();
    expect(exists).toBe(true);
  });

  itIfAuth(
    'checkConnection() spawns codex and reports success',
    async () => {
      const p = new CodexCliProvider(settings());
      const result = await p.checkConnection();
      if (!result.success) {
        // Surface the underlying message so a failed run is debuggable
        // without having to attach to the process logs.
        console.error(`[e2e] codex checkConnection failed: ${result.message}`);
      }
      expect(result.success).toBe(true);
      expect(result.message).toMatch(/reachable/i);
    },
    60_000,
  );

  itIfAuth(
    'stream() produces at least one text chunk and a finish',
    async () => {
      const p = new CodexCliProvider(settings());
      const chunks: StreamChunk[] = [];
      const ac = new AbortController();
      // Hard ceiling on top of Jest's timeout so a runaway codex doesn't
      // keep the worker alive past the test boundary.
      const watchdog = setTimeout(() => ac.abort(), 80_000);
      try {
        for await (const c of p.stream({
          sessionId: 'e2e-codex-sess',
          messages: [
            {
              role: 'user',
              content:
                'Reply with exactly the single word "ok" and nothing else.',
            },
          ],
          signal: ac.signal,
        })) {
          chunks.push(c);
        }
      } finally {
        clearTimeout(watchdog);
      }

      const textChunks = chunks.filter((c) => c.type === 'text');
      const finishChunks = chunks.filter((c) => c.type === 'finish');

      // Useful debugging breadcrumb when this fails — codex sometimes emits
      // only an [codex exited ...] error chunk if auth is bad.
      if (textChunks.length === 0 || finishChunks.length === 0) {
        console.error(
          `[e2e] unexpected codex stream output: ${JSON.stringify(chunks)}`,
        );
      }

      expect(textChunks.length).toBeGreaterThan(0);
      expect(finishChunks.length).toBeGreaterThan(0);
      const aggregated = textChunks.map((c) => c.text ?? '').join('');
      expect(aggregated.length).toBeGreaterThan(0);
    },
    90_000,
  );
});
