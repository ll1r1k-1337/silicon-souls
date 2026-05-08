<template>
  <AppDrawer :open="ui.artifactsOpen" title="Structure" @close="ui.artifactsOpen = false">
    <div class="filter-row">
      <select v-model="filter" class="select">
        <option value="">All types</option>
        <option v-for="type in types" :key="type" :value="type">
          {{ artifactTypeLabel(type) }}
        </option>
      </select>
    </div>
    <article
      v-for="artifact in visibleArtifacts"
      :key="artifact.id"
      class="artifact-card"
      :data-kind="artifact.artifactType"
    >
      <header>
        <h3>{{ titleOf(artifact) }}</h3>
        <StatusBadge :label="artifact.status" :tone="artifact.status === 'rejected' ? 'danger' : 'info'" />
      </header>
      <p v-if="descriptionOf(artifact)">{{ descriptionOf(artifact) }}</p>
      <dl class="artifact-meta">
        <div>
          <dt>Type</dt>
          <dd>{{ artifactTypeLabel(artifact.artifactType) }}</dd>
        </div>
        <div v-if="answerOf(artifact)">
          <dt>Answer</dt>
          <dd>{{ answerOf(artifact) }}</dd>
        </div>
      </dl>
    </article>
  </AppDrawer>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { SpecArtifact } from '@sdd/domain';
import { artifactTypeLabel } from '@/shared/artifacts/labels';
import { answerOf, payloadOf } from '@/shared/artifacts/openQuestions';
import AppDrawer from '@/shared/ui/AppDrawer.vue';
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
  const payload = payloadOf(artifact);
  return String(payload.title ?? payload.question ?? payload.name ?? payload.text ?? artifact.id);
}

function descriptionOf(artifact: SpecArtifact) {
  const payload = payloadOf(artifact);
  return String(payload.description ?? payload.whyItMatters ?? payload.reason ?? '');
}
</script>
