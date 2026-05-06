import { defineStore } from 'pinia';
import { apiRequest } from '@/shared/api/client';

export interface PublicLlmSettings {
  providerType: 'openai_compatible';
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  apiKeyMasked?: string;
  isConfigured: boolean;
  updatedAt?: string;
}

export interface TestLlmSettingsResult {
  ok: boolean;
  providerType: string;
  model: string;
  baseUrl: string;
  message: string;
  error?: string;
}

export const useSettingsStore = defineStore('settingsStore', {
  state: () => ({
    llm: undefined as PublicLlmSettings | undefined,
    loading: false,
    saving: false,
    testing: false,
    error: undefined as string | undefined,
    testResult: undefined as TestLlmSettingsResult | undefined,
  }),
  actions: {
    async loadLlmSettings() {
      this.loading = true;
      this.error = undefined;
      try {
        this.llm = await apiRequest<PublicLlmSettings>('/settings/llm');
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
    async saveLlmSettings(input: { baseUrl: string; model: string; apiKey?: string }) {
      this.saving = true;
      this.error = undefined;
      try {
        this.llm = await apiRequest<PublicLlmSettings>('/settings/llm', {
          method: 'PUT',
          body: JSON.stringify(input),
        });
        return this.llm;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        this.saving = false;
      }
    },
    async testLlmSettings(input: { baseUrl?: string; model?: string; apiKey?: string }) {
      this.testing = true;
      this.testResult = undefined;
      this.error = undefined;
      try {
        this.testResult = await apiRequest<TestLlmSettingsResult>('/settings/llm/test', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        return this.testResult;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        this.testing = false;
      }
    },
  },
});
