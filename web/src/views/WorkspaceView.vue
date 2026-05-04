<script setup lang="ts">
import { nextTick, ref } from 'vue'
import Timeline from '@/components/Timeline.vue'
import ChatInput from '@/components/ChatInput.vue'
import DocumentEditor from '@/components/DocumentEditor.vue'
import { useAgents } from '@/composables/useAgents'
import type { Candidate, Message } from '@/types'

type ChatInputInstance = InstanceType<typeof ChatInput> & {
  injectDraft: (content: string) => void
  refreshDocuments: () => Promise<void>
}

const { refresh: refreshAgents } = useAgents()

const messages = ref<Message[]>([])
const isLoading = ref(false)
const activeDocId = ref<string | null>(null)
const timelineRef = ref<HTMLDivElement | null>(null)
const chatInputRef = ref<ChatInputInstance | null>(null)

function scrollToBottom() {
  nextTick(() => {
    if (timelineRef.value) {
      timelineRef.value.scrollTop = timelineRef.value.scrollHeight
    }
  })
}

async function handleSend(content: string) {
  activateDocumentFromContent(content)

  const userMsg: Message = {
    id: crypto.randomUUID(),
    role: 'user',
    content,
  }
  messages.value.push(userMsg)
  scrollToBottom()

  const isHiring = extractHandle(content) === 'hr' && isHiringIntent(content)
  const assistantId = crypto.randomUUID()
  const assistantMsg: Message = {
    id: assistantId,
    role: 'assistant',
    content: '',
    agentHandle: extractHandle(content),
    isGeneratingCandidates: isHiring,
  }
  messages.value.push(assistantMsg)
  isLoading.value = true
  scrollToBottom()

  try {
    const apiMessages = messages.value
      .filter((message) => message.role === 'user' || (message.role === 'assistant' && message.content))
      .map((message) => ({
        role: message.role,
        content: message.content,
      }))

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: apiMessages }),
    })

    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`)
    }

    await readDataStream(response, assistantId)
  } catch (err: unknown) {
    console.error('Chat error:', err)
    const idx = messages.value.findIndex((message) => message.id === assistantId)
    const currentMessage = idx === -1 ? undefined : messages.value[idx]
    if (currentMessage) {
      messages.value[idx] = {
        ...currentMessage,
        content: `Error: ${err instanceof Error ? err.message : 'Failed to get response'}`,
      }
    }
  } finally {
    isLoading.value = false
    const idx = messages.value.findIndex((message) => message.id === assistantId)
    const currentMessage = idx === -1 ? undefined : messages.value[idx]
    if (currentMessage) {
      messages.value[idx] = {
        ...currentMessage,
        isGeneratingCandidates: false,
      }
    }
    await chatInputRef.value?.refreshDocuments()
    scrollToBottom()
  }
}

async function readDataStream(response: Response, assistantId: string) {
  const reader = response.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue

      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue

      const prefix = line.substring(0, colonIdx)
      const payload = line.substring(colonIdx + 1)

      if (prefix === '0') {
        applyTextChunk(assistantId, payload)
      } else if (prefix === '2') {
        applyDataPart(assistantId, payload)
      }
    }
  }
}

function applyTextChunk(assistantId: string, payload: string) {
  try {
    const text = JSON.parse(payload) as string
    const idx = messages.value.findIndex((message) => message.id === assistantId)
    const currentMessage = idx === -1 ? undefined : messages.value[idx]
    if (!currentMessage) return

    const content = currentMessage.content + text
    messages.value[idx] = {
      ...currentMessage,
      content,
    }
    activateDocumentFromContent(content)
    scrollToBottom()
  } catch {
    // Ignore invalid stream chunks.
  }
}

function applyDataPart(assistantId: string, payload: string) {
  try {
    const dataParts = JSON.parse(payload)
    if (!Array.isArray(dataParts)) return

    for (const part of dataParts) {
      if (part.type === 'CANDIDATES_LIST') {
        const idx = messages.value.findIndex((message) => message.id === assistantId)
        const currentMessage = idx === -1 ? undefined : messages.value[idx]
        if (currentMessage) {
          messages.value[idx] = {
            ...currentMessage,
            candidates: part.payload as Candidate[],
            isGeneratingCandidates: false,
          }
        }
      }
    }
  } catch {
    // Ignore invalid stream data parts.
  }
}

function activateDocumentFromContent(content: string) {
  const matches = [...content.matchAll(/(?:^|\s)#([0-9a-fA-F-]{36})/g)]
  const docId = matches.at(-1)?.[1]
  if (docId) {
    activeDocId.value = docId
  }
}

function extractHandle(content: string): string | undefined {
  const match = content.match(/@([a-zA-Z0-9_]+)/)
  return match ? match[1] : undefined
}

function isHiringIntent(content: string): boolean {
  const hiringKeywords = [
    'hire',
    'find',
    'recruit',
    'need a',
    'looking for',
    'search for',
    'candidate',
    'developer',
    'engineer',
    'designer',
    'manager',
    'new team member',
  ]
  const lower = content.toLowerCase()
  return hiringKeywords.some((keyword) => lower.includes(keyword))
}

async function handleHire(candidateId: string) {
  try {
    const res = await fetch('/api/agents/hire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId }),
    })
    const data = await res.json()
    if (data.success) {
      refreshAgents()
      messages.value.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Candidate has been hired and added to the active agents.',
        agentHandle: 'hr',
      })
      scrollToBottom()
    }
  } catch (err) {
    console.error('Hire failed:', err)
  }
}

function handleAskSelectedText(text: string) {
  const selectedText = text.replace(/\s+/g, ' ').trim()
  if (!selectedText) return

  chatInputRef.value?.injectDraft(`> "${selectedText}"\n@architect`)
}
</script>

<template>
  <div class="flex h-full min-w-0 bg-gray-50">
    <aside
      class="flex w-[34%] min-w-[350px] max-w-[540px] flex-col border-r border-[var(--color-glass-border)] bg-[var(--color-surface-900)]"
    >
      <div ref="timelineRef" class="flex-1 overflow-y-auto">
        <Timeline :messages="messages" @hire="handleHire" />

        <div v-if="isLoading" class="px-6 pb-4">
          <div class="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <div class="flex gap-1">
              <span class="h-2 w-2 animate-bounce rounded-full bg-[var(--color-accent-cyan)]" style="animation-delay: 0ms" />
              <span class="h-2 w-2 animate-bounce rounded-full bg-[var(--color-accent-cyan)]" style="animation-delay: 150ms" />
              <span class="h-2 w-2 animate-bounce rounded-full bg-[var(--color-accent-cyan)]" style="animation-delay: 300ms" />
            </div>
          </div>
        </div>
      </div>

      <div class="flex-shrink-0 border-t border-[var(--color-glass-border)]">
        <ChatInput ref="chatInputRef" @send="handleSend" />
      </div>
    </aside>

    <main class="min-w-0 flex-1 overflow-hidden bg-white">
      <DocumentEditor
        v-if="activeDocId"
        :key="activeDocId"
        :doc-id="activeDocId"
        @ask="handleAskSelectedText"
      />
      <div
        v-else
        class="flex h-full items-center justify-center px-6 text-center text-sm text-gray-400"
      >
        Select or ask an agent to create a document.
      </div>
    </main>
  </div>
</template>
