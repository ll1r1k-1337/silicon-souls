import { defineStore } from 'pinia';

const prefix = 'sdd.stage0.draft.';

export const useLocalDraftStore = defineStore('localDraftStore', {
  state: () => ({
    drafts: {} as Record<string, string>,
  }),
  actions: {
    hydrate(sessionId: string) {
      const value = localStorage.getItem(`${prefix}${sessionId}`);
      if (value !== null) {
        this.drafts[sessionId] = value;
      }
    },
    setDraft(sessionId: string, markdown: string) {
      this.drafts[sessionId] = markdown;
      localStorage.setItem(`${prefix}${sessionId}`, markdown);
    },
    clearDraft(sessionId: string) {
      delete this.drafts[sessionId];
      localStorage.removeItem(`${prefix}${sessionId}`);
    },
  },
});
