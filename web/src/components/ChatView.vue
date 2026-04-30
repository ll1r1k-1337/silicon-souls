<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import Timeline from './Timeline.vue'
import ChatInput from './ChatInput.vue'
import { useAgents } from '@/composables/useAgents'
import type { Message, Candidate } from '@/types'

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
  // Add user message
  const userMsg: Message = {
    id: crypto.randomUUID(),
    role: 'user',
    content,
  }
  messages.value.push(userMsg)
  scrollToBottom()

  // Check if this is an HR hiring intent
  const isHiring = extractHandle(content) === 'hr' && isHiringIntent(content)

  // Create placeholder for assistant response
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
    // Build messages payload for API
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

    // Read SSE stream using the Vercel AI data stream protocol
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Process complete lines
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? '' // Keep incomplete last line in buffer

      for (const line of lines) {
        if (!line.trim()) continue

        const colonIdx = line.indexOf(':')
        if (colonIdx === -1) continue

        const prefix = line.substring(0, colonIdx)
        const payload = line.substring(colonIdx + 1)

        if (prefix === '0') {
          // Text chunk
          try {
            const text = JSON.parse(payload) as string
            const idx = messages.value.findIndex((m) => m.id === assistantId)
            if (idx !== -1) {
              messages.value[idx] = {
                ...messages.value[idx],
                content: messages.value[idx].content + text,
              }
            }
            scrollToBottom()
          } catch {
            // Skip invalid JSON
          }
        } else if (prefix === '2') {
          // Data part (candidates)
          try {
            const dataParts = JSON.parse(payload)
            if (Array.isArray(dataParts)) {
              for (const part of dataParts) {
                if (part.type === 'CANDIDATES_LIST') {
                  const idx = messages.value.findIndex(
                    (m) => m.id === assistantId,
                  )
                  if (idx !== -1) {
                    messages.value[idx] = {
                      ...messages.value[idx],
                      candidates: part.payload,
                      isGeneratingCandidates: false,
                    }
                  }
                }
              }
            }
          } catch {
            // Skip invalid JSON
          }
        }
        // prefix 'd' = finish, we don't need to handle it
      }
    }
  } catch (err: any) {
    console.error('Chat error:', err)
    const idx = messages.value.findIndex((m) => m.id === assistantId)
    if (idx !== -1) {
      messages.value[idx] = {
        ...messages.value[idx],
        content: `❌ Error: ${err.message ?? 'Failed to get response'}`,
      }
    }
  } finally {
    isLoading.value = false
    const idx = messages.value.findIndex((m) => m.id === assistantId)
    if (idx !== -1) {
      messages.value[idx] = {
        ...messages.value[idx],
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
  try {
    const res = await fetch('/api/agents/hire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId }),
    })
    const data = await res.json()
    if (data.success) {
      refreshAgents()
      // Add confirmation message
      messages.value.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '✅ Candidate has been hired and added to the active agents!',
        agentHandle: 'hr',
      })
      scrollToBottom()
    }
  } catch (err) {
    console.error('Hire failed:', err)
  }
}
</script>

<template>
  <div class="flex flex-col h-full w-full">
    <!-- Messages -->
    <div ref="timelineRef" class="flex-1 overflow-y-auto">
      <Timeline :messages="messages" @hire="handleHire" />

      <!-- Loading indicator -->
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

    <!-- Input -->
    <div class="flex-shrink-0 border-t border-[var(--color-glass-border)]">
      <ChatInput @send="handleSend" />
    </div>
  </div>
</template>
