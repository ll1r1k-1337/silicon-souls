<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useAgents } from '@/composables/useAgents'

const emit = defineEmits<{
  send: [content: string]
}>()

const { agents } = useAgents()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const inputValue = ref('')
const mentionQuery = ref('')
const showMentions = ref(false)
const mentionStartIndex = ref(-1)
const selectedIndex = ref(0)

const filteredAgents = computed(() => {
  if (!mentionQuery.value) return agents.value
  return agents.value.filter((a) =>
    a.handle.toLowerCase().includes(mentionQuery.value.toLowerCase()) ||
    a.name.toLowerCase().includes(mentionQuery.value.toLowerCase()),
  )
})

function handleInput() {
  const el = textareaRef.value
  if (!el) return

  const value = el.value
  inputValue.value = value
  const cursorPos = el.selectionStart

  // Find the word at cursor
  const beforeCursor = value.slice(0, cursorPos)
  const match = beforeCursor.match(/@(\w*)$/)

  if (match) {
    showMentions.value = true
    mentionQuery.value = match[1] ?? ''
    mentionStartIndex.value = beforeCursor.lastIndexOf('@')
    selectedIndex.value = 0
  } else {
    showMentions.value = false
    mentionQuery.value = ''
    mentionStartIndex.value = -1
  }

  autoResize()
}

function selectAgent(agent: { handle: string }) {
  if (mentionStartIndex.value === -1) return

  const before = inputValue.value.slice(0, mentionStartIndex.value)
  const afterCursor = inputValue.value.slice(
    mentionStartIndex.value + mentionQuery.value.length + 1,
  )
  inputValue.value = `${before}@${agent.handle} ${afterCursor}`
  showMentions.value = false
  mentionQuery.value = ''
  mentionStartIndex.value = -1

  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.value = inputValue.value
      textareaRef.value.focus()
    }
  })
}

function handleKeydown(e: KeyboardEvent) {
  if (showMentions.value && filteredAgents.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedIndex.value = (selectedIndex.value + 1) % filteredAgents.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedIndex.value = selectedIndex.value <= 0
        ? filteredAgents.value.length - 1
        : selectedIndex.value - 1
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const picked = filteredAgents.value[selectedIndex.value]
      if (picked) selectAgent(picked)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      showMentions.value = false
      return
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function send() {
  const content = inputValue.value.trim()
  if (!content) return
  emit('send', content)
  inputValue.value = ''
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.value = ''
    }
    autoResize()
  })
}

function autoResize() {
  nextTick(() => {
    const el = textareaRef.value
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 160) + 'px'
    }
  })
}
</script>

<template>
  <div class="relative px-4 pb-4 pt-2">
    <div class="relative">
      <!-- Mention Popover -->
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 -translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <ul
          v-if="showMentions && filteredAgents.length"
          class="absolute bottom-full mb-2 left-0 w-64 glass rounded-xl py-2 shadow-xl shadow-black/20 z-20 overflow-hidden"
          role="listbox"
        >
          <div class="px-3 pb-2 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
            Agents
          </div>
          <li
            v-for="(agent, i) in filteredAgents"
            :key="agent.handle"
            role="option"
            :aria-selected="i === selectedIndex"
            class="px-3 py-2 cursor-pointer flex items-center gap-3 transition-colors"
            :class="i === selectedIndex ? 'bg-[var(--color-surface-500)]/60' : ''"
            @mousedown.prevent="selectAgent(agent)"
            @mouseenter="selectedIndex = i"
          >
            <div
              class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
              style="background: linear-gradient(135deg, var(--color-accent-cyan), var(--color-accent-teal))"
            >
              {{ agent.name[0] }}
            </div>
            <div>
              <div class="text-sm font-medium text-[var(--color-text-primary)]">
                {{ agent.name }}
              </div>
              <div class="text-xs text-[var(--color-text-muted)]">
                @{{ agent.handle }}
              </div>
            </div>
          </li>
        </ul>
      </Transition>

      <!-- Input Area -->
      <div class="glass rounded-2xl transition-all duration-200 focus-within:border-[var(--color-accent-cyan)]/30 focus-within:shadow-lg focus-within:shadow-[var(--color-accent-cyan)]/5">
        <div class="flex items-end gap-2 p-3">
          <textarea
            ref="textareaRef"
            :value="inputValue"
            @input="handleInput"
            @keydown="handleKeydown"
            rows="1"
            placeholder="Message an agent using @handle..."
            class="flex-1 bg-transparent border-none outline-none resize-none text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] leading-relaxed"
            style="max-height: 160px"
          />
          <button
            @click="send"
            :disabled="!inputValue.trim()"
            class="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer"
            :class="
              inputValue.trim()
                ? 'bg-gradient-to-r from-[var(--color-accent-cyan)] to-[var(--color-accent-teal)] text-[var(--color-surface-900)] hover:shadow-lg hover:shadow-[var(--color-accent-cyan)]/25 active:scale-95'
                : 'bg-[var(--color-surface-500)]/50 text-[var(--color-text-muted)]'
            "
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Hint -->
    <div class="flex items-center justify-between mt-2 px-1">
      <span class="text-xs text-[var(--color-text-muted)]">
        Type <kbd class="px-1.5 py-0.5 rounded bg-[var(--color-surface-600)] text-[var(--color-text-secondary)] font-mono text-[10px]">@</kbd> to mention an agent
      </span>
      <span class="text-xs text-[var(--color-text-muted)]">
        <kbd class="px-1.5 py-0.5 rounded bg-[var(--color-surface-600)] text-[var(--color-text-secondary)] font-mono text-[10px]">Enter</kbd> to send
      </span>
    </div>
  </div>
</template>
