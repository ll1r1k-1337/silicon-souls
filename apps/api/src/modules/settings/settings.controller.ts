import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { OpenAiCompatibleProvider } from '../llm/openai-compatible.provider';
import { SettingsService } from './settings.service';
import type { PublicLlmSettings } from './settings.types';

const SaveLlmSettingsSchema = z.object({
  baseUrl: z.string().url(),
  model: z.string().min(1),
  apiKey: z.string().optional(),
});

const TestLlmSettingsSchema = z
  .object({
    baseUrl: z.string().url().optional(),
    model: z.string().min(1).optional(),
    apiKey: z.string().optional(),
  })
  .optional();

interface TestLlmSettingsResponse {
  ok: boolean;
  providerType: 'openai_compatible';
  model: string;
  baseUrl: string;
  message: string;
  error?: string;
}

@Controller('settings/llm')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async getLlmSettings(): Promise<PublicLlmSettings> {
    return this.settings.getPublicLlmSettings();
  }

  @Put()
  async saveLlmSettings(@Body() body: unknown): Promise<PublicLlmSettings> {
    const input = SaveLlmSettingsSchema.parse(body);
    return this.settings.saveLlmSettings(input);
  }

  @Post('test')
  async testLlmSettings(@Body() body: unknown): Promise<TestLlmSettingsResponse> {
    const input = TestLlmSettingsSchema.parse(body) ?? {};
    const settings = await this.settings.buildTestSettings(input);

    if (!settings.isConfigured || !settings.apiKey) {
      return {
        ok: false,
        providerType: settings.providerType,
        model: settings.model,
        baseUrl: settings.baseUrl,
        message: 'LLM provider is not configured.',
        error: 'Missing baseUrl, model, or apiKey.',
      };
    }

    try {
      const provider = new OpenAiCompatibleProvider({
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        model: settings.model,
        temperature: Number(this.config.get<string>('LLM_TEMPERATURE') ?? 0.2),
        timeoutMs: Number(this.config.get<string>('LLM_TIMEOUT_MS') ?? 30000),
        maxRetries: Number(this.config.get<string>('LLM_MAX_RETRIES') ?? 2),
      });
      await provider.invoke([
        {
          role: 'user',
          content: 'Reply with exactly: ok',
        },
      ]);

      return {
        ok: true,
        providerType: settings.providerType,
        model: settings.model,
        baseUrl: settings.baseUrl,
        message: 'Connection successful.',
      };
    } catch (error) {
      return {
        ok: false,
        providerType: settings.providerType,
        model: settings.model,
        baseUrl: settings.baseUrl,
        message: 'Connection failed.',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
