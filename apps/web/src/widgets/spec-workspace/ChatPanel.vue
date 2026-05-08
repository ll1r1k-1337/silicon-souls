<template>
  <aside class="chat-panel" data-testid="chat-panel">
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
        :data-testid="`message-${message.role}`"
      >
        <header>{{ message.role }}</header>
        <details v-if="message.thinkingSummary" class="message-thinking" open>
          <summary>Thinking</summary>
          <p>{{ message.thinkingSummary }}</p>
        </details>
        <p v-if="message.content">{{ message.content }}</p>
        <div v-if="messageArtifacts(message).length > 0" class="message-artifacts">
          <span class="message-artifacts-title">Artifacts</span>
          <button
            v-for="artifact in messageArtifacts(message)"
            :key="artifact.id"
            type="button"
            class="message-artifact-chip"
            @click="openArtifactDrawer"
          >
            <span>{{ artifactTypeLabel(artifact.artifactType) }}</span>
            <strong>{{ artifactTitle(artifact) }}</strong>
            <StatusBadge :label="artifact.status" :tone="artifactTone(artifact)" />
          </button>
        </div>
      </article>
      <article
        v-if="showPendingThinking"
        class="message"
        data-role="assistant"
        data-testid="message-assistant-pending"
      >
        <header>assistant</header>
        <details class="message-thinking message-thinking-pending" open>
          <summary>Thinking</summary>
          <p>{{ pendingThinkingText }}</p>
        </details>
      </article>
    </div>
    <form class="chat-form" @submit.prevent="send">
      <div v-if="ui.documentContext" class="document-context-card">
        <div class="context-card-header">
          <a
            class="context-link"
            :href="ui.documentContext.href"
            title="Selected document range"
            @click.prevent
          >
            {{ ui.documentContext.label }}
          </a>
          <button
            type="button"
            class="icon-button context-remove"
            aria-label="Remove document context"
            @click="dismissDocumentContext"
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <blockquote class="context-excerpt">{{ ui.documentContext.text }}</blockquote>
      </div>
      <div class="chat-input-shell">
        <textarea
          ref="textareaRef"
          v-model="draft"
          class="textarea"
          rows="4"
          data-testid="chat-input"
          placeholder="Answer questions, add requirements, or use /generate-draft"
          @input="autocompleteDismissed = false"
          @keydown="handleInputKeydown"
        />
        <div
          v-if="showAutocomplete"
          class="command-autocomplete"
          role="listbox"
          aria-label="Chat commands"
        >
          <button
            v-for="(command, index) in filteredCommands"
            :key="command.value"
            type="button"
            class="command-suggestion"
            :data-active="index === activeSuggestionIndex"
            role="option"
            :aria-selected="index === activeSuggestionIndex"
            @mousedown.prevent="selectCommand(command)"
          >
            <span>{{ command.value }}</span>
            <small>{{ command.label }}</small>
          </button>
        </div>
      </div>
      <BaseButton :icon="Send" variant="primary" :disabled="!canSend">Send</BaseButton>
    </form>
  </aside>
</template>

<script setup lang="ts">
import { Send, X } from 'lucide-vue-next';
import { computed, nextTick, ref, watch } from 'vue';
import type { SpecArtifact } from '@sdd/domain';
import { artifactTypeLabel } from '@/shared/artifacts/labels';
import BaseButton from '@/shared/ui/BaseButton.vue';
import StatusBadge from '@/shared/ui/StatusBadge.vue';
import { useBackgroundJobStore } from '@/stores/backgroundJobStore';
import { useSpecSessionStore } from '@/stores/specSessionStore';
import { useUiStore } from '@/stores/uiStore';
import type { ConversationMessage } from '@/types';

interface ChatCommand {
  value: string;
  label: string;
  keepOpen?: boolean;
}

