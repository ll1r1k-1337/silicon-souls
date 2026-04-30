<script setup lang="ts">
import type { Message } from '@/types'

const props = defineProps<{
  message: Message
}>()

const isUser = props.message.role === 'user'

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

      <div
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
