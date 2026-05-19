<script setup lang="ts">
import { ref } from 'vue'
import type { Message } from '@/types'

const props = defineProps<{
  message: Message
}>()

const isUser = props.message.role === 'user'
const thinkingOpen = ref(true)

// Simple color assignment based on agent handle
function agentColor(handle?: string): string {
  const colors: Record<string, string> = {
    hr: 'var(--color-accent-pink)',
    alice: 'var(--color-accent-cyan)',
    bob: 'var(--color-accent-purple)',
  }
  return colors[handle ?? ''] ?? 'var(--color-accent-teal)'
}
</script>

<template>
  <div
    class="animate-fade-in-up flex gap-3"
    :class="isUser ? 'flex-row-reverse' : 'flex-row'"
  >
    <!-- Avatar -->
    <div
      class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold mt-1"
      :style="{
        background: isUser
          ? 'linear-gradient(135deg, var(--color-accent-cyan), var(--color-accent-teal))'
          : `linear-gradient(135deg, ${agentColor(message.agentHandle)}, ${agentColor(message.agentHandle)}88)`,
      }"
    >
      {{ isUser ? 'U' : (message.agentName?.[0] ?? 'A') }}
    </div>

    <!-- Bubble -->
    <div class="max-w-[75%] min-w-0">
      <!-- Agent Name Label -->
      <div
        v-if="!isUser && message.agentName"
        class="text-xs font-medium mb-1 ml-1"
        :style="{ color: agentColor(message.agentHandle) }"
      >
        {{ message.agentName }}
        <span class="text-[var(--color-text-muted)]">@{{ message.agentHandle }}</span>
      </div>

      <!-- Thinking panel -->
      <div v-if="!isUser && message.thinking" class="mb-1.5">
        <button
          type="button"
          class="text-xs text-[var(--color-text-muted)] flex items-center gap-1 hover:text-[var(--color-text)] transition-colors cursor-pointer"
          @click="thinkingOpen = !thinkingOpen"
        >
          <span>{{ thinkingOpen ? '▾' : '▸' }}</span>
          <span>Thinking{{ !message.content ? '…' : '' }}</span>
        </button>
        <div
          v-if="thinkingOpen"
          class="mt-1 px-3 py-2 rounded-lg glass text-xs italic text-[var(--color-text-muted)] whitespace-pre-wrap break-words"
        >
          {{ message.thinking }}
        </div>
      </div>

      <div
        v-if="message.content || isUser"
        class="px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words"
        :class="
          isUser
            ? 'bg-gradient-to-br from-[var(--color-accent-cyan)] to-[var(--color-accent-teal)] text-[var(--color-surface-900)]'
            : 'glass'
        "
      >
        {{ message.content }}
      </div>
    </div>
  </div>
</template>
