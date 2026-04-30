<script setup lang="ts">
import { ref, reactive } from 'vue'
import {
  TransitionRoot,
  TransitionChild,
  Dialog,
  DialogPanel,
  DialogTitle,
} from '@headlessui/vue'
import { useSettings } from '@/composables/useSettings'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const { settings, checking, checkResult, saveSettings, checkConnection } = useSettings()

const form = reactive({
  baseURL: settings.value.baseURL,
  apiKey: settings.value.apiKey,
  modelName: settings.value.modelName,
})

const saving = ref(false)
const saved = ref(false)

async function handleSave() {
  saving.value = true
  saved.value = false
  await saveSettings({ ...form })
  saving.value = false
  saved.value = true
  setTimeout(() => {
    saved.value = false
  }, 2000)
}

async function handleCheck() {
  await checkConnection({ ...form })
}

function handleClose() {
  emit('close')
}
</script>

<template>
  <TransitionRoot :show="open" as="template">
    <Dialog @close="handleClose" class="relative z-50">
      <!-- Backdrop -->
      <TransitionChild
        as="template"
        enter="ease-out duration-300"
        enter-from="opacity-0"
        enter-to="opacity-100"
        leave="ease-in duration-200"
        leave-from="opacity-100"
        leave-to="opacity-0"
      >
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      </TransitionChild>

      <!-- Panel -->
      <div class="fixed inset-0 flex items-center justify-center p-4">
        <TransitionChild
          as="template"
          enter="ease-out duration-300"
          enter-from="opacity-0 scale-95 translate-y-4"
          enter-to="opacity-100 scale-100 translate-y-0"
          leave="ease-in duration-200"
          leave-from="opacity-100 scale-100 translate-y-0"
          leave-to="opacity-0 scale-95 translate-y-4"
        >
          <DialogPanel class="glass rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl shadow-black/30">
            <!-- Header -->
            <div class="flex items-center justify-between px-6 py-4 border-b border-[var(--color-glass-border)]">
              <DialogTitle class="text-lg font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                <svg class="w-5 h-5 text-[var(--color-accent-cyan)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                LLM Provider Settings
              </DialogTitle>
              <button
                @click="handleClose"
                class="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-500)]/50 transition-colors cursor-pointer"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- Form -->
            <div class="p-6 space-y-5">
              <!-- Base URL -->
              <div class="space-y-2">
                <label class="block text-sm font-medium text-[var(--color-text-secondary)]">
                  Base URL
                  <span class="text-[var(--color-text-muted)] font-normal">(optional)</span>
                </label>
                <input
                  v-model="form.baseURL"
                  type="url"
                  placeholder="https://api.openai.com/v1"
                  class="w-full px-4 py-2.5 rounded-xl bg-[var(--color-surface-700)] border border-[var(--color-glass-border)] text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent-cyan)]/40 transition-colors"
                />
              </div>

              <!-- API Key -->
              <div class="space-y-2">
                <label class="block text-sm font-medium text-[var(--color-text-secondary)]">
                  API Key
                </label>
                <input
                  v-model="form.apiKey"
                  type="password"
                  placeholder="sk-..."
                  class="w-full px-4 py-2.5 rounded-xl bg-[var(--color-surface-700)] border border-[var(--color-glass-border)] text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent-cyan)]/40 transition-colors font-mono"
                />
              </div>

              <!-- Model Name -->
              <div class="space-y-2">
                <label class="block text-sm font-medium text-[var(--color-text-secondary)]">
                  Model Name
                </label>
                <input
                  v-model="form.modelName"
                  type="text"
                  placeholder="gpt-oss-120"
                  class="w-full px-4 py-2.5 rounded-xl bg-[var(--color-surface-700)] border border-[var(--color-glass-border)] text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent-cyan)]/40 transition-colors"
                />
              </div>

              <!-- Check Connection Result -->
              <Transition
                enter-active-class="transition duration-200 ease-out"
                enter-from-class="opacity-0 -translate-y-1"
                enter-to-class="opacity-100 translate-y-0"
                leave-active-class="transition duration-150 ease-in"
                leave-from-class="opacity-100"
                leave-to-class="opacity-0"
              >
                <div
                  v-if="checkResult"
                  class="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
                  :class="
                    checkResult.success
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                      : 'bg-red-500/10 border border-red-500/20 text-red-400'
                  "
                >
                  <svg v-if="checkResult.success" class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <svg v-else class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {{ checkResult.message }}
                </div>
              </Transition>
            </div>

            <!-- Footer -->
            <div class="flex items-center gap-3 px-6 py-4 border-t border-[var(--color-glass-border)]">
              <!-- Check Connection Button -->
              <button
                @click="handleCheck"
                :disabled="checking || !form.apiKey"
                class="px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border border-[var(--color-accent-purple)]/30 text-[var(--color-accent-purple)] hover:bg-[var(--color-accent-purple)]/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <span v-if="checking" class="flex items-center gap-2">
                  <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Checking...
                </span>
                <span v-else>Check Connection</span>
              </button>

              <div class="flex-1" />

              <!-- Save Button -->
              <button
                @click="handleSave"
                :disabled="saving || !form.apiKey || !form.modelName"
                class="px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 bg-gradient-to-r from-[var(--color-accent-cyan)] to-[var(--color-accent-teal)] text-[var(--color-surface-900)] hover:shadow-lg hover:shadow-[var(--color-accent-cyan)]/25 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <span v-if="saved">✓ Saved</span>
                <span v-else-if="saving">Saving...</span>
                <span v-else>Save Settings</span>
              </button>
            </div>
          </DialogPanel>
        </TransitionChild>
      </div>
    </Dialog>
  </TransitionRoot>
</template>
