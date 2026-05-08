<template>
  <AppDrawer :open="ui.systemLogsOpen" title="System Logs" @close="ui.systemLogsOpen = false">
    <section class="system-log-toolbar">
      <StatusBadge
        :label="`${logs.activeJobCount} active jobs`"
        :tone="logs.activeJobCount > 0 ? 'warning' : 'neutral'"
      />
      <span v-if="logs.logs" class="log-updated">Updated {{ formatTime(logs.logs.generatedAt) }}</span>
      <BaseButton :icon="RefreshCw" variant="ghost" :disabled="logs.loading" @click="load">
        Refresh
      </BaseButton>
    </section>

    <p v-if="logs.error" class="form-error">{{ logs.error }}</p>

    <section class="system-log-section">
      <h3>Jobs</h3>
      <article v-for="job in logs.logs?.jobs ?? []" :key="job.id" class="log-entry">
        <header>
          <strong>{{ job.type }}</strong>
          <StatusBadge :label="job.status" :tone="statusTone(job.status)" />
        </header>
        <p class="log-meta">
          <span>{{ job.id }}</span>
          <span>{{ formatTime(job.updatedAt) }}</span>
          <span>{{ job.attempts }}/{{ job.maxAttempts }} attempts</span>
        </p>
        <pre v-if="hasJobDetails(job)" class="log-payload">{{ formatJson({
          payload: job.payload,
          result: job.result,
          error: job.error,
          lockedBy: job.lockedBy,
        }) }}</pre>
      </article>
      <p v-if="!logs.loading && (logs.logs?.jobs.length ?? 0) === 0" class="empty-state">
        No jobs for this session.
      </p>
    </section>

    <section class="system-log-section">
      <h3>LLM invocations</h3>
      <article
        v-for="invocation in logs.logs?.llmInvocations ?? []"
        :key="invocation.id"
        class="log-entry"
      >
        <header>
          <strong>{{ invocation.chainName }}</strong>
          <StatusBadge :label="invocation.status" :tone="statusTone(invocation.status)" />
        </header>
        <p class="log-meta">
          <span>{{ invocation.model }}</span>
          <span>{{ formatTime(invocation.createdAt) }}</span>
          <span v-if="invocation.durationMs">{{ invocation.durationMs }} ms</span>
          <span v-if="invocation.totalTokens">{{ invocation.totalTokens }} tokens</span>
        </p>
        <pre v-if="hasInvocationDetails(invocation)" class="log-payload">{{ formatJson({
          traceId: invocation.traceId,
          provider: invocation.provider,
          promptVersion: invocation.promptVersion,
          errorCode: invocation.errorCode,
          metadata: invocation.metadata,
        }) }}</pre>
      </article>
      <p v-if="!logs.loading && (logs.logs?.llmInvocations.length ?? 0) === 0" class="empty-state">
        No LLM calls for this session.
      </p>
    </section>

    <section class="system-log-section">
      <h3>Events</h3>
      <article v-for="event in logs.logs?.events ?? []" :key="event.id" class="log-entry">
        <header>
          <strong>{{ event.eventType }}</strong>
          <span>{{ event.aggregateType }}</span>
        </header>
        <p class="log-meta">
          <span>{{ event.aggregateId }}</span>
          <span>{{ formatTime(event.createdAt) }}</span>
        </p>
        <pre class="log-payload">{{ formatJson({
          payload: event.payload,
          metadata: event.metadata,
        }) }}</pre>
      </article>
      <p v-if="!logs.loading && (logs.logs?.events.length ?? 0) === 0" class="empty-state">
        No events for this session.
      </p>
    </section>
  </AppDrawer>
</template>

<script setup lang="ts">
import { RefreshCw } from 'lucide-vue-next';
import { computed, onUnmounted, watch } from 'vue';
import AppDrawer from '@/shared/ui/AppDrawer.vue';
import BaseButton from '@/shared/ui/BaseButton.vue';
import StatusBadge from '@/shared/ui/StatusBadge.vue';
import { useSpecSessionStore } from '@/stores/specSessionStore';
import { useSystemLogStore } from '@/stores/systemLogStore';
import { useUiStore } from '@/stores/uiStore';
import type { SystemLogJob, SystemLogLlmInvocation } from '@/types';

const ui = useUiStore();
const sessionStore = useSpecSessionStore();
const logs = useSystemLogStore();
const sessionId = computed(() => sessionStore.session?.id);
let pollTimer: ReturnType<typeof setInterval> | undefined;

watch(
  () => [ui.systemLogsOpen, sessionId.value] as const,
  ([open]) => {
    stopPolling();
    if (open) {
      void load();
      pollTimer = setInterval(() => {
        void load();
      }, 2500);
    }
  },
  { immediate: true },
);

onUnmounted(stopPolling);

async function load(): Promise<void> {
  await logs.load(sessionId.value);
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (status === 'completed' || status === 'success') return 'success';
  if (status === 'queued' || status === 'running') return 'warning';
  if (status === 'failed' || status === 'error' || status === 'cancelled') return 'danger';
  return 'neutral';
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function formatJson(value: unknown): string {
  return JSON.stringify(removeEmpty(value), null, 2);
}

function hasJobDetails(job: SystemLogJob): boolean {
  return Boolean(job.payload || job.result || job.error || job.lockedBy);
}

function hasInvocationDetails(invocation: SystemLogLlmInvocation): boolean {
  return Boolean(invocation.errorCode || Object.keys(invocation.metadata ?? {}).length > 0);
}

function removeEmpty(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(removeEmpty);
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined && entry !== null)
      .map(([key, entry]) => [key, removeEmpty(entry)]),
  );
}
</script>
