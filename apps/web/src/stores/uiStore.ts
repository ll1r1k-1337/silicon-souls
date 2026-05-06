import { defineStore } from 'pinia';

export const useUiStore = defineStore('uiStore', {
  state: () => ({
    artifactsOpen: false,
    reviewOpen: false,
    versionsOpen: false,
    exportOpen: false,
    settingsOpen: false,
    editorMode: 'edit' as 'edit' | 'preview' | 'diff',
  }),
  actions: {
    closeDrawers() {
      this.artifactsOpen = false;
      this.reviewOpen = false;
      this.versionsOpen = false;
      this.exportOpen = false;
      this.settingsOpen = false;
    },
  },
});
