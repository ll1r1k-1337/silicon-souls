<template>
  <aside class="action-queue-panel" data-testid="action-queue-panel">
    <header class="panel-header action-queue-header">
      <div>
        <h2>Workspace</h2>
        <p>{{ summary }}</p>
      </div>
      <StatusBadge :label="String(totalActionCount)" :tone="totalActionCount ? 'warning' : 'success'" />
    </header>

    <div class="action-queue-body">
      <section class="assistant-composer">
        <div class="assistant-context">
          <span>{{ assistantContextLabel }}</span>
          <blockquote v-if="assistantContextText">{{ assistantContextText }}</blockquote>
        </div>
        <textarea
          v-model="assistantPrompt"
          class="textarea"
          rows="3"
          placeholder="Ask the LLM to review, explain, or suggest a rewrite"
        />
        <div class="assistant-actions">
          <BaseButton :icon="MessageSquare" variant="secondary" :disabled="!canAskAssistant" @click="askAssistant('comment')">
            Comment
          </BaseButton>
          <BaseButton :icon="WandSparkles" variant="primary" :disabled="!canAskAssistant" @click="askAssistant('suggestion')">
            Suggest
          </BaseButton>
        </div>
      </section>

      <section v-if="pendingQuestions.length > 0" class="queue-section" data-testid="open-questions-section">
        <header class="queue-section-title">
          <h3>Open questions</h3>
          <StatusBadge :label="String(pendingQuestions.length)" tone="warning" />
        </header>
        <article
          v-for="artifact in pendingQuestions"
          :key="artifact.id"
          class="queue-card"
          data-testid="open-question-card"
          :data-artifact-id="artifact.id"
        >
          <h4>{{ questionTitle(artifact) }}</h4>
          <p v-if="questionDescription(artifact)">{{ questionDescription(artifact) }}</p>
          <form class="queue-answer-form" @submit.prevent="saveQuestionAnswer(artifact)">
            <fieldset v-if="usesChoiceAnswers(artifact)" class="choice-list compact">
              <legend>{{ isMultipleChoice(artifact) ? 'Choose answers' : 'Choose answer' }}</legend>
              <label v-for="option in choiceOptions(artifact)" :key="option" class="choice-option">
                <input
                  :type="isMultipleChoice(artifact) ? 'checkbox' : 'radio'"
                  :name="`queue-artifact-${artifact.id}`"
                  :checked="isChoiceSelected(artifact, option)"
                  @change="setChoice(artifact, option)"
                />
                <span>{{ option }}</span>
              </label>
            </fieldset>
            <label v-if="usesChoiceAnswers(artifact) && isOtherSelected(artifact)" class="answer-text-label">
              <span>Custom answer</span>
              <textarea
                v-model="otherAnswers[artifact.id]"
                class="textarea"
                rows="2"
                data-testid="open-question-custom-answer"
              />
            </label>
            <label v-if="!usesChoiceAnswers(artifact)" class="answer-text-label">
              <span>Answer</span>
              <textarea
                v-model="textAnswers[artifact.id]"
                class="textarea"
                rows="3"
                data-testid="open-question-answer"
              />
            </label>
            <BaseButton
              :icon="Save"
              variant="secondary"
              :disabled="!canSaveQuestionAnswer(artifact)"
              data-testid="save-open-question-answer"
            >
              Save answer
            </BaseButton>
          </form>
        </article>
      </section>

      <section v-if="reviewItems.length > 0" class="queue-section" data-testid="review-blockers-section">
        <header class="queue-section-title">
          <h3>Review blockers</h3>
          <StatusBadge :label="String(reviewItems.length)" tone="danger" />
        </header>
        <article v-for="item in reviewItems" :key="item" class="queue-card">
          <p>{{ item }}</p>
          <div class="queue-card-actions">
            <BaseButton :icon="MessageSquare" variant="secondary" :disabled="assistantBusy" @click="askAboutBlocker(item)">
              Ask LLM
            </BaseButton>
          </div>
        </article>
      </section>

      <section v-if="visibleThreads.length > 0" class="queue-section">
        <header class="queue-section-title">
          <h3>Comments</h3>
          <StatusBadge :label="String(openThreads.length)" tone="info" />
        </header>
        <article
          v-for="thread in visibleThreads"
          :key="thread.id"
          class="queue-card comment-thread-card"
          :data-active="thread.id === ui.activeThreadId"
        >
          <header>
            <button type="button" class="thread-title" @click="ui.setActiveThread(thread.id)">
              {{ thread.selectedText || thread.anchor.selectedText || thread.id }}
            </button>
            <StatusBadge :label="thread.status" :tone="thread.status === 'open' ? 'info' : 'neutral'" />
          </header>
          <div class="thread-comments">
            <p v-for="comment in thread.comments" :key="comment.id">
              <strong>{{ comment.author }}</strong>
              {{ comment.content }}
            </p>
          </div>
          <div v-if="thread.suggestions.length > 0" class="suggestion-list">
            <article v-for="suggestion in thread.suggestions" :key="suggestion.id" class="suggestion-card">
              <StatusBadge :label="suggestion.status" tone="warning" />
              <p>{{ suggestion.rationale || suggestion.replacementMarkdown }}</p>
              <pre v-if="suggestion.replacementMarkdown">{{ suggestion.replacementMarkdown }}</pre>
              <div v-if="suggestion.status === 'pending'" class="card-actions">
                <BaseButton :icon="Check" variant="secondary" @click="applySuggestion(suggestion)">
                  Apply
                </BaseButton>
                <BaseButton :icon="X" variant="ghost" @click="store.updateSuggestion(suggestion.id, 'rejected')">
                  Reject
                </BaseButton>
              </div>
            </article>
          </div>
          <form class="reply-form" @submit.prevent="reply(thread.id)">
            <input v-model="replyDrafts[thread.id]" class="input" placeholder="Reply" />
            <BaseButton :icon="Send" variant="secondary" :disabled="!replyDrafts[thread.id]?.trim()">
              Reply
            </BaseButton>
          </form>
          <BaseButton
            :icon="thread.status === 'open' ? Check : RotateCcw"
            variant="ghost"
            @click="store.updateCommentThread(thread.id, thread.status === 'open' ? 'resolved' : 'open')"
          >
            {{ thread.status === 'open' ? 'Resolve' : 'Reopen' }}
          </BaseButton>
        </article>
      </section>

      <p v-if="!hasVisibleSections" class="empty-copy action-queue-empty">
        No open actions. Use the composer above to ask for a document comment or rewrite suggestion.
      </p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { Check, MessageSquare, RotateCcw, Save, Send, WandSparkles, X } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import type { SpecArtifact } from '@sdd/domain';
