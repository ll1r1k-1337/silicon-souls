<template>
  <main class="page">
    <section v-if="project" class="details-shell">
      <header class="page-header">
        <div>
          <RouterLink class="subtle-link" to="/">Projects</RouterLink>
          <h1>{{ project.name }}</h1>
          <p>{{ project.description }}</p>
        </div>
        <StatusBadge :label="project.status" tone="info" />
      </header>

      <div class="details-grid">
        <section class="panel">
          <h2>Current specification</h2>
          <dl class="metric-list">
            <div>
              <dt>Status</dt>
              <dd>{{ project.status }}</dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd>{{ project.currentSpecSessionId || 'not started' }}</dd>
            </div>
          </dl>
          <RouterLink
            v-if="project.currentSpecSessionId"
            class="link-button primary"
            :to="`/sessions/${project.currentSpecSessionId}`"
          >
            Continue specification
          </RouterLink>
        </section>

        <form class="panel" @submit.prevent="start">
          <h2>Start spec session</h2>
          <textarea
            v-model="rawIdea"
            class="textarea tall"
            placeholder="Describe the raw product idea"
          />
          <BaseButton :icon="Play" variant="primary" :disabled="!rawIdea.trim()">
            Start Spec Session
          </BaseButton>
        </form>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { Play } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BaseButton from '@/shared/ui/BaseButton.vue';
import StatusBadge from '@/shared/ui/StatusBadge.vue';
import { useProjectStore } from '@/stores/projectStore';
import { useSpecSessionStore } from '@/stores/specSessionStore';

const route = useRoute();
const router = useRouter();
const projectStore = useProjectStore();
const sessionStore = useSpecSessionStore();
const rawIdea = ref('');
const projectId = computed(() => String(route.params.projectId));
const project = computed(() => projectStore.currentProject);

onMounted(async () => {
  const loaded = await projectStore.loadProject(projectId.value);
  rawIdea.value = loaded.description ?? '';
});

async function start() {
  const sessionId = await sessionStore.startSession(projectId.value, rawIdea.value);
  await router.push(`/sessions/${sessionId}`);
}
</script>
