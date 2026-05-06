import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../shared/database/database.service';
import {
  llmProviderSettings,
  type LlmProviderSettingsRow,
} from '../../shared/database/schema';
import {
  LLM_SETTINGS_ID,
  type EffectiveLlmSettings,
  type PublicLlmSettings,
  type SaveLlmSettingsInput,
  type TestLlmSettingsInput,
} from './settings.types';

export function maskApiKey(apiKey?: string | null): string | undefined {
  if (!apiKey) {
    return undefined;
  }

  if (apiKey.length <= 8) {
    return `${apiKey.slice(0, 2)}****${apiKey.slice(-2)}`;
  }

  return `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function normalizeModel(model: string): string {
  return model.trim();
}

function mapPublic(row: LlmProviderSettingsRow): PublicLlmSettings {
  return {
    providerType: 'openai_compatible',
    baseUrl: row.baseUrl,
    model: row.model,
    hasApiKey: Boolean(row.apiKey),
    apiKeyMasked: row.apiKeyMask ?? undefined,
    isConfigured: row.isConfigured,
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async getPublicLlmSettings(): Promise<PublicLlmSettings> {
    const row = await this.getRow();

    if (row) {
      return mapPublic(row);
    }

    const fallback = this.getEnvFallback();
    return {
      providerType: 'openai_compatible',
      baseUrl: fallback.baseUrl,
      model: fallback.model,
      hasApiKey: Boolean(fallback.apiKey),
      apiKeyMasked: maskApiKey(fallback.apiKey),
      isConfigured: fallback.isConfigured,
      updatedAt: fallback.updatedAt,
    };
  }

  async getEffectiveLlmSettings(): Promise<EffectiveLlmSettings> {
    const row = await this.getRow();

    if (row?.isConfigured && row.apiKey) {
      return {
        providerType: 'openai_compatible',
        baseUrl: row.baseUrl,
        model: row.model,
        apiKey: row.apiKey,
        isConfigured: true,
        updatedAt: row.updatedAt.toISOString(),
      };
    }

    return this.getEnvFallback();
  }

  async saveLlmSettings(input: SaveLlmSettingsInput): Promise<PublicLlmSettings> {
    const existing = await this.getRow();
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    const model = normalizeModel(input.model);
    const hasNewApiKey = typeof input.apiKey === 'string' && input.apiKey.trim().length > 0;
    const apiKey = hasNewApiKey ? input.apiKey!.trim() : existing?.apiKey;
    const now = new Date();

    const values = {
      id: LLM_SETTINGS_ID,
      providerType: 'openai_compatible',
      baseUrl,
      model,
      apiKey,
      apiKeyMask: maskApiKey(apiKey),
      isConfigured: Boolean(baseUrl && model && apiKey),
      updatedAt: now,
    };

    if (existing) {
      const [row] = await this.database.db
        .update(llmProviderSettings)
        .set(values)
        .where(eq(llmProviderSettings.id, LLM_SETTINGS_ID))
        .returning();
      return mapPublic(row);
    }

    const [row] = await this.database.db
      .insert(llmProviderSettings)
      .values({
        ...values,
        createdAt: now,
      })
      .returning();

    return mapPublic(row);
  }

  async buildTestSettings(input: TestLlmSettingsInput): Promise<EffectiveLlmSettings> {
    const current = await this.getEffectiveLlmSettings();
    const baseUrl = input.baseUrl ? normalizeBaseUrl(input.baseUrl) : current.baseUrl;
    const model = input.model ? normalizeModel(input.model) : current.model;
    const apiKey =
      typeof input.apiKey === 'string' && input.apiKey.trim().length > 0
        ? input.apiKey.trim()
        : current.apiKey;

    return {
      providerType: 'openai_compatible',
      baseUrl,
      model,
      apiKey,
      isConfigured: Boolean(baseUrl && model && apiKey),
      updatedAt: current.updatedAt,
    };
  }

  private async getRow(): Promise<LlmProviderSettingsRow | undefined> {
    const [row] = await this.database.db
      .select()
      .from(llmProviderSettings)
      .where(eq(llmProviderSettings.id, LLM_SETTINGS_ID))
      .limit(1);

    return row;
  }

  private getEnvFallback(): EffectiveLlmSettings {
    const baseUrl =
      this.config.get<string>('LLM_BASE_URL') ??
      this.config.get<string>('OPENAI_BASE_URL') ??
      'https://api.openai.com/v1';
    const model = this.config.get<string>('LLM_MODEL') ?? 'gpt-5.2';
    const apiKey = this.config.get<string>('OPENAI_API_KEY');

    return {
      providerType: 'openai_compatible',
      baseUrl,
      model,
      apiKey,
      isConfigured: Boolean(baseUrl && model && apiKey),
    };
  }
}
