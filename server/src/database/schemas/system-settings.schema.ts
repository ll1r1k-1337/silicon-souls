import type { RxJsonSchema } from 'rxdb';

export type ProviderType = 'openai' | 'claude-cli' | 'codex-cli' | 'gemini-cli';

export interface SystemSettingDoc {
  key: string;
  providerType: ProviderType;
  baseURL: string;
  apiKey: string;
  modelName: string;
}

export const systemSettingSchema: RxJsonSchema<SystemSettingDoc> = {
  version: 0,
  primaryKey: 'key',
  type: 'object',
  properties: {
    key: { type: 'string', maxLength: 64 },
    providerType: {
      type: 'string',
      enum: ['openai', 'claude-cli', 'codex-cli', 'gemini-cli'],
      maxLength: 16,
    },
    baseURL: { type: 'string' },
    apiKey: { type: 'string' },
    modelName: { type: 'string' },
  },
  required: ['key', 'providerType', 'modelName'],
};
