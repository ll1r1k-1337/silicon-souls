<template>
  <AppDrawer :open="ui.versionsOpen" title="Version History" @close="ui.versionsOpen = false">
    <article v-for="version in versions" :key="version.id" class="version-card">
      <header>
        <h3>{{ version.version }}</h3>
        <StatusBadge :label="version.status" tone="info" />
      </header>
      <p>{{ version.changeSummary }}</p>
      <footer>
        <span>{{ version.createdBy }}</span>
        <span>{{ new Date(version.createdAt).toLocaleString() }}</span>
      </footer>
    </article>
  </AppDrawer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AppDrawer from '@/shared/ui/AppDrawer.vue';
import StatusBadge from '@/shared/ui/StatusBadge.vue';
import { useSpecSessionStore } from '@/stores/specSessionStore';
import { useUiStore } from '@/stores/uiStore';

const store = useSpecSessionStore();
const ui = useUiStore();
const versions = computed(() => store.versions);
</script>
