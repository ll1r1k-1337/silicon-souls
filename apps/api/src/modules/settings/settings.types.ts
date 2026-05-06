export const LLM_SETTINGS_ID = 'default';

export interface PublicLlmSettings {
  providerType: 'openai_compatible';
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  apiKeyMasked?: string;
  isConfigured: boolean;
  updatedAt?: string;
}

export interface EffectiveLlmSettings {
  providerType: 'openai_compatible';
  baseUrl: string;
  model: string;
  apiKey?: string;
  isConfigured: boolean;
  updatedAt?: string;
}

export interface SaveLlmSettingsInput {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface TestLlmSettingsInput {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}
