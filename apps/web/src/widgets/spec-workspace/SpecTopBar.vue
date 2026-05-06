<template>
  <header class="topbar">
    <div class="topbar-main">
      <RouterLink class="subtle-link" :to="`/projects/${workspace?.project.id}`">
        {{ workspace?.project.name }}
      </RouterLink>
      <div class="topbar-status">
        <StatusBadge :label="workspace?.session.status || 'loading'" tone="info" />
        <StatusBadge
          :label="settings.llm?.isConfigured ? settings.llm.model : 'mock LLM'"
          :tone="settings.llm?.isConfigured ? 'success' : 'warning'"
        />
        <span>Version {{ workspace?.versions[0]?.version || 'none' }}</span>
        <span v-if="jobStore.processing" class="processing">processing</span>
      </div>
    </div>
    <nav class="topbar-actions" aria-label="Specification actions">
      <BaseButton :icon="FileText" variant="secondary" @click="store.generateDraft()">
        Generate Draft
      </BaseButton>
      <BaseButton :icon="SearchCheck" variant="secondary" @click="store.reviewSpec()">
        Review
      </BaseButton>
      <BaseButton
        :icon="CheckCircle"
        variant="primary"
        :disabled="!store.canApprove"
        @click="store.approveSpec()"
      >
        Approve
      </BaseButton>
      <BaseButton :icon="Boxes" variant="ghost" @click="ui.artifactsOpen = true">
        Artifacts
      </BaseButton>
      <BaseButton :icon="PanelRight" variant="ghost" @click="ui.reviewOpen = true">
        Review
      </BaseButton>
      <BaseButton :icon="History" variant="ghost" @click="ui.versionsOpen = true">
        Versions
      </BaseButton>
      <BaseButton :icon="Download" variant="ghost" @click="ui.exportOpen = true">
        Export
      </BaseButton>
      <BaseButton :icon="Settings" variant="ghost" @click="ui.settingsOpen = true">
        Settings
      </BaseButton>
    </nav>
  </header>
</template>

<script setup lang="ts">
import {
  Boxes,
  CheckCircle,
  Download,
  FileText,
  History,
  PanelRight,
  SearchCheck,
  Settings,
} from 'lucide-vue-next';
import { computed, onMounted } from 'vue';
import BaseButton from '@/shared/ui/BaseButton.vue';
import StatusBadge from '@/shared/ui/StatusBadge.vue';
import { useBackgroundJobStore } from '@/stores/backgroundJobStore';
import { useSpecSessionStore } from '@/stores/specSessionStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';

const store = useSpecSessionStore();
const ui = useUiStore();
const jobStore = useBackgroundJobStore();
const settings = useSettingsStore();
const workspace = computed(() => store.workspace);

onMounted(() => settings.loadLlmSettings());
</script>
