import { defineStore } from 'pinia';
import type { DocumentAnchor, DocumentSelectionContext } from '@/types';

export const useUiStore = defineStore('uiStore', {
  state: () => ({
    artifactsOpen: false,
    reviewOpen: false,
    versionsOpen: false,
    exportOpen: false,
    settingsOpen: false,
    systemLogsOpen: false,
    editorMode: 'edit' as 'edit' | 'preview' | 'diff',
    documentContext: undefined as DocumentSelectionContext | undefined,
    documentSelection: undefined as
      | { anchor: DocumentAnchor; selectedText: string }
      | undefined,
    activeThreadId: undefined as string | undefined,
  }),
  actions: {
    setDocumentContext(context: DocumentSelectionContext) {
      this.documentContext = context;
    },
    clearDocumentContext() {
      this.documentContext = undefined;
    },
    setDocumentSelection(selection: { anchor: DocumentAnchor; selectedText: string }) {
      this.documentSelection = selection;
    },
    clearDocumentSelection() {
      this.documentSelection = undefined;
    },
    setActiveThread(threadId?: string) {
      this.activeThreadId = threadId;
    },
    closeDrawers() {
      this.artifactsOpen = false;
      this.reviewOpen = false;
      this.versionsOpen = false;
      this.exportOpen = false;
      this.settingsOpen = false;
      this.systemLogsOpen = false;
    },
  },
});
