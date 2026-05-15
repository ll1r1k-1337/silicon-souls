import { ref, computed } from 'vue'
import type { LlmSettings, ProviderType } from '@/types'

const settings = ref<LlmSettings>({
  providerType: 'openai',
  baseURL: '',
  apiKey: '',
  modelName: 'gpt-4o-mini',
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
          providerType: (data.settings.providerType ?? 'openai') as ProviderType,
          baseURL: data.settings.baseURL ?? '',
          apiKey: '', // masked from server
          modelName: data.settings.modelName ?? '',
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      checkResult.value = {
        success: false,
        message: `Request failed: ${msg}`,
      }
    } finally {
      checking.value = false
    }
  }

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
