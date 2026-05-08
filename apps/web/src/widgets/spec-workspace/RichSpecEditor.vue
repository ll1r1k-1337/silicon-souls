<template>
  <section class="rich-editor-panel" data-testid="rich-editor-panel">
    <header class="doc-toolbar">
      <div class="doc-toolbar-scroll" aria-label="Document tools">
        <div class="tool-group">
          <button type="button" class="tool-button" title="Undo" @click="runCommand('undo')">
            <Undo2 aria-hidden="true" />
          </button>
          <button type="button" class="tool-button" title="Redo" @click="runCommand('redo')">
            <Redo2 aria-hidden="true" />
          </button>
        </div>
        <div class="tool-group">
          <button
            type="button"
            class="tool-button"
            title="Heading 1"
            :data-active="isActive('heading', { level: 1 })"
            @click="toggleHeading(1)"
          >
            <Heading1 aria-hidden="true" />
          </button>
          <button
            type="button"
            class="tool-button"
            title="Heading 2"
            :data-active="isActive('heading', { level: 2 })"
            @click="toggleHeading(2)"
          >
            <Heading2 aria-hidden="true" />
          </button>
          <button
            type="button"
            class="tool-button"
            title="Bold"
            :data-active="isActive('bold')"
            @click="runCommand('bold')"
          >
            <Bold aria-hidden="true" />
          </button>
          <button
            type="button"
            class="tool-button"
            title="Italic"
            :data-active="isActive('italic')"
            @click="runCommand('italic')"
          >
            <Italic aria-hidden="true" />
          </button>
          <button
            type="button"
            class="tool-button"
            title="Code"
            :data-active="isActive('code')"
            @click="runCommand('code')"
          >
            <Code2 aria-hidden="true" />
          </button>
        </div>
        <div class="tool-group">
          <button
            type="button"
            class="tool-button"
            title="Bullet list"
            :data-active="isActive('bulletList')"
            @click="runCommand('bulletList')"
          >
            <List aria-hidden="true" />
          </button>
          <button
            type="button"
            class="tool-button"
            title="Ordered list"
            :data-active="isActive('orderedList')"
            @click="runCommand('orderedList')"
          >
            <ListOrdered aria-hidden="true" />
          </button>
          <button
            type="button"
            class="tool-button"
            title="Task list"
            :data-active="isActive('taskList')"
            @click="runCommand('taskList')"
          >
            <ListChecks aria-hidden="true" />
          </button>
          <button
            type="button"
            class="tool-button"
            title="Quote"
            :data-active="isActive('blockquote')"
            @click="runCommand('blockquote')"
          >
            <Quote aria-hidden="true" />
          </button>
        </div>
        <div class="tool-group">
          <button type="button" class="tool-button" title="Link" @click="setLink">
            <LinkIcon aria-hidden="true" />
          </button>
          <button type="button" class="tool-button" title="Table" @click="insertTable">
            <Table2 aria-hidden="true" />
          </button>
          <button
            type="button"
            class="tool-button"
            title="Comment"
            :disabled="!selection"
            @click="commentBoxOpen = true"
          >
            <MessageSquarePlus aria-hidden="true" />
          </button>
        </div>
      </div>
      <div class="doc-save-state">
        <StatusBadge
          :label="projectionLabel"
          :tone="document?.projectionStatus === 'synced' ? 'success' : 'warning'"
        />
        <span class="dirty">{{ dirty ? 'unsaved' : 'saved' }}</span>
        <BaseButton :icon="Save" variant="primary" :disabled="!dirty" @click="saveDocument()">
          Save
        </BaseButton>
      </div>
    </header>

    <div v-if="commentBoxOpen && selection" class="inline-comment-box">
      <blockquote>{{ selection.selectedText }}</blockquote>
      <div class="inline-comment-actions">
        <input
          v-model="commentDraft"
          class="input"
          placeholder="Comment on this selection"
          @keydown.enter.prevent="createComment"
        />
        <BaseButton :icon="MessageSquarePlus" variant="secondary" :disabled="!commentDraft.trim()" @click="createComment">
          Add
        </BaseButton>
      </div>
    </div>

    <EditorContent
      v-if="editor"
      :editor="editor"
      class="rich-editor-content"
      data-testid="rich-editor-content"
    />
  </section>
</template>

<script setup lang="ts">
import { Mark, mergeAttributes } from '@tiptap/core';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/vue-3';
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  MessageSquarePlus,
  Quote,
  Redo2,
  Save,
  Table2,
  Undo2,
} from 'lucide-vue-next';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import BaseButton from '@/shared/ui/BaseButton.vue';
import StatusBadge from '@/shared/ui/StatusBadge.vue';
import { useSpecSessionStore } from '@/stores/specSessionStore';
import { useUiStore } from '@/stores/uiStore';
import type { DocumentAnchor, DocumentSuggestion, RichDocumentContent } from '@/types';

type ProjectionStatus = 'synced' | 'stale' | 'failed';
type SelectionState = { anchor: DocumentAnchor; selectedText: string };

const CommentMark = Mark.create({
  name: 'comment',
  inclusive: false,
  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-comment-thread-id'),
        renderHTML: (attributes) =>
          attributes.threadId ? { 'data-comment-thread-id': attributes.threadId } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-comment-thread-id]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'comment-mark',
      }),
      0,
    ];
  },
});

const store = useSpecSessionStore();
const ui = useUiStore();
const dirty = ref(false);
const selection = ref<SelectionState | undefined>();
const commentBoxOpen = ref(false);
const commentDraft = ref('');
const document = computed(() => store.document);
const projectionLabel = computed(() =>
  document.value?.projectionStatus === 'synced' ? 'Artifacts synced' : 'Artifacts stale',
);

