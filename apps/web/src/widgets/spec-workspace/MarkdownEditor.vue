<template>
  <section class="editor-panel">
    <header class="editor-toolbar">
      <div class="segmented">
        <button :data-active="ui.editorMode === 'edit'" @click="ui.editorMode = 'edit'">Edit</button>
        <button :data-active="ui.editorMode === 'preview'" @click="ui.editorMode = 'preview'">
          Preview
        </button>
      </div>
      <div class="editor-actions">
        <span v-if="dirty" class="dirty">unsaved</span>
        <BaseButton :icon="Save" variant="primary" :disabled="!dirty" @click="save">
          Save
        </BaseButton>
      </div>
    </header>

    <textarea
      v-if="ui.editorMode === 'edit'"
      v-model="markdown"
      class="markdown-textarea"
      spellcheck="false"
    />
    <article v-else class="markdown-preview" v-html="html" />
  </section>
</template>

<script setup lang="ts">
import MarkdownIt from 'markdown-it';
import { Save } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import BaseButton from '@/shared/ui/BaseButton.vue';
import { useLocalDraftStore } from '@/stores/localDraftStore';
import { useSpecSessionStore } from '@/stores/specSessionStore';
import { useUiStore } from '@/stores/uiStore';

const md = new MarkdownIt({ html: false, linkify: true });
const store = useSpecSessionStore();
const drafts = useLocalDraftStore();
const ui = useUiStore();
const markdown = ref('');
const sessionId = computed(() => store.workspace?.session.id ?? '');
const sourceMarkdown = computed(() => store.workspace?.document?.markdown ?? '');
const dirty = computed(() => markdown.value !== sourceMarkdown.value);
const html = computed(() => md.render(markdown.value));

watch(
  () => store.workspace?.document?.markdown,
  () => {
    const id = sessionId.value;
    markdown.value = id && drafts.drafts[id] ? drafts.drafts[id] : sourceMarkdown.value;
  },
  { immediate: true },
);

watch(markdown, (value) => {
  if (sessionId.value && value !== sourceMarkdown.value) {
    drafts.setDraft(sessionId.value, value);
  }
});

async function save() {
  await store.saveDocument(markdown.value);
}
</script>
