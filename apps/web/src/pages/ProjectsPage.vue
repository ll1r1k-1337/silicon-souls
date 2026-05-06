<template>
  <main class="page">
    <section class="projects-shell">
      <header class="page-header">
        <div>
          <p class="eyebrow">Stage 0</p>
          <h1>SDD projects</h1>
        </div>
        <div class="topbar-actions">
          <StatusBadge label="local-first" tone="info" />
          <BaseButton :icon="Settings" variant="ghost" type="button" @click="ui.settingsOpen = true">
            Settings
          </BaseButton>
        </div>
      </header>

      <form class="project-form" @submit.prevent="create">
        <input v-model="name" class="input" placeholder="Project name" />
        <textarea
          v-model="description"
          class="textarea"
          rows="3"
          placeholder="Short product idea or project description"
        />
        <BaseButton :icon="Plus" variant="primary" :disabled="!name.trim()">Create</BaseButton>
      </form>

      <div class="project-grid">
        <article v-for="project in store.projects" :key="project.id" class="project-card">
          <div class="card-topline">
            <h2>{{ project.name }}</h2>
            <StatusBadge :label="project.status" :tone="statusTone(project.status)" />
          </div>
          <p>{{ project.description || 'No description yet.' }}</p>
          <div class="card-footer">
            <span>{{ new Date(project.updatedAt).toLocaleString() }}</span>
            <RouterLink class="link-button" :to="`/projects/${project.id}`">Open</RouterLink>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { Plus, Settings } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { ProjectStatus } from '@sdd/domain';
import BaseButton from '@/shared/ui/BaseButton.vue';
import StatusBadge from '@/shared/ui/StatusBadge.vue';
import { useProjectStore } from '@/stores/projectStore';
import { useUiStore } from '@/stores/uiStore';

const store = useProjectStore();
const ui = useUiStore();
const router = useRouter();
const name = ref('');
const description = ref('');

onMounted(() => store.loadProjects());

async function create() {
  const project = await store.createProject({
    name: name.value,
    description: description.value || undefined,
  });
  await router.push(`/projects/${project.id}`);
}

function statusTone(status: ProjectStatus) {
  if (status === 'ready_for_decomposition') return 'success';
  if (status === 'specification_in_progress') return 'info';
  if (status === 'archived') return 'neutral';
  return 'warning';
}
</script>
