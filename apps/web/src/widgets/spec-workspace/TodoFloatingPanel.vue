<template>
  <aside
    v-if="pendingQuestions.length > 0"
    ref="panelRef"
    class="todo-panel"
    :data-collapsed="collapsed"
    :data-dragging="dragging"
    :style="panelStyle"
  >
    <header class="todo-panel-header" @pointerdown="startDrag">
      <div>
        <span class="todo-eyebrow">To do</span>
        <h2>Questions to answer</h2>
      </div>
      <div class="todo-header-actions">
        <StatusBadge :label="String(pendingQuestions.length)" tone="warning" />
        <button
          type="button"
          class="icon-button todo-collapse"
          :aria-label="collapsed ? 'Expand to do panel' : 'Collapse to do panel'"
          @click="collapsed = !collapsed"
        >
          <ChevronDown v-if="collapsed" aria-hidden="true" />
          <ChevronUp v-else aria-hidden="true" />
        </button>
      </div>
    </header>

    <div v-if="!collapsed" class="todo-panel-body">
      <article
        v-for="artifact in pendingQuestions"
        :key="artifact.id"
        class="todo-question-card"
      >
        <h3>{{ titleOf(artifact) }}</h3>
        <p v-if="descriptionOf(artifact)">{{ descriptionOf(artifact) }}</p>
        <form class="todo-answer-form" @submit.prevent="saveQuestionAnswer(artifact)">
          <fieldset v-if="usesChoiceAnswers(artifact)" class="choice-list compact">
            <legend>{{ isMultipleChoice(artifact) ? 'Choose answers' : 'Choose answer' }}</legend>
            <label
              v-for="option in choiceOptions(artifact)"
              :key="option"
              class="choice-option"
            >
              <input
                :type="isMultipleChoice(artifact) ? 'checkbox' : 'radio'"
                :name="`todo-artifact-${artifact.id}`"
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
              class="textarea todo-answer-input"
              rows="2"
              placeholder="Specify another answer"
            />
          </label>
          <label v-if="!usesChoiceAnswers(artifact)" class="answer-text-label">
            <span>Answer</span>
            <textarea
              v-model="textAnswers[artifact.id]"
              class="textarea todo-answer-input"
              rows="3"
              placeholder="Write an answer"
            />
          </label>
          <BaseButton
            :icon="Save"
            variant="secondary"
            :disabled="!canSaveQuestionAnswer(artifact)"
          >
            Save answer
          </BaseButton>
        </form>
      </article>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ChevronDown, ChevronUp, Save } from 'lucide-vue-next';
import { computed, onUnmounted, ref, watch } from 'vue';
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
import { useSpecSessionStore } from '@/stores/specSessionStore';

interface DragState {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

const store = useSpecSessionStore();
const panelRef = ref<HTMLElement | null>(null);
const collapsed = ref(false);
const dragging = ref(false);
const panelPosition = ref<{ left: number; top: number }>();
const textAnswers = ref<Record<string, string>>({});
const selectedAnswers = ref<Record<string, string[]>>({});
const otherAnswers = ref<Record<string, string>>({});
let dragState: DragState | undefined;

const panelStyle = computed(() =>
  panelPosition.value
    ? {
        left: `${panelPosition.value.left}px`,
        top: `${panelPosition.value.top}px`,
        right: 'auto',
      }
    : undefined,
);

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

onUnmounted(() => stopDrag());

function titleOf(artifact: SpecArtifact): string {
  const payload = payloadOf(artifact);
  return String(payload.question ?? payload.title ?? payload.name ?? artifact.id);
}

function descriptionOf(artifact: SpecArtifact): string {
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

function startDrag(event: PointerEvent): void {
  const target = event.target as HTMLElement | null;
  if (target?.closest('button,input,textarea,select,a,label')) return;

  const panel = panelRef.value;
  if (!panel) return;

  const rect = panel.getBoundingClientRect();
  panelPosition.value = { left: rect.left, top: rect.top };
  dragState = {
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    width: rect.width,
    height: rect.height,
  };
  dragging.value = true;
  panel.setPointerCapture(event.pointerId);
  window.addEventListener('pointermove', movePanel);
  window.addEventListener('pointerup', stopDrag, { once: true });
  document.body.style.userSelect = 'none';
}

function movePanel(event: PointerEvent): void {
  if (!dragState) return;

  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - dragState.width - margin);
  const maxTop = Math.max(margin, window.innerHeight - dragState.height - margin);
  panelPosition.value = {
    left: clamp(event.clientX - dragState.offsetX, margin, maxLeft),
    top: clamp(event.clientY - dragState.offsetY, margin, maxTop),
  };
}

function stopDrag(): void {
  if (!dragState) return;

  dragState = undefined;
  dragging.value = false;
  window.removeEventListener('pointermove', movePanel);
  window.removeEventListener('pointerup', stopDrag);
  document.body.style.userSelect = '';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
</script>
