<template>
  <AppDrawer :open="ui.artifactsOpen" title="Artifacts" @close="ui.artifactsOpen = false">
    <div class="filter-row">
      <select v-model="filter" class="select">
        <option value="">All types</option>
        <option v-for="type in types" :key="type" :value="type">{{ type }}</option>
      </select>
    </div>
    <article v-for="artifact in visibleArtifacts" :key="artifact.id" class="artifact-card">
      <header>
        <h3>{{ titleOf(artifact) }}</h3>
        <StatusBadge :label="artifact.status" :tone="artifact.status === 'rejected' ? 'danger' : 'info'" />
      </header>
      <p>{{ descriptionOf(artifact) }}</p>
      <dl>
        <div>
          <dt>Type</dt>
          <dd>{{ artifact.artifactType }}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{{ artifact.source.type }} / {{ artifact.source.confidence }}</dd>
        </div>
      </dl>
      <div class="artifact-actions">
        <BaseButton :icon="Check" variant="secondary" @click="store.updateArtifact(artifact, 'confirm')">
          Confirm
        </BaseButton>
        <BaseButton :icon="X" variant="ghost" @click="store.updateArtifact(artifact, 'reject')">
          Reject
        </BaseButton>
      </div>
    </article>
  </AppDrawer>
</template>

<script setup lang="ts">
import { Check, X } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import type { SpecArtifact } from '@sdd/domain';
import AppDrawer from '@/shared/ui/AppDrawer.vue';
import BaseButton from '@/shared/ui/BaseButton.vue';
import StatusBadge from '@/shared/ui/StatusBadge.vue';
import { useSpecSessionStore } from '@/stores/specSessionStore';
import { useUiStore } from '@/stores/uiStore';

const store = useSpecSessionStore();
const ui = useUiStore();
const filter = ref('');
const types = computed(() =>
  Array.from(new Set(store.artifacts.map((artifact) => artifact.artifactType))),
);
const visibleArtifacts = computed(() =>
  filter.value
    ? store.artifacts.filter((artifact) => artifact.artifactType === filter.value)
    : store.artifacts,
);

function titleOf(artifact: SpecArtifact) {
  const payload = artifact.payload as Record<string, unknown>;
  return String(payload.title ?? payload.question ?? payload.name ?? payload.text ?? artifact.id);
}

function descriptionOf(artifact: SpecArtifact) {
  const payload = artifact.payload as Record<string, unknown>;
  return String(payload.description ?? payload.whyItMatters ?? payload.reason ?? '');
}
</script>
