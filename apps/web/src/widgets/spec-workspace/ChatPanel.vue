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

        <div v-if="structuredBlocks(message).length > 0" class="message-structured">
          <template v-for="(block, blockIndex) in structuredBlocks(message)" :key="`${message.id}-${blockIndex}`">
            <p v-if="block.type === 'text'">{{ block.text }}</p>
            <form
              v-else
              class="chat-questionnaire"
              @submit.prevent="submitQuestionnaireAnswers(message.id, block.questions)"
            >
              <article
                v-for="question in block.questions"
                :key="question.questionArtifactId"
                class="chat-question-card"
                data-testid="chat-question-card"
                :data-resolved="isQuestionResolved(question.questionArtifactId)"
              >
                <header class="chat-question-header">
                  <h3>{{ question.question }}</h3>
                  <StatusBadge
                    :label="questionStatusLabel(question.questionArtifactId)"
                    :tone="isQuestionResolved(question.questionArtifactId) ? 'success' : 'warning'"
                  />
                </header>
                <p class="chat-question-why">{{ question.whyItMatters }}</p>

                <fieldset v-if="usesChoiceAnswers(question)" class="choice-list compact">
                  <legend>{{ question.answerMode === 'multiple_choice' ? 'Choose answers' : 'Choose answer' }}</legend>
                  <label
                    v-for="option in choiceOptions(question)"
                    :key="option"
                    class="choice-option"
                  >
                    <input
                      :type="question.answerMode === 'multiple_choice' ? 'checkbox' : 'radio'"
                      :name="`chat-question-${question.questionArtifactId}`"
                      :checked="isChoiceSelected(question.questionArtifactId, option)"
                      :disabled="isQuestionResolved(question.questionArtifactId)"
                      @change="setChoice(question, option)"
                    />
                    <span>{{ option }}</span>
                  </label>
                </fieldset>

                <label
                  v-if="usesChoiceAnswers(question) && isOtherSelected(question.questionArtifactId)"
                  class="answer-text-label"
                >
                  <span>Custom answer</span>
                  <textarea
                    v-model="customAnswers[question.questionArtifactId]"
                    class="textarea"
                    rows="2"
                    data-testid="chat-question-custom-answer"
                    :disabled="isQuestionResolved(question.questionArtifactId)"
                  />
                </label>

                <label v-if="question.answerMode === 'free_text'" class="answer-text-label">
                  <span>Answer</span>
                  <textarea
                    v-model="textAnswers[question.questionArtifactId]"
                    class="textarea"
                    rows="3"
                    data-testid="chat-question-answer"
                    :disabled="isQuestionResolved(question.questionArtifactId)"
                  />
                </label>
              </article>

              <div class="chat-questionnaire-actions">
                <BaseButton
                  :icon="Send"
                  variant="secondary"
                  data-testid="submit-chat-questionnaire"
                  :disabled="!canSubmitQuestionnaire(block.questions)"
                >
                  Submit answers
                </BaseButton>
              </div>
            </form>
          </template>
        </div>

        <p v-else-if="message.content">{{ message.content }}</p>

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
          placeholder="Describe updates or use /clarify, /generate-draft, /review-spec"
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
import type {
  ConversationStructuredBlock,
  ConversationStructuredQuestion,
  SpecArtifact,
} from '@sdd/domain';
import { artifactTypeLabel } from '@/shared/artifacts/labels';
import BaseButton from '@/shared/ui/BaseButton.vue';
import StatusBadge from '@/shared/ui/StatusBadge.vue';
import { useBackgroundJobStore } from '@/stores/backgroundJobStore';
import { useSpecSessionStore } from '@/stores/specSessionStore';
import { useUiStore } from '@/stores/uiStore';
import type { ConversationMessage } from '@/types';

