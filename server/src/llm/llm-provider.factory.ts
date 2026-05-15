import type { LlmSettings } from '../settings/settings.service.js';
import type { LlmProvider } from './llm-provider.interface.js';
import { OpenAiHttpProvider } from './providers/openai-http.provider.js';
import { ClaudeCliProvider } from './providers/claude-cli.provider.js';
import { CodexCliProvider } from './providers/codex-cli.provider.js';
import { GeminiCliProvider } from './providers/gemini-cli.provider.js';

export function createProvider(settings: LlmSettings): LlmProvider {
  switch (settings.providerType) {
    case 'claude-cli':
      return new ClaudeCliProvider(settings);
    case 'codex-cli':
      return new CodexCliProvider(settings);
    case 'gemini-cli':
      return new GeminiCliProvider(settings);
    case 'openai':
    default:
      return new OpenAiHttpProvider(settings);
  }
}
