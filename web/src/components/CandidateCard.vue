<script setup lang="ts">
import { ref } from 'vue'
import type { Candidate } from '@/types'

const props = defineProps<{
  candidate: Candidate
}>()

const emit = defineEmits<{
  hire: [candidateId: string]
}>()

const hiring = ref(false)
const hired = ref(false)

async function handleHire() {
  hiring.value = true
  // TODO: Replace with real API call: POST /api/agents/hire
  await new Promise((r) => setTimeout(r, 800))
  hired.value = true
  hiring.value = false
  emit('hire', props.candidate.id)
}
</script>

<template>
  <div
    class="animate-fade-in-up gradient-border rounded-xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-[var(--color-accent-cyan)]/10"
    :class="{ 'opacity-50 pointer-events-none': hired }"
  >
    <div class="glass rounded-xl p-5 space-y-4">
      <!-- Header -->
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-base font-semibold text-[var(--color-text-primary)]">
            {{ candidate.name }}
          </h3>
          <p class="text-sm text-[var(--color-accent-cyan)]">
            {{ candidate.role }}
          </p>
        </div>
        <div
          class="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold"
          style="
            background: linear-gradient(
              135deg,
              var(--color-accent-purple),
              var(--color-accent-pink)
            );
          "
        >
          {{ candidate.name[0] }}
        </div>
      </div>

      <!-- Skills -->
      <div class="flex flex-wrap gap-1.5">
        <span
          v-for="skill in candidate.skills"
          :key="skill"
          class="px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--color-surface-500)]/60 text-[var(--color-accent-cyan)] border border-[var(--color-accent-cyan)]/15"
        >
          {{ skill }}
        </span>
      </div>

      <!-- Salary -->
      <div
        class="flex items-center gap-2 text-sm"
      >
        <svg class="w-4 h-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
        </svg>
        <span class="text-[var(--color-text-secondary)]">{{ candidate.expectedSalary }}</span>
      </div>

      <!-- HR Comment -->
      <div class="text-sm text-[var(--color-text-secondary)] italic border-l-2 border-[var(--color-accent-purple)]/40 pl-3">
        "{{ candidate.hrComment }}"
      </div>

      <!-- Hire Button -->
      <button
        :disabled="hiring || hired"
        class="w-full py-2.5 rounded-lg font-medium text-sm transition-all duration-200 cursor-pointer"
        :class="
          hired
            ? 'bg-[var(--color-surface-500)] text-[var(--color-text-muted)]'
            : 'bg-gradient-to-r from-[var(--color-accent-cyan)] to-[var(--color-accent-teal)] text-[var(--color-surface-900)] hover:shadow-lg hover:shadow-[var(--color-accent-cyan)]/25 active:scale-[0.98]'
        "
        @click="handleHire"
      >
        <span v-if="hired">✓ Hired</span>
        <span v-else-if="hiring" class="flex items-center justify-center gap-2">
          <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Hiring...
        </span>
        <span v-else>Hire {{ candidate.name.split(' ')[0] }}</span>
      </button>
    </div>
  </div>
</template>
