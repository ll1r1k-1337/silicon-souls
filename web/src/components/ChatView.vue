<script setup lang="ts">
import { ref, nextTick } from 'vue'
import ChatTimeline from './ChatTimeline.vue'
import ChatInput from './ChatInput.vue'
import { useAgents } from '@/composables/useAgents'
import type { Message } from '@/types'

const { refresh: refreshAgents } = useAgents()

const messages = ref<Message[]>([])
const isLoading = ref(false)

const timelineRef = ref<HTMLDivElement | null>(null)

function scrollToBottom() {
  nextTick(() => {
    if (timelineRef.value) {
      timelineRef.value.scrollTop = timelineRef.value.scrollHeight
    }
  })
}

async function handleSend(content: string) {
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
      .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.content))
      .map((m) => ({
        role: m.role,
        content: m.content,
      }))

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: apiMessages }),
    })

    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`)
    }

    const reader = response.body.getReader()
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
          try {
            const text = JSON.parse(payload) as string
            const idx = messages.value.findIndex((m) => m.id === assistantId)
            const current = idx !== -1 ? messages.value[idx] : undefined
            if (current) {
              messages.value[idx] = {
                ...current,
                content: current.content + text,
              }
            }
            scrollToBottom()
          } catch {
            // skip
          }
        } else if (prefix === 'g') {
          try {
            const text = JSON.parse(payload) as string
            const idx = messages.value.findIndex((m) => m.id === assistantId)
            const current = idx !== -1 ? messages.value[idx] : undefined
            if (current) {
              messages.value[idx] = {
                ...current,
                thinking: (current.thinking ?? '') + text,
              }
            }
            scrollToBottom()
          } catch {
            // skip
          }
        } else if (prefix === '2') {
          try {
            const dataParts = JSON.parse(payload)
            if (Array.isArray(dataParts)) {
              for (const part of dataParts) {
                if (part.type === 'CANDIDATES_LIST') {
                  const idx = messages.value.findIndex(
                    (m) => m.id === assistantId,
                  )
                  const current = idx !== -1 ? messages.value[idx] : undefined
                  if (current) {
                    messages.value[idx] = {
                      ...current,
                      candidates: part.payload,
                      isGeneratingCandidates: false,
                      sessionId: part.sessionId,
                      pendingToolCallId: part.toolCallId,
                    }
                  }
                }
              }
            }
          } catch {
            // skip
          }
        }
      }
    }
  } catch (err) {
    console.error('Chat error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to get response'
    const idx = messages.value.findIndex((m) => m.id === assistantId)
    const current = idx !== -1 ? messages.value[idx] : undefined
    if (current) {
      messages.value[idx] = {
        ...current,
        content: `❌ Error: ${msg}`,
      }
    }
  } finally {
    isLoading.value = false
    const idx = messages.value.findIndex((m) => m.id === assistantId)
    const current = idx !== -1 ? messages.value[idx] : undefined
    if (current) {
      messages.value[idx] = {
        ...current,
        isGeneratingCandidates: false,
      }
    }
    scrollToBottom()
  }
}

function extractHandle(content: string): string | undefined {
  const match = content.match(/@([a-zA-Z0-9_]+)/)
  return match ? match[1] : undefined
}

function isHiringIntent(content: string): boolean {
  const hiringKeywords = [
    'hire', 'find', 'recruit', 'need a', 'looking for', 'search for',
    'candidate', 'developer', 'engineer', 'designer', 'manager', 'new team member',
  ]
  const lower = content.toLowerCase()
  return hiringKeywords.some((kw) => lower.includes(kw))
}

async function handleHire(candidateId: string) {
  const msg = messages.value.find(
    (m) => m.candidates?.some((c) => c.id === candidateId),
  )
  if (!msg) return

  try {
    if (msg.sessionId && msg.pendingToolCallId) {
      // Multi-turn tool-call: server unblocks the LLM which will stream its acknowledgement
      // through the still-open chat fetch (don't await — fire and forget).
      fetch('/api/chat/tool-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: msg.sessionId,
          toolCallId: msg.pendingToolCallId,
          candidateId,
        }),
      })
        .then((r) => r.json())
        .then(() => refreshAgents())
        .catch((err) => console.error('tool-result POST failed:', err))
    } else {
      // Fallback path (Gemini): direct hire endpoint, then append a confirmation message.
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
          content: '✅ Candidate has been hired and added to the active agents!',
          agentHandle: 'hr',
        })
        scrollToBottom()
      }
    }
  } catch (err) {
    console.error('Hire failed:', err)
  }
}
</script>

<template>
  <div class="flex flex-col h-full w-full">
    <div ref="timelineRef" class="flex-1 overflow-y-auto">
      <ChatTimeline :messages="messages" @hire="handleHire" />

      <div v-if="isLoading" class="px-6 pb-4">
        <div class="flex items-center gap-2 text-[var(--color-text-muted)] text-sm">
          <div class="flex gap-1">
            <span class="w-2 h-2 rounded-full bg-[var(--color-accent-cyan)] animate-bounce" style="animation-delay: 0ms" />
            <span class="w-2 h-2 rounded-full bg-[var(--color-accent-cyan)] animate-bounce" style="animation-delay: 150ms" />
            <span class="w-2 h-2 rounded-full bg-[var(--color-accent-cyan)] animate-bounce" style="animation-delay: 300ms" />
          </div>
        </div>
      </div>
    </div>

    <div class="flex-shrink-0 border-t border-[var(--color-glass-border)]">
      <ChatInput @send="handleSend" />
    </div>
  </div>
</template>
