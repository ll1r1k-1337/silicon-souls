<template>
  <aside class="chat-panel">
    <div class="panel-header">
      <h2>Conversation</h2>
      <StatusBadge :label="`${messages.length} turns`" tone="neutral" />
    </div>
    <div class="message-list">
      <article
        v-for="message in messages"
        :key="message.id"
        class="message"
        :data-role="message.role"
      >
        <header>{{ message.role }}</header>
        <p>{{ message.content }}</p>
      </article>
    </div>
    <form class="chat-form" @submit.prevent="send">
      <textarea
        v-model="draft"
        class="textarea"
        rows="4"
        placeholder="Answer questions, add requirements, or use /generate-draft"
      />
      <BaseButton :icon="Send" variant="primary" :disabled="!draft.trim()">Send</BaseButton>
    </form>
  </aside>
</template>

<script setup lang="ts">
import { Send } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import BaseButton from '@/shared/ui/BaseButton.vue';
import StatusBadge from '@/shared/ui/StatusBadge.vue';
import { useSpecSessionStore } from '@/stores/specSessionStore';
import { useUiStore } from '@/stores/uiStore';

const store = useSpecSessionStore();
const ui = useUiStore();
const draft = ref('');
const messages = computed(() => store.workspace?.conversation ?? []);

async function send() {
  const value = draft.value.trim();
  if (!value) return;
  draft.value = '';

  if (value === '/generate-draft') {
    await store.generateDraft();
    return;
  }

  if (value === '/review-spec' || value === '/find-gaps') {
    await store.reviewSpec();
    return;
  }

  if (value === '/approve-spec') {
    await store.approveSpec();
    return;
  }

  if (value === '/export-spec') {
    ui.exportOpen = true;
    return;
  }

  if (value === '/show-diff') {
    ui.versionsOpen = true;
    return;
  }

  if (
    value === '/list-requirements' ||
    value === '/list-assumptions' ||
    value === '/list-open-questions' ||
    value === '/list-risks'
  ) {
    ui.artifactsOpen = true;
    return;
  }

  await store.sendMessage(value);
}
</script>
