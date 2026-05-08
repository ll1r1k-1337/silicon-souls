<template>
  <header class="topbar" data-testid="spec-topbar">
    <div class="topbar-main">
      <RouterLink class="subtle-link" :to="`/projects/${workspace?.project.id}`">
        {{ workspace?.project.name }}
      </RouterLink>
      <div class="topbar-status">
        <StatusBadge
          data-testid="session-status"
          :label="workspace?.session.statusLabel || workspace?.session.status || 'loading'"
          tone="info"
          :title="workspace?.session.statusDescription || workspace?.session.status"
        />
        <StatusBadge
          data-testid="llm-status"
          :label="settings.llm?.isConfigured ? settings.llm.model : 'mock LLM'"
          :tone="settings.llm?.isConfigured ? 'success' : 'warning'"
        />
        <span data-testid="spec-version">Version {{ workspace?.versions[0]?.version || 'none' }}</span>
        <span v-if="jobStore.processing" class="processing" data-testid="processing-status">processing</span>
      </div>
    </div>
    <nav class="topbar-actions" aria-label="Specification actions">
      <BaseButton :icon="FileText" variant="secondary" @click="store.generateDraft()">
        Generate
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
      <details class="overflow-menu">
        <summary class="button button-ghost">
          <MoreHorizontal class="button-icon" aria-hidden="true" />
          <span>More</span>
        </summary>
        <div class="overflow-menu-body">
          <button type="button" @click="ui.artifactsOpen = true">
            <Boxes aria-hidden="true" />
            Structure
          </button>
          <button type="button" @click="ui.reviewOpen = true">
            <PanelRight aria-hidden="true" />
            Full review
          </button>
          <button type="button" @click="ui.versionsOpen = true">
            <History aria-hidden="true" />
            Versions
          </button>
          <button type="button" @click="ui.exportOpen = true">
            <Download aria-hidden="true" />
            Export
          </button>
          <button type="button" @click="ui.systemLogsOpen = true">
            <Activity aria-hidden="true" />
            Logs
          </button>
          <button type="button" @click="ui.settingsOpen = true">
            <Settings aria-hidden="true" />
            Settings
          </button>
        </div>
      </details>
    </nav>
  </header>
</template>

<script setup lang="ts">
import {
  Activity,
  Boxes,
  CheckCircle,
  Download,
  FileText,
  History,
  MoreHorizontal,
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
