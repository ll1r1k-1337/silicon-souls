<script setup lang="ts">
import { ref } from 'vue'
import ChatView from './components/ChatView.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import { useAgents } from '@/composables/useAgents'

const settingsOpen = ref(false)
const { agents } = useAgents()
</script>

<template>
  <div class="flex w-full h-screen bg-[var(--color-surface-900)]">
    <!-- Sidebar -->
    <aside
      class="hidden md:flex flex-col w-64 border-r border-[var(--color-glass-border)] bg-[var(--color-surface-800)]/50"
    >
      <!-- Logo -->
      <div class="px-5 py-5 border-b border-[var(--color-glass-border)]">
        <div class="flex items-center gap-3">
          <div
            class="w-9 h-9 rounded-xl flex items-center justify-center animate-pulse-glow"
            style="background: linear-gradient(135deg, var(--color-accent-cyan), var(--color-accent-purple))"
          >
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div>
            <h1 class="text-sm font-bold text-[var(--color-text-primary)] tracking-tight">
              Silicon Souls
            </h1>
            <p class="text-xs text-[var(--color-text-muted)]">AI Agent Workspace</p>
          </div>
        </div>
      </div>

      <!-- Active Agents -->
      <div class="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        <div class="px-2 pb-2 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-widest">
          Active Agents
        </div>

        <button
          v-for="agent in agents"
          :key="agent.handle"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 hover:bg-[var(--color-surface-600)]/50 group cursor-pointer"
        >
          <div class="relative">
            <div
              class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold"
              style="background: linear-gradient(135deg, var(--color-surface-500), var(--color-surface-400))"
            >
              {{ agent.name[0] }}
            </div>
            <div
              class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--color-surface-800)] bg-emerald-400"
            />
          </div>
          <div class="min-w-0">
            <div class="text-sm font-medium text-[var(--color-text-primary)] truncate">
              {{ agent.name }}
            </div>
            <div class="text-xs text-[var(--color-text-muted)]">@{{ agent.handle }}</div>
          </div>
        </button>
      </div>

      <!-- Settings Button -->
      <div class="p-3 border-t border-[var(--color-glass-border)]">
        <button
          @click="settingsOpen = true"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 hover:bg-[var(--color-surface-600)]/50 group cursor-pointer"
        >
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--color-surface-500)]/50 text-[var(--color-text-muted)] group-hover:text-[var(--color-accent-cyan)] transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <div class="text-sm font-medium text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)] transition-colors">
              Settings
            </div>
            <div class="text-xs text-[var(--color-text-muted)]">LLM Provider</div>
          </div>
        </button>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 flex flex-col min-w-0">
      <!-- Top Bar (mobile) -->
      <header class="md:hidden flex items-center justify-between px-4 py-3 border-b border-[var(--color-glass-border)]">
        <div class="flex items-center gap-2">
          <div
            class="w-7 h-7 rounded-lg flex items-center justify-center"
            style="background: linear-gradient(135deg, var(--color-accent-cyan), var(--color-accent-purple))"
          >
            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <span class="text-sm font-bold text-[var(--color-text-primary)]">Silicon Souls</span>
        </div>
        <button
          @click="settingsOpen = true"
          class="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-accent-cyan)] transition-colors cursor-pointer"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </header>

      <ChatView />
    </main>

    <!-- Settings Modal -->
    <SettingsPanel :open="settingsOpen" @close="settingsOpen = false" />
  </div>
</template>