import {
  answerOf,
  buildQuestionAnswer,
  choiceOptions,
  inferredCustomAnswer,
  isMultipleChoice,
  isOpenQuestion,
  isOtherOption,
  payloadOf,
  selectedAnswersOf,
  usesChoiceAnswers,
} from '@/shared/artifacts/openQuestions';
import BaseButton from '@/shared/ui/BaseButton.vue';
import StatusBadge from '@/shared/ui/StatusBadge.vue';
import { useBackgroundJobStore } from '@/stores/backgroundJobStore';
import { useSpecSessionStore } from '@/stores/specSessionStore';
import { useUiStore } from '@/stores/uiStore';
import type { DocumentSuggestion } from '@/types';

const store = useSpecSessionStore();
const ui = useUiStore();
const jobStore = useBackgroundJobStore();
const assistantPrompt = ref('');
const textAnswers = ref<Record<string, string>>({});
const selectedAnswers = ref<Record<string, string[]>>({});
const otherAnswers = ref<Record<string, string>>({});
const replyDrafts = ref<Record<string, string>>({});

const pendingQuestions = computed(() =>
  store.artifacts.filter((artifact) => {
    if (!isOpenQuestion(artifact)) return false;
    const payload = payloadOf(artifact);
    const status = String(payload.status ?? artifact.status);
    return (
      !answerOf(artifact) &&
      status !== 'answered' &&
      status !== 'confirmed' &&
      status !== 'dismissed' &&
      status !== 'converted_to_assumption' &&
      status !== 'rejected'
    );
  }),
);
const reviewItems = computed(() => [
  ...(store.review?.payload.blockingIssues ?? []),
  ...(store.review?.payload.contradictions ?? []),
]);
const openThreads = computed(() => store.commentThreads.filter((thread) => thread.status === 'open'));
const visibleThreads = computed(() => [
  ...openThreads.value,
  ...store.commentThreads.filter((thread) => thread.status !== 'open'),
]);
const totalActionCount = computed(
  () => pendingQuestions.value.length + reviewItems.value.length + openThreads.value.length,
);
const hasVisibleSections = computed(
  () => pendingQuestions.value.length > 0 || reviewItems.value.length > 0 || visibleThreads.value.length > 0,
);
const summary = computed(() =>
  totalActionCount.value ? 'Resolve only the items that block this specification.' : 'Nothing is blocking the document.',
);
const activeThread = computed(() =>
  store.commentThreads.find((thread) => thread.id === ui.activeThreadId),
);
const assistantContextLabel = computed(() => {
  if (activeThread.value) return 'Thread context';
  if (ui.documentSelection) return 'Selection context';
  return 'Whole document';
});
const assistantContextText = computed(
  () =>
    activeThread.value?.selectedText ??
    activeThread.value?.anchor.selectedText ??
    ui.documentSelection?.selectedText,
);
const assistantBusy = computed(() =>
  Object.values(jobStore.jobs).some(
    (job) =>
      job.type === 'document_assistant' &&
      (job.status === 'queued' || job.status === 'running'),
  ),
);
const canAskAssistant = computed(() => Boolean(assistantPrompt.value.trim()) && !assistantBusy.value);

