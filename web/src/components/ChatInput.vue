<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useAgents } from '@/composables/useAgents'

const emit = defineEmits<{
  send: [content: string]
}>()

interface DocumentSummary {
  id: string
  title: string
}

interface Suggestion {
  key: string
  kind: 'agent' | 'document'
  label: string
  meta: string
  replacement: string
  avatar: string
}

const { agents } = useAgents()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const inputValue = ref('')
const query = ref('')
const activeKind = ref<'agent' | 'document' | null>(null)
const mentionStartIndex = ref(-1)
const selectedIndex = ref(0)
const documents = ref<DocumentSummary[]>([])

const suggestions = computed<Suggestion[]>(() => {
  const normalizedQuery = query.value.toLowerCase()

  if (activeKind.value === 'agent') {
    return agents.value
      .filter(
        (agent) =>
          !normalizedQuery ||
          agent.handle.toLowerCase().includes(normalizedQuery) ||
          agent.name.toLowerCase().includes(normalizedQuery),
      )
      .map((agent) => ({
        key: `agent-${agent.handle}`,
        kind: 'agent' as const,
        label: agent.name,
        meta: `@${agent.handle}`,
        replacement: `@${agent.handle}`,
        avatar: agent.name[0] ?? '@',
      }))
  }

  if (activeKind.value === 'document') {
    return documents.value
      .filter(
        (document) =>
          !normalizedQuery ||
          document.title.toLowerCase().includes(normalizedQuery) ||
          document.id.toLowerCase().includes(normalizedQuery),
      )
      .slice(0, 8)
      .map((document) => ({
        key: `document-${document.id}`,
        kind: 'document' as const,
        label: document.title,
        meta: `#${document.id}`,
        replacement: `#${document.id}`,
        avatar: '#',
      }))
  }

  return []
})

const showSuggestions = computed(
  () => activeKind.value !== null && suggestions.value.length > 0,
)

onMounted(() => {
  void refreshDocuments()
})

async function refreshDocuments() {
  try {
    const res = await fetch('/api/documents')
    const data = await res.json()
    documents.value = data.documents ?? []
  } catch (err) {
    console.error('Failed to fetch documents:', err)
  }
}

function handleInput() {
  const el = textareaRef.value
  if (!el) return

  const value = el.value
  inputValue.value = value
  const cursorPos = el.selectionStart
  const beforeCursor = value.slice(0, cursorPos)
  const match = beforeCursor.match(/([@#])([a-zA-Z0-9_-]*)$/)

  if (match) {
    activeKind.value = match[1] === '@' ? 'agent' : 'document'
    query.value = match[2] ?? ''
    mentionStartIndex.value = beforeCursor.length - match[0].length
    selectedIndex.value = 0
  } else {
    closeSuggestions()
  }

  autoResize()
}

function selectSuggestion(suggestion: Suggestion) {
  if (mentionStartIndex.value === -1) return

  const tokenLength = query.value.length + 1
  const before = inputValue.value.slice(0, mentionStartIndex.value)
  const afterCursor = inputValue.value.slice(mentionStartIndex.value + tokenLength)
  inputValue.value = `${before}${suggestion.replacement} ${afterCursor}`
  const cursorPosition = before.length + suggestion.replacement.length + 1
  closeSuggestions()
  syncTextarea(cursorPosition)
}

function handleKeydown(e: KeyboardEvent) {
  if (showSuggestions.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedIndex.value = (selectedIndex.value + 1) % suggestions.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedIndex.value =
        selectedIndex.value <= 0
          ? suggestions.value.length - 1
          : selectedIndex.value - 1
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const suggestion = suggestions.value[selectedIndex.value]
      if (suggestion) {
        selectSuggestion(suggestion)
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      closeSuggestions()
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
  closeSuggestions()
  syncTextarea(0)
  void refreshDocuments()
}

function injectDraft(content: string) {
  const prefix = inputValue.value.trim()
    ? `${inputValue.value.trimEnd()}\n\n`
    : ''
  inputValue.value = `${prefix}${content}`
  syncTextarea(inputValue.value.length)
}

function closeSuggestions() {
  activeKind.value = null
  query.value = ''
  mentionStartIndex.value = -1
  selectedIndex.value = 0
}

function syncTextarea(cursorPosition: number) {
  nextTick(() => {
    const el = textareaRef.value
    if (!el) return

    el.value = inputValue.value
    el.focus()
    el.setSelectionRange(cursorPosition, cursorPosition)
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

defineExpose({
  injectDraft,
  refreshDocuments,
})
</script>

<template>
  <div class="relative px-4 pb-4 pt-2">
    <div class="relative">
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 -translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <ul
          v-if="showSuggestions"
          class="absolute bottom-full left-0 z-20 mb-2 w-72 overflow-hidden rounded-xl py-2 shadow-xl shadow-black/20 glass"
          role="listbox"
        >
          <div class="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            {{ activeKind === 'agent' ? 'Agents' : 'Documents' }}
          </div>
          <li
            v-for="(suggestion, i) in suggestions"
            :key="suggestion.key"
            role="option"
            :aria-selected="i === selectedIndex"
            class="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors"
            :class="i === selectedIndex ? 'bg-[var(--color-surface-500)]/60' : ''"
            @mousedown.prevent="selectSuggestion(suggestion)"
            @mouseenter="selectedIndex = i"
          >
            <div
              class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
              style="background: linear-gradient(135deg, var(--color-accent-cyan), var(--color-accent-teal))"
            >
              {{ suggestion.avatar }}
            </div>
            <div class="min-w-0">
              <div class="truncate text-sm font-medium text-[var(--color-text-primary)]">
                {{ suggestion.label }}
              </div>
              <div class="truncate text-xs text-[var(--color-text-muted)]">
                {{ suggestion.meta }}
              </div>
            </div>
          </li>
        </ul>
      </Transition>

      <div class="rounded-2xl transition-all duration-200 focus-within:border-[var(--color-accent-cyan)]/30 focus-within:shadow-lg focus-within:shadow-[var(--color-accent-cyan)]/5 glass">
        <div class="flex items-end gap-2 p-3">
          <textarea
            ref="textareaRef"
            :value="inputValue"
            rows="1"
            placeholder="Message an agent, or reference #documents..."
            class="flex-1 resize-none border-none bg-transparent text-sm leading-relaxed text-[var(--color-text-primary)] outline-none placeholder-[var(--color-text-muted)]"
            style="max-height: 160px"
            @input="handleInput"
            @keydown="handleKeydown"
          />
          <button
            :disabled="!inputValue.trim()"
            class="flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-xl transition-all duration-200"
            :class="
              inputValue.trim()
                ? 'bg-gradient-to-r from-[var(--color-accent-cyan)] to-[var(--color-accent-teal)] text-[var(--color-surface-900)] hover:shadow-lg hover:shadow-[var(--color-accent-cyan)]/25 active:scale-95'
                : 'bg-[var(--color-surface-500)]/50 text-[var(--color-text-muted)]'
            "
            @click="send"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <div class="mt-2 flex items-center justify-between px-1">
      <span class="text-xs text-[var(--color-text-muted)]">
        Type
        <kbd class="rounded bg-[var(--color-surface-600)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-secondary)]">@</kbd>
        for agents or
        <kbd class="rounded bg-[var(--color-surface-600)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-secondary)]">#</kbd>
        for documents
      </span>
      <span class="text-xs text-[var(--color-text-muted)]">
        <kbd class="rounded bg-[var(--color-surface-600)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-secondary)]">Enter</kbd>
        to send
      </span>
    </div>
  </div>
</template>