interface ChatCommandOption {
  value: string;
  label: string;
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
const artifactsById = computed(() => new Map(artifacts.value.map((artifact) => [artifact.id, artifact])));
const choiceAnswers = ref<Record<string, string[]>>({});
const textAnswers = ref<Record<string, string>>({});
const customAnswers = ref<Record<string, string>>({});

const activeChatJobs = computed(() =>
  Object.values(jobStore.jobs).filter(
    (job) =>
      (job.status === 'queued' || job.status === 'running') &&
      ['extract_artifacts', 'generate_clarifying_questions', 'generate_draft', 'run_review'].includes(job.type),
  ),
);
const showPendingThinking = computed(() => activeChatJobs.value.length > 0);
const pendingThinkingText = computed(() => {
  const running = activeChatJobs.value.find((job) => job.status === 'running');
  const job = running ?? activeChatJobs.value[0];
  if (!job) return 'Waiting for the model response.';

  return `${jobLabel(job.type)} is ${job.status}. Waiting for the model response.`;
});

const commands: ChatCommandOption[] = [
  { value: '/clarify', label: 'Ask clarifying questions' },
  { value: '/generate-draft', label: 'Generate draft from current structure' },
  { value: '/review-spec', label: 'Run critic and reviewer checks' },
  { value: '/approve-spec', label: 'Approve if blockers are resolved' },
  { value: '/list-open-questions', label: 'Open structure drawer' },
  { value: '/export-spec', label: 'Open export dialog' },
  { value: '/show-diff', label: 'Open version history' },
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

watch(
  [messages, artifacts],
  () => {
    for (const message of messages.value) {
      for (const block of structuredBlocks(message)) {
        if (block.type !== 'questionnaire') continue;
        for (const question of block.questions) {
          hydrateQuestionState(question);
        }
      }
    }
  },
  { immediate: true },
);

async function send() {
  const value = draft.value.trim();
  const context = ui.documentContext;
  if (!value && !context) return;
  draft.value = '';

  const command = value.split(/\s+/, 1)[0];
  const contextPayload = context
    ? {
        selectedText: context.text,
        source: context.label,
      }
    : undefined;

  if (command === '/clarify') {
    await store.sendCommand('clarify', contextPayload);
    if (context) ui.clearDocumentContext();
    return;
  }

  if (command === '/generate-draft') {
    await store.sendCommand('generate_draft', contextPayload);
    if (context) ui.clearDocumentContext();
    return;
  }

  if (command === '/review-spec') {
    await store.sendCommand('review_spec', contextPayload);
    if (context) ui.clearDocumentContext();
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

  if (command === '/list-open-questions') {
    ui.artifactsOpen = true;
    return;
  }

  await store.sendMessage({
    kind: 'text',
    text: value || 'Use the selected document context.',
    ...(contextPayload ? { context: contextPayload } : {}),
  });
  if (context) {
    ui.clearDocumentContext();
  }
}

function structuredBlocks(message: ConversationMessage): ConversationStructuredBlock[] {
  return message.structured?.blocks ?? [];
}

function openArtifactDrawer() {
  ui.artifactsOpen = true;
}

function dismissDocumentContext() {
  ui.clearDocumentContext();
}

function messageArtifacts(message: ConversationMessage): SpecArtifact[] {
  const ids = new Set(message.generatedArtifactIds ?? []);
  if (ids.size === 0) return [];
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
    generate_draft: 'Draft generation',
    run_review: 'Review checks',
  };
  return labels[type] ?? type.replace(/[_-]+/g, ' ');
}

function questionPayload(questionArtifactId: string): Record<string, unknown> {
  return (artifactsById.value.get(questionArtifactId)?.payload as Record<string, unknown> | undefined) ?? {};
}

function questionStatusLabel(questionArtifactId: string): string {
  const artifact = artifactsById.value.get(questionArtifactId);
  if (!artifact) return 'open';
  const payload = questionPayload(questionArtifactId);
  return String(payload.status ?? artifact.status);
}

function isQuestionResolved(questionArtifactId: string): boolean {
  const payload = questionPayload(questionArtifactId);
  const status = questionStatusLabel(questionArtifactId);
  return (
    status === 'answered' ||
    status === 'confirmed' ||
    status === 'dismissed' ||
    status === 'converted_to_assumption' ||
    status === 'rejected' ||
    (typeof payload.answer === 'string' && payload.answer.trim().length > 0)
  );
}

function usesChoiceAnswers(question: ConversationStructuredQuestion): boolean {
  return question.answerMode !== 'free_text' && choiceOptions(question).length > 0;
}

function isOtherOption(value: string): boolean {
  return /^other\b/i.test(value.trim());
}

function otherOptionLabel(question: ConversationStructuredQuestion): string {
  return question.otherAnswerLabel?.trim() || 'Other';
}

function choiceOptions(question: ConversationStructuredQuestion): string[] {
  const options = (question.suggestedAnswers ?? []).filter((value) => value.trim().length > 0);
  if (!question.allowOtherAnswer) return options;
  const otherLabel = otherOptionLabel(question);
  return options.some(isOtherOption) ? options : [...options, otherLabel];
}

function hydrateQuestionState(question: ConversationStructuredQuestion): void {
  const questionId = question.questionArtifactId;
  const payload = questionPayload(questionId);
  if (!(questionId in choiceAnswers.value)) {
    if (Array.isArray(payload.selectedAnswers)) {
      choiceAnswers.value[questionId] = payload.selectedAnswers
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean);
    } else {
      choiceAnswers.value[questionId] = [];
    }
  }
  if (!(questionId in textAnswers.value)) {
    textAnswers.value[questionId] =
      typeof payload.answer === 'string' && question.answerMode === 'free_text'
        ? payload.answer
        : '';
  }
  if (!(questionId in customAnswers.value)) {
    customAnswers.value[questionId] =
      typeof payload.customAnswer === 'string' ? payload.customAnswer : '';
  }
}

function isChoiceSelected(questionArtifactId: string, option: string): boolean {
  return (choiceAnswers.value[questionArtifactId] ?? []).includes(option);
}

function setChoice(question: ConversationStructuredQuestion, option: string): void {
  const questionId = question.questionArtifactId;
  if (question.answerMode === 'multiple_choice') {
    const selected = new Set(choiceAnswers.value[questionId] ?? []);
    if (selected.has(option)) {
      selected.delete(option);
    } else {
      selected.add(option);
    }
    choiceAnswers.value[questionId] = Array.from(selected);
    return;
  }

  choiceAnswers.value[questionId] = [option];
}

function isOtherSelected(questionArtifactId: string): boolean {
  return (choiceAnswers.value[questionArtifactId] ?? []).some(isOtherOption);
}

function buildQuestionAnswer(question: ConversationStructuredQuestion): string {
  const questionId = question.questionArtifactId;
  if (question.answerMode === 'free_text') {
    return (textAnswers.value[questionId] ?? '').trim();
  }

  const selected = (choiceAnswers.value[questionId] ?? []).map((value) => value.trim()).filter(Boolean);
  const nonOther = selected.filter((value) => !isOtherOption(value));
  const custom = isOtherSelected(questionId) ? (customAnswers.value[questionId] ?? '').trim() : '';
  return [...nonOther, custom].filter(Boolean).join('\n');
}

function hasQuestionChanges(question: ConversationStructuredQuestion): boolean {
  if (isQuestionResolved(question.questionArtifactId)) {
    return false;
  }
  const payload = questionPayload(question.questionArtifactId);
  const currentAnswer = typeof payload.answer === 'string' ? payload.answer.trim() : '';
  return Boolean(buildQuestionAnswer(question)) && buildQuestionAnswer(question) !== currentAnswer;
}

function canSubmitQuestionnaire(questions: ConversationStructuredQuestion[]): boolean {
  const unresolved = questions.filter((question) => !isQuestionResolved(question.questionArtifactId));
  if (unresolved.length === 0) return false;
  return unresolved.some((question) => hasQuestionChanges(question));
}

async function submitQuestionnaireAnswers(
  sourceMessageId: string,
  questions: ConversationStructuredQuestion[],
): Promise<void> {
  const answers = questions
    .filter((question) => !isQuestionResolved(question.questionArtifactId))
    .map((question) => {
      const questionId = question.questionArtifactId;
      return {
        questionArtifactId: questionId,
        selectedAnswers: usesChoiceAnswers(question) ? choiceAnswers.value[questionId] ?? [] : [],
        customAnswer: customAnswers.value[questionId] ?? '',
        textAnswer: question.answerMode === 'free_text' ? textAnswers.value[questionId] ?? '' : '',
      };
    })
    .filter((answer) => {
      const hasSelected = (answer.selectedAnswers?.length ?? 0) > 0;
      const hasCustom = Boolean(answer.customAnswer?.trim());
      const hasText = Boolean(answer.textAnswer?.trim());
      return hasSelected || hasCustom || hasText;
    });

  if (answers.length === 0) return;

  await store.sendQuestionnaireAnswers({
    sourceMessageId,
    answers,
  });
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

async function selectCommand(command?: ChatCommandOption) {
  if (!command) return;
  draft.value = command.value;
  autocompleteDismissed.value = true;
  await nextTick();
  textareaRef.value?.focus();
}
</script>
