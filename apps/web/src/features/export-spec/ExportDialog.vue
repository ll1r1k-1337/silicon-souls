<template>
  <Teleport to="body">
    <div v-if="ui.exportOpen" class="modal-backdrop" @click="ui.exportOpen = false">
      <section class="modal" @click.stop>
        <header class="drawer-header">
          <h2>Export specification</h2>
          <button class="icon-button" aria-label="Close" @click="ui.exportOpen = false">
            <X :size="18" />
          </button>
        </header>
        <div class="export-options">
          <a class="export-tile" :href="url('markdown')" target="_blank">
            <FileText :size="20" />
            <span>Markdown</span>
          </a>
          <a class="export-tile" :href="url('json')" target="_blank">
            <Braces :size="20" />
            <span>JSON</span>
          </a>
          <a class="export-tile" :href="url('bundle')" target="_blank">
            <PackageOpen :size="20" />
            <span>Bundle</span>
          </a>
        </div>
        <ul class="bundle-list">
          <li>product.md</li>
          <li>requirements.json</li>
          <li>assumptions.json</li>
          <li>open-questions.json</li>
          <li>acceptance-criteria.json</li>
          <li>risks.json</li>
          <li>changelog.md</li>
          <li>spec-meta.json</li>
        </ul>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { Braces, FileText, PackageOpen, X } from 'lucide-vue-next';
import { exportUrl } from '@/shared/api/client';
import { useSpecSessionStore } from '@/stores/specSessionStore';
import { useUiStore } from '@/stores/uiStore';

const ui = useUiStore();
const store = useSpecSessionStore();

function url(format: 'markdown' | 'json' | 'bundle') {
  return store.session ? exportUrl(store.session.id, format) : '#';
}
</script>