const store = useSpecSessionStore();
const ui = useUiStore();
const jobStore = useBackgroundJobStore();
const draft = ref('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const activeSuggestionIndex = ref(0);
const autocompleteDismissed = ref(false);
const messages = computed(() => store.workspace?.conversation ?? []);
const artifacts = computed(() => store.artifacts);
const activeChatJobs = computed(() =>
  Object.values(jobStore.jobs).filter(
    (job) =>
      (job.status === 'queued' || job.status === 'running') &&
      [
        'extract_artifacts',
        'generate_clarifying_questions',
        'apply_change_request',
        'generate_draft',
      ].includes(job.type),
  ),
);
const showPendingThinking = computed(() => activeChatJobs.value.length > 0);
const pendingThinkingText = computed(() => {
  const running = activeChatJobs.value.find((job) => job.status === 'running');
  const job = running ?? activeChatJobs.value[0];
  if (!job) return 'Waiting for the model response.';

  return `${jobLabel(job.type)} is ${job.status}. Waiting for the model response.`;
});
const commands: ChatCommand[] = [
  { value: '/generate-draft', label: 'Generate draft' },
  { value: '/find-gaps', label: 'Find gaps' },
  { value: '/review-spec', label: 'Run reviewer' },
  { value: '/approve-spec', label: 'Approve spec' },
  { value: '/list-requirements', label: 'Show requirements' },
  { value: '/list-assumptions', label: 'Show assumptions' },
  { value: '/list-open-questions', label: 'Show open questions' },
  { value: '/list-risks', label: 'Show risks' },
  { value: '/show-diff', label: 'Open versions' },
  { value: '/export-spec', label: 'Open export' },
  { value: '/clarify', label: 'Ask clarifying questions' },
  { value: '/change-requirement', label: 'Describe requirement change', keepOpen: true },
];
const commandToken = computed(() => {
  const value = draft.value;
  if (!value.startsWith('/')) return undefined;
  const match = value.match(/^\/[^\s]*/);
  if (!match) return undefined;
  const suffix = value.slice(match[0].length);
  return suffix.trim().length > 0 ? undefined : match[0].toLowerCase();
});
const filteredCommands = computed(() => {
  if (commandToken.value === undefined) return [];
  return commands
    .filter((command) => {
      const query = commandToken.value ?? '';
      return (
        command.value.toLowerCase().includes(query) ||
        command.label.toLowerCase().includes(query.slice(1))
      );
    })
    .slice(0, 8);
});
const showAutocomplete = computed(
  () => !autocompleteDismissed.value && filteredCommands.value.length > 0,
);
const canSend = computed(() => Boolean(draft.value.trim() || ui.documentContext));

watch(filteredCommands, () => {
  activeSuggestionIndex.value = 0;
});

async function send() {
  const value = draft.value.trim();
  const context = ui.documentContext;
  if (!value && !context) return;
  draft.value = '';

  const command = value.split(/\s+/, 1)[0];

  if (command === '/generate-draft') {
    await store.generateDraft();
    return;
  }

  if (command === '/review-spec' || command === '/find-gaps') {
    await store.reviewSpec();
    return;
  }

  if (command === '/approve-spec') {
    await store.approveSpec();
    return;
  }

  if (command === '/export-spec') {
    ui.exportOpen = true;
    return;
  }

  if (command === '/show-diff') {
    ui.versionsOpen = true;
    return;
  }

  if (
    command === '/list-requirements' ||
    command === '/list-assumptions' ||
    command === '/list-open-questions' ||
    command === '/list-risks'
  ) {
    ui.artifactsOpen = true;
    return;
  }

  if (command === '/clarify') {
    await store.sendMessage(
      withDocumentContext(
        'Ask clarifying questions for missing blocking or important details.',
        context,
      ),
    );
    if (context) {
      ui.clearDocumentContext();
    }
    return;
  }

  await store.sendMessage(withDocumentContext(value || 'Use the selected document context.', context));
  if (context) {
    ui.clearDocumentContext();
  }
}

function withDocumentContext(message: string, context = ui.documentContext): string {
  if (!context) return message;

  return [
    '[Document context]',
    `Source: ${context.href}`,
    `Reference: ${context.label}`,
    'Selection:',
    '"""',
    context.text,
    '"""',
    '',
    'User message:',
    message,
  ].join('\n');
}

function dismissDocumentContext() {
  ui.clearDocumentContext();
}

function messageArtifacts(message: ConversationMessage): SpecArtifact[] {
  const ids = new Set(message.generatedArtifactIds ?? []);
  if (ids.size === 0) {
    return [];
  }

  return artifacts.value.filter((artifact) => ids.has(artifact.id));
}

function artifactTitle(artifact: SpecArtifact): string {
  const payload = artifact.payload as Record<string, unknown>;
  return String(payload.title ?? payload.question ?? payload.name ?? payload.text ?? artifact.id);
}

function artifactTone(artifact: SpecArtifact): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (artifact.status === 'confirmed' || artifact.status === 'answered') return 'success';
  if (artifact.status === 'rejected') return 'danger';
  if (artifact.status === 'open' || artifact.status === 'draft') return 'info';
  return 'neutral';
}

function jobLabel(type: string): string {
  const labels: Record<string, string> = {
    extract_artifacts: 'Artifact extraction',
    generate_clarifying_questions: 'Clarifying question generation',
    apply_change_request: 'Change request processing',
    generate_draft: 'Draft generation',
  };

  return labels[type] ?? type.replace(/[_-]+/g, ' ');
}

function openArtifactDrawer() {
  ui.artifactsOpen = true;
}

function handleInputKeydown(event: KeyboardEvent) {
  if (!showAutocomplete.value) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    activeSuggestionIndex.value =
      (activeSuggestionIndex.value + 1) % filteredCommands.value.length;
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeSuggestionIndex.value =
      (activeSuggestionIndex.value - 1 + filteredCommands.value.length) %
      filteredCommands.value.length;
    return;
  }

  if (event.key === 'Tab' || event.key === 'Enter') {
    event.preventDefault();
    selectCommand(filteredCommands.value[activeSuggestionIndex.value]);
    return;
  }

  if (event.key === 'Escape') {
    autocompleteDismissed.value = true;
  }
}

async function selectCommand(command?: ChatCommand) {
  if (!command) return;
  draft.value = command.keepOpen ? `${command.value} ` : command.value;
  autocompleteDismissed.value = true;
  await nextTick();
  textareaRef.value?.focus();
}
</script>
