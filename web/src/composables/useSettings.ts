import { ref, computed } from 'vue'
import type { LlmSettings } from '@/types'

const settings = ref<LlmSettings>({
  baseURL: '',
  apiKey: '',
  modelName: 'gpt-oss-120',
})

const checking = ref(false)
const checkResult = ref<{ success: boolean; message: string } | null>(null)
const configured = ref(false)

export function useSettings() {
  const isConfigured = computed(() => configured.value)

  async function fetchSettings() {
    try {
      const res = await fetch('/api/settings')
      const data = await res.json()
      configured.value = data.configured
      if (data.settings) {
        settings.value = {
          baseURL: data.settings.baseURL ?? '',
          apiKey: '', // API key is masked from server, don't overwrite form
          modelName: data.settings.modelName ?? 'gpt-oss-120',
        }
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err)
    }
  }

  async function saveSettings(data: LlmSettings) {
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await res.json()
      if (result.success) {
        settings.value = { ...data }
        configured.value = true
      }
      return result
    } catch (err) {
      console.error('Failed to save settings:', err)
      return { success: false }
    }
  }

  async function checkConnection(data: LlmSettings) {
    checking.value = true
    checkResult.value = null
    try {
      const res = await fetch('/api/settings/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      checkResult.value = await res.json()
    } catch (err: any) {
      checkResult.value = {
        success: false,
        message: `Request failed: ${err.message}`,
      }
    } finally {
      checking.value = false
    }
  }

  // Auto-fetch on first use
  fetchSettings()

  return {
    settings,
    isConfigured,
    configured,
    checking,
    checkResult,
    fetchSettings,
    saveSettings,
    checkConnection,
  }
}
