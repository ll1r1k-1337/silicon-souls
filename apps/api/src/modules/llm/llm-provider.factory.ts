import { ConfigService } from '@nestjs/config';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';
import type { LlmProvider } from './llm.interfaces';
import { MockLlmProvider } from './mock-llm.provider';

export function createLlmProvider(config: ConfigService): LlmProvider {
  const provider = config.get<string>('LLM_PROVIDER') ?? 'openai';
  const apiKey = config.get<string>('OPENAI_API_KEY');

  if (provider === 'openai' && apiKey) {
    return new OpenAiCompatibleProvider({
      apiKey,
      baseUrl:
        config.get<string>('LLM_BASE_URL') ??
        config.get<string>('OPENAI_BASE_URL') ??
        'https://api.openai.com/v1',
      model: config.get<string>('LLM_MODEL') ?? 'gpt-5.2',
      temperature: Number(config.get<string>('LLM_TEMPERATURE') ?? 0.2),
      timeoutMs: Number(config.get<string>('LLM_TIMEOUT_MS') ?? 30000),
      maxRetries: Number(config.get<string>('LLM_MAX_RETRIES') ?? 2),
    });
  }

  return new MockLlmProvider();
}
