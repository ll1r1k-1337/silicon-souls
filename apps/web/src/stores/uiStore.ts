import { defineStore } from 'pinia';
import type { DocumentAnchor, DocumentSelectionContext } from '@/types';

type ThemeMode = 'dark' | 'light' | 'system';
type ResolvedTheme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'silicon-souls-theme';

const getSystemTheme = (): ResolvedTheme => {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

const resolveInitialTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'system';

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === 'dark' || storedTheme === 'light' || storedTheme === 'system') {
    return storedTheme;
  }

  return 'system';
};

const applyTheme = (theme: ResolvedTheme) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
};

export const useUiStore = defineStore('uiStore', {
  state: () => ({
    artifactsOpen: false,
    reviewOpen: false,
    versionsOpen: false,
    exportOpen: false,
    settingsOpen: false,
    systemLogsOpen: false,
    editorMode: 'edit' as 'edit' | 'preview' | 'diff',
    theme: resolveInitialTheme() as ThemeMode,
    resolvedTheme: 'dark' as ResolvedTheme,
    documentContext: undefined as DocumentSelectionContext | undefined,
    documentSelection: undefined as
      | { anchor: DocumentAnchor; selectedText: string }
      | undefined,
    activeThreadId: undefined as string | undefined,
  }),
  actions: {
    initializeTheme() {
      this.resolvedTheme = this.theme === 'system' ? getSystemTheme() : this.theme;
      applyTheme(this.resolvedTheme);

      if (typeof window !== 'undefined') {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
        mediaQuery.addEventListener('change', () => {
          if (this.theme !== 'system') return;
          this.resolvedTheme = mediaQuery.matches ? 'light' : 'dark';
          applyTheme(this.resolvedTheme);
        });
      }
    },
    setTheme(theme: ThemeMode) {
      this.theme = theme;
      this.resolvedTheme = theme === 'system' ? getSystemTheme() : theme;
      applyTheme(this.resolvedTheme);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      }
    },
    toggleTheme() {
      const nextTheme: Record<ThemeMode, ThemeMode> = {
        dark: 'light',
        light: 'system',
        system: 'dark',
      };
      this.setTheme(nextTheme[this.theme]);
    },
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
