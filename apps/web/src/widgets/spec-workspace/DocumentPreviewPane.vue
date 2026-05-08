<template>
  <section class="document-preview-panel" data-testid="document-preview-panel">
    <header class="panel-header document-preview-header">
      <div>
        <h2>Document preview</h2>
        <p>{{ subtitle }}</p>
      </div>
      <StatusBadge
        :label="document?.projectionStatus === 'synced' ? 'Artifacts synced' : 'Artifacts stale'"
        :tone="document?.projectionStatus === 'synced' ? 'success' : 'warning'"
      />
    </header>

    <div v-if="selectedText" class="preview-selection-bar">
      <p>{{ selectedText }}</p>
      <div class="preview-selection-actions">
        <BaseButton variant="secondary" @click="useSelectionContext">Use in chat</BaseButton>
        <BaseButton variant="ghost" @click="clearSelection">Clear</BaseButton>
      </div>
    </div>

    <article
      ref="previewRef"
      class="markdown-preview document-preview-content"
      data-testid="document-preview-content"
      @mouseup="captureSelection"
      @keyup="captureSelection"
      v-html="renderedMarkdown"
    />
  </section>
</template>

<script setup lang="ts">
import MarkdownIt from 'markdown-it';
import { computed, ref } from 'vue';
import BaseButton from '@/shared/ui/BaseButton.vue';
import StatusBadge from '@/shared/ui/StatusBadge.vue';
import { useSpecSessionStore } from '@/stores/specSessionStore';
import { useUiStore } from '@/stores/uiStore';

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

const store = useSpecSessionStore();
const ui = useUiStore();
const previewRef = ref<HTMLElement | null>(null);
const selectedText = ref('');
const document = computed(() => store.document);
const subtitle = computed(() =>
  document.value
    ? 'Read-only preview. Ask the assistant in chat to propose changes.'
    : 'No generated document yet.',
);
const renderedMarkdown = computed(() => {
  const source = document.value?.markdown ?? '# Product Specification\n\nDocument is empty.';
  return markdown.render(source);
});

function captureSelection(): void {
  const root = previewRef.value;
  const selection = window.getSelection();
  if (!root || !selection || selection.rangeCount === 0) {
    selectedText.value = '';
    return;
  }

  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const isInside = root.contains(container.nodeType === Node.ELEMENT_NODE ? container : container.parentNode);
  if (!isInside) {
    selectedText.value = '';
    return;
  }

  const text = selection.toString().trim();
  selectedText.value = text.length >= 2 ? text : '';
}

function clearSelection(): void {
  selectedText.value = '';
  window.getSelection()?.removeAllRanges();
}

function useSelectionContext(): void {
  const session = store.workspace?.session;
  const current = document.value;
  const text = selectedText.value.trim();
  if (!session || !current || !text) return;
  const preview = text.length > 64 ? `${text.slice(0, 64)}…` : text;
  ui.setDocumentContext({
    documentId: current.id,
    sessionId: session.id,
    version: store.workspace?.versions[0]?.version,
    href: `#preview:${current.id}`,
    label: `Selection: ${preview}`,
    text,
  });
}
</script>