const editor = useEditor({
  extensions: [
    StarterKit,
    Link.configure({ openOnClick: false }),
    Placeholder.configure({ placeholder: 'Start writing the product specification...' }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    Markdown,
    CommentMark,
  ],
  content: document.value?.contentJson as JSONContent | undefined,
  editorProps: {
    attributes: {
      class: 'rich-editor-surface',
    },
    handleClick(_view, _pos, event) {
      const target = event.target as HTMLElement | null;
      const mark = target?.closest('[data-comment-thread-id]') as HTMLElement | null;
      const threadId = mark?.dataset.commentThreadId;
      if (threadId) {
        ui.setActiveThread(threadId);
      }
      return false;
    },
  },
  onUpdate() {
    dirty.value = true;
    updateSelection();
  },
  onSelectionUpdate() {
    updateSelection();
  },
});

watch(
  () => `${document.value?.id ?? ''}:${document.value?.updatedAt ?? ''}`,
  () => {
    if (!editor.value || !document.value || dirty.value) return;
    editor.value.commands.setContent(document.value.contentJson as JSONContent, {
      emitUpdate: false,
    });
    updateSelection();
  },
);

onBeforeUnmount(() => {
  window.removeEventListener('document-suggestion-apply', handleSuggestionApply);
  editor.value?.destroy();
});

onMounted(() => {
  window.addEventListener('document-suggestion-apply', handleSuggestionApply);
});

function isActive(name: string, attributes?: Record<string, unknown>): boolean {
  return editor.value?.isActive(name, attributes) ?? false;
}

function runCommand(command: string): void {
  const chain = editor.value?.chain().focus();
  if (!chain) return;
  if (command === 'undo') chain.undo().run();
  if (command === 'redo') chain.redo().run();
  if (command === 'bold') chain.toggleBold().run();
  if (command === 'italic') chain.toggleItalic().run();
  if (command === 'code') chain.toggleCode().run();
  if (command === 'bulletList') chain.toggleBulletList().run();
  if (command === 'orderedList') chain.toggleOrderedList().run();
  if (command === 'taskList') chain.toggleTaskList().run();
  if (command === 'blockquote') chain.toggleBlockquote().run();
}

function toggleHeading(level: 1 | 2): void {
  editor.value?.chain().focus().toggleHeading({ level }).run();
}

function setLink(): void {
  const previousUrl = editor.value?.getAttributes('link').href as string | undefined;
  const url = window.prompt('URL', previousUrl ?? '');
  if (url === null) return;
  if (!url.trim()) {
    editor.value?.chain().focus().unsetLink().run();
    return;
  }
  editor.value?.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
}

function insertTable(): void {
  editor.value?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
}

async function handleSuggestionApply(event: Event): Promise<void> {
  const suggestion = (event as CustomEvent<{ suggestion: DocumentSuggestion }>).detail?.suggestion;
  if (!suggestion || !editor.value) return;
  const thread = store.commentThreads.find((item) => item.id === suggestion.threadId);
  const from = thread?.anchor.from;
  const to = thread?.anchor.to;
  if (typeof from !== 'number' || typeof to !== 'number' || !suggestion.replacementMarkdown) {
    await store.updateSuggestion(suggestion.id, 'accepted');
    return;
  }

  editor.value
    .chain()
    .focus()
    .setTextSelection({ from, to })
    .insertContent(suggestion.replacementMarkdown)
    .run();
  dirty.value = true;
  await saveDocument('Accepted document suggestion', 'stale');
  await store.updateSuggestion(suggestion.id, 'accepted');
}

async function createComment(): Promise<void> {
  if (!selection.value || !commentDraft.value.trim() || !editor.value) return;
  const currentSelection = selection.value;
  const thread = await store.createCommentThread({
    anchor: currentSelection.anchor,
    selectedText: currentSelection.selectedText,
    content: commentDraft.value.trim(),
  });
  if (!thread) return;

  editor.value
    .chain()
    .focus()
    .setTextSelection({
      from: currentSelection.anchor.from ?? 0,
      to: currentSelection.anchor.to ?? 0,
    })
    .setMark('comment', { threadId: thread.id })
    .run();
  commentDraft.value = '';
  commentBoxOpen.value = false;
  dirty.value = true;
  await saveDocument('Added document comment', document.value?.projectionStatus ?? 'synced');
}

async function saveDocument(
  changeSummary = 'Direct document edit',
  projectionStatus: ProjectionStatus = 'stale',
): Promise<void> {
  if (!editor.value) return;
  const contentJson = editor.value.getJSON() as RichDocumentContent;
  const markdown = getMarkdown();
  await store.saveDocument(contentJson, markdown, changeSummary, projectionStatus);
  dirty.value = false;
}

function getMarkdown(): string {
  const currentEditor = editor.value as unknown as {
    getMarkdown?: () => string;
    storage?: { markdown?: { getMarkdown?: () => string } };
    getText?: (separator?: string) => string;
  };
  return (
    currentEditor.getMarkdown?.() ??
    currentEditor.storage?.markdown?.getMarkdown?.() ??
    currentEditor.getText?.('\n\n') ??
    ''
  );
}

function updateSelection(): void {
  if (!editor.value || !document.value) {
    selection.value = undefined;
    ui.clearDocumentSelection();
    return;
  }

  const { from, to, empty } = editor.value.state.selection;
  const selectedText = editor.value.state.doc.textBetween(from, to, '\n').trim();
  if (empty || selectedText.length < 2) {
    selection.value = undefined;
    ui.clearDocumentSelection();
    return;
  }

  const next = {
    anchor: {
      from,
      to,
      selectedText,
      documentVersionId: document.value.currentVersionId,
    },
    selectedText,
  };
  selection.value = next;
  ui.setDocumentSelection(next);
}
</script>
