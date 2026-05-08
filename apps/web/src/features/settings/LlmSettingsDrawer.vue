<template>
  <AppDrawer :open="ui.settingsOpen" title="LLM Settings" @close="ui.settingsOpen = false">
    <form class="settings-form" data-testid="llm-settings-form" @submit.prevent="save">
      <label>
        <span>BASE_URL</span>
        <input
          v-model="baseUrl"
          class="input"
          placeholder="https://api.openai.com/v1"
          data-testid="llm-base-url-input"
        />
      </label>
      <label>
        <span>Model</span>
        <input
          v-model="model"
          class="input"
          placeholder="gpt-5.2"
          data-testid="llm-model-input"
        />
      </label>
      <label>
        <span>API_KEY</span>
        <input
          v-model="apiKey"
          class="input"
          type="password"
          autocomplete="off"
          :placeholder="placeholder"
        />
      </label>

      <div class="settings-status" data-testid="llm-settings-status">
        <StatusBadge
          :label="settings.llm?.isConfigured ? 'configured' : 'not configured'"
          :tone="settings.llm?.isConfigured ? 'success' : 'warning'"
        />
        <span v-if="settings.llm?.apiKeyMasked">{{ settings.llm.apiKeyMasked }}</span>
      </div>

      <div
        v-if="settings.testResult"
        class="test-result"
        :data-ok="settings.testResult.ok"
        data-testid="llm-test-result"
      >
        <strong>{{ settings.testResult.message }}</strong>
        <p v-if="settings.testResult.error">{{ settings.testResult.error }}</p>
      </div>

      <p v-if="settings.error" class="form-error">{{ settings.error }}</p>

      <div class="settings-actions">
        <BaseButton :icon="PlugZap" variant="secondary" type="button" @click="test">
          {{ settings.testing ? 'Testing' : 'Test structured output' }}
        </BaseButton>
        <BaseButton :icon="Save" variant="primary" :disabled="!canSave">
          {{ settings.saving ? 'Saving' : 'Save' }}
        </BaseButton>
      </div>
    </form>
  </AppDrawer>
</template>

<script setup lang="ts">
import { PlugZap, Save } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import AppDrawer from '@/shared/ui/AppDrawer.vue';
import BaseButton from '@/shared/ui/BaseButton.vue';
import StatusBadge from '@/shared/ui/StatusBadge.vue';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';

const settings = useSettingsStore();
const ui = useUiStore();
const baseUrl = ref('');
const model = ref('');
const apiKey = ref('');

const placeholder = computed(() =>
  settings.llm?.hasApiKey
    ? `Keep existing key (${settings.llm.apiKeyMasked})`
    : 'Enter provider API key',
);
const canSave = computed(() => baseUrl.value.trim().length > 0 && model.value.trim().length > 0);

watch(
  () => ui.settingsOpen,
  async (open) => {
    if (!open) return;
    await settings.loadLlmSettings();
    baseUrl.value = settings.llm?.baseUrl ?? 'https://api.openai.com/v1';
    model.value = settings.llm?.model ?? '';
    apiKey.value = '';
  },
);

async function save() {
  await settings.saveLlmSettings({
    baseUrl: baseUrl.value,
    model: model.value,
    apiKey: apiKey.value.trim() || undefined,
  });
  apiKey.value = '';
}

async function test() {
  await settings.testLlmSettings({
    baseUrl: baseUrl.value,
    model: model.value,
    apiKey: apiKey.value.trim() || undefined,
  });
}
</script>
