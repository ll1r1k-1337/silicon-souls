<script setup lang="ts">
import { ref } from 'vue'
import MessageBubble from './MessageBubble.vue'
import CandidateCard from './CandidateCard.vue'
import type { Message } from '@/types'

defineProps<{
  messages: Message[]
}>()

const emit = defineEmits<{
  hire: [candidateId: string]
}>()

const hiddenCandidateGroups = ref<Set<string>>(new Set())

function handleHire(messageId: string, candidateId: string) {
  // Hide all candidate cards for this message after a short delay
  setTimeout(() => {
    hiddenCandidateGroups.value.add(messageId)
  }, 1200)
  emit('hire', candidateId)
}
</script>

<template>
  <div class="flex flex-col gap-5 py-6 px-4">
    <template v-for="message in messages" :key="message.id">
      <!-- Message Bubble -->
      <MessageBubble :message="message" />

      <!-- Candidate Cards (below the message) -->
      <div
        v-if="message.candidates?.length && !hiddenCandidateGroups.has(message.id)"
        class="ml-11 grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in-up"
      >
        <CandidateCard
          v-for="candidate in message.candidates"
          :key="candidate.id"
          :candidate="candidate"
          @hire="handleHire(message.id, $event)"
        />
      </div>

      <!-- Candidate Skeleton Loading State -->
      <div
        v-else-if="message.isGeneratingCandidates"
        class="ml-11 grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in-up"
      >
        <div v-for="i in 3" :key="i" class="glass rounded-2xl p-5 border border-[var(--color-glass-border)] animate-pulse">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-full bg-[var(--color-surface-600)]" />
            <div class="space-y-2">
              <div class="h-4 bg-[var(--color-surface-600)] rounded w-24" />
              <div class="h-3 bg-[var(--color-surface-600)] rounded w-16" />
            </div>
          </div>
          <div class="space-y-3 mb-4">
            <div class="h-3 bg-[var(--color-surface-600)] rounded w-full" />
            <div class="h-3 bg-[var(--color-surface-600)] rounded w-5/6" />
            <div class="h-3 bg-[var(--color-surface-600)] rounded w-4/6" />
          </div>
          <div class="flex gap-2 mb-4">
            <div class="h-5 bg-[var(--color-surface-600)] rounded-full w-16" />
            <div class="h-5 bg-[var(--color-surface-600)] rounded-full w-14" />
          </div>
          <div class="h-9 bg-[var(--color-surface-600)] rounded-xl w-full" />
        </div>
      </div>

      <!-- Post-hire system message -->
      <div
        v-if="hiddenCandidateGroups.has(message.id)"
        class="ml-11 animate-fade-in-up"
      >
        <div class="glass rounded-xl px-4 py-3 flex items-center gap-3 text-sm border-l-3 border-[var(--color-accent-teal)]">
          <svg class="w-5 h-5 text-[var(--color-accent-teal)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="text-[var(--color-text-secondary)]">
            Agent hired successfully! They're now available for chat via <span class="text-[var(--color-accent-cyan)] font-medium">@mention</span>.
          </span>
        </div>
      </div>
    </template>
  </div>
</template>
