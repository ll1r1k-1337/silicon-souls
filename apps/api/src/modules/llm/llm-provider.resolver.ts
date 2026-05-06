import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';
import type { EffectiveLlmSettings } from '../settings/settings.types';
import { MockLlmProvider } from './mock-llm.provider';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';
import type { LlmProvider } from './llm.interfaces';

@Injectable()
export class LlmProviderResolver {
  constructor(
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
  ) {}

  async resolve(): Promise<LlmProvider> {
    const settings = await this.settings.getEffectiveLlmSettings();

    if (!settings.isConfigured || !settings.apiKey) {
      return new MockLlmProvider();
    }

    return this.createProviderFromSettings(settings);
  }

  createProviderFromSettings(settings: EffectiveLlmSettings): LlmProvider {
    if (!settings.apiKey) {
      return new MockLlmProvider();
    }

    return new OpenAiCompatibleProvider({
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
      model: settings.model,
      temperature: Number(this.config.get<string>('LLM_TEMPERATURE') ?? 0.2),
      timeoutMs: Number(this.config.get<string>('LLM_TIMEOUT_MS') ?? 30000),
      maxRetries: Number(this.config.get<string>('LLM_MAX_RETRIES') ?? 2),
    });
  }
}
