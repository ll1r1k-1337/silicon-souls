import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.providers.js';
import { systemSettings } from '../database/schema.js';
import { ChatOpenAI } from '@langchain/openai';

export interface LlmSettings {
  baseURL?: string;
  apiKey: string;
  modelName: string;
}

@Injectable()
export class SettingsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async getSettings(): Promise<LlmSettings | null> {
    const rows = await this.db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'llm'));

    if (rows.length === 0 || !rows[0].value) return null;
    return rows[0].value as LlmSettings;
  }

  async updateSettings(data: LlmSettings): Promise<void> {
    const existing = await this.db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'llm'));

    if (existing.length === 0) {
      await this.db.insert(systemSettings).values({
        key: 'llm',
        value: data,
      });
    } else {
      await this.db
        .update(systemSettings)
        .set({ value: data })
        .where(eq(systemSettings.key, 'llm'));
    }
  }

  async checkConnection(
    data: LlmSettings,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const llm = new ChatOpenAI({
        openAIApiKey: data.apiKey,
        apiKey: data.apiKey,
        modelName: data.modelName,
        configuration: data.baseURL ? { baseURL: data.baseURL } : undefined,
        maxTokens: 5,
      });

      await llm.invoke('Say "ok"');

      return { success: true, message: 'Connection successful! Model is reachable.' };
    } catch (err: any) {
      return {
        success: false,
        message: `Connection failed: ${err.message ?? 'Unknown error'}`,
      };
    }
  }
}