watch(
  pendingQuestions,
  (artifacts) => {
    for (const artifact of artifacts) {
      if (!(artifact.id in textAnswers.value)) {
        textAnswers.value[artifact.id] = answerOf(artifact);
      }
      if (!(artifact.id in selectedAnswers.value)) {
        selectedAnswers.value[artifact.id] = selectedAnswersOf(artifact);
      }
      if (!(artifact.id in otherAnswers.value)) {
        otherAnswers.value[artifact.id] = inferredCustomAnswer(artifact);
      }
    }
  },
  { immediate: true },
);

async function askAssistant(mode: 'comment' | 'suggestion'): Promise<void> {
  const prompt = assistantPrompt.value.trim();
  if (!prompt) return;
  assistantPrompt.value = '';
  await store.requestDocumentAssistant({
    mode,
    prompt,
    threadId: activeThread.value?.id,
    anchor: activeThread.value?.anchor ?? ui.documentSelection?.anchor,
    selectedText: assistantContextText.value,
  });
}

async function askAboutBlocker(item: string): Promise<void> {
  await store.requestDocumentAssistant({
    mode: 'comment',
    prompt: [
      'Help resolve this review blocker.',
      item,
      'Explain what should be changed in the specification and propose concrete wording if possible.',
    ].join('\n\n'),
  });
}

function questionTitle(artifact: SpecArtifact): string {
  const payload = payloadOf(artifact);
  return String(payload.question ?? payload.title ?? payload.name ?? artifact.id);
}

function questionDescription(artifact: SpecArtifact): string {
  const payload = payloadOf(artifact);
  return String(payload.whyItMatters ?? payload.description ?? '');
}

function isChoiceSelected(artifact: SpecArtifact, option: string): boolean {
  return (selectedAnswers.value[artifact.id] ?? []).includes(option);
}

function setChoice(artifact: SpecArtifact, option: string): void {
  if (isMultipleChoice(artifact)) {
    const selected = new Set(selectedAnswers.value[artifact.id] ?? []);
    if (selected.has(option)) {
      selected.delete(option);
    } else {
      selected.add(option);
    }
    selectedAnswers.value[artifact.id] = Array.from(selected);
    return;
  }

  selectedAnswers.value[artifact.id] = [option];
}

function isOtherSelected(artifact: SpecArtifact): boolean {
  return (selectedAnswers.value[artifact.id] ?? []).some(isOtherOption);
}

function draftAnswer(artifact: SpecArtifact): string {
  return buildQuestionAnswer(
    artifact,
    selectedAnswers.value[artifact.id] ?? [],
    textAnswers.value[artifact.id] ?? '',
    otherAnswers.value[artifact.id] ?? '',
  );
}

function canSaveQuestionAnswer(artifact: SpecArtifact): boolean {
  const answer = draftAnswer(artifact);
  return Boolean(answer) && answer !== answerOf(artifact);
}

async function saveQuestionAnswer(artifact: SpecArtifact): Promise<void> {
  const answer = draftAnswer(artifact);
  if (!answer) return;
  await store.saveOpenQuestionAnswer(
    artifact,
    answer,
    usesChoiceAnswers(artifact) ? selectedAnswers.value[artifact.id] ?? [] : [],
    otherAnswers.value[artifact.id] ?? '',
  );
}

async function reply(threadId: string): Promise<void> {
  const content = replyDrafts.value[threadId]?.trim();
  if (!content) return;
  replyDrafts.value[threadId] = '';
  await store.addComment(threadId, content);
}

function applySuggestion(suggestion: DocumentSuggestion): void {
  window.dispatchEvent(
    new CustomEvent('document-suggestion-apply', {
      detail: { suggestion },
    }),
  );
}
</script>
