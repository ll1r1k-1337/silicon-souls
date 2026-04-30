import { ref } from 'vue'
import type { Agent } from '@/types'

const agents = ref<Agent[]>([])
const loading = ref(false)

export function useAgents() {
  async function refresh() {
    loading.value = true
    try {
      const res = await fetch('/api/agents/active')
      const data = await res.json()
      agents.value = data.agents ?? []
    } catch (err) {
      console.error('Failed to fetch agents:', err)
    } finally {
      loading.value = false
    }
  }

  // Auto-fetch on first use
  if (agents.value.length === 0) {
    refresh()
  }

  return {
    agents,
    loading,
    refresh,
  }
}
