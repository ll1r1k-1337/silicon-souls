import { Inject, Injectable } from '@nestjs/common';
import {
  RXDB_DATABASE,
  type SilSolDatabase,
} from '../database/rxdb.providers.js';
import type { ProviderType } from '../database/schemas/system-settings.schema.js';

export type { ProviderType } from '../database/schemas/system-settings.schema.js';

export interface LlmSettings {
  providerType: ProviderType;
  baseURL?: string;
  apiKey?: string;
  modelName: string;
}

@Injectable()
export class SettingsService {
  constructor(
    @Inject(RXDB_DATABASE) private readonly db: SilSolDatabase,
  ) {}

  async getSettings(): Promise<LlmSettings | null> {
    const doc = await this.db.systemSettings.findOne('llm').exec();
    if (!doc) return null;
    const v = doc.toJSON();
    return {
      providerType: (v.providerType ?? 'openai') as ProviderType,
      baseURL: v.baseURL || undefined,
      apiKey: v.apiKey || undefined,
      modelName: v.modelName,
    };
  }

  async updateSettings(data: LlmSettings): Promise<void> {
    await this.db.systemSettings.upsert({
      key: 'llm',
      providerType: data.providerType ?? 'openai',
      baseURL: data.baseURL ?? '',
      apiKey: data.apiKey ?? '',
      modelName: data.modelName,
    });
  }

  async checkConnection(
    data: LlmSettings,
  ): Promise<{ success: boolean; message: string }> {
    const { createProvider } = await import('../llm/llm-provider.factory.js');
    try {
      const provider = createProvider(data);
      return await provider.checkConnection();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Connection failed: ${msg}` };
    }
  }
}
