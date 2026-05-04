<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { Extension } from '@tiptap/core'
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import { yCursorPlugin } from '@tiptap/y-tiptap'
import { io, type Socket } from 'socket.io-client'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness.js'

const props = defineProps<{
  docId: string
}>()

const emit = defineEmits<{
  ask: [text: string]
}>()

const editor = shallowRef<Editor | null>(null)
const editorShellRef = ref<HTMLElement | null>(null)
const askButton = ref({
  visible: false,
  top: 0,
  left: 0,
  text: '',
})

let provider: SocketIoYjsProvider | null = null
let ydoc: Y.Doc | null = null

const CollaborationCursor = Extension.create<{
  provider: SocketIoYjsProvider | null
  user: { name: string; color: string }
}>({
  name: 'collaborationCursor',

  addOptions() {
    return {
      provider: null,
      user: { name: 'CEO', color: '#3b82f6' },
    }
  },

  addProseMirrorPlugins() {
    if (!this.options.provider) return []

    this.options.provider.awareness.setLocalStateField(
      'user',
      this.options.user,
    )

    return [
      yCursorPlugin(this.options.provider.awareness, {
        cursorBuilder: (user: { name: string; color: string }) => {
          const cursor = document.createElement('span')
          cursor.classList.add('collaboration-cursor__caret')
          cursor.style.borderColor = user.color

          const label = document.createElement('div')
          label.classList.add('collaboration-cursor__label')
          label.style.backgroundColor = user.color
          label.textContent = user.name
          cursor.append(label)

          return cursor
        },
        selectionBuilder: (user: { color: string }) => ({
          class: 'collaboration-cursor__selection',
          style: `background-color: ${user.color}33`,
        }),
      }),
    ]
  },
})

class SocketIoYjsProvider {
  readonly awareness: Awareness
  private readonly socket: Socket
  private readonly updateHandler: (update: Uint8Array, origin: unknown) => void

  constructor(options: {
    url: string
    docId: string
    document: Y.Doc
    onReload: () => void
  }) {
    this.awareness = new Awareness(options.document)
    this.socket = io(options.url, {
      query: { docId: options.docId },
      transports: ['websocket', 'polling'],
    })

    this.updateHandler = (update, origin) => {
      if (origin === this) return
      this.socket.emit('sync-update', update)
    }

    options.document.on('update', this.updateHandler)

    this.socket.on('sync-update', (payload: unknown) => {
      const update = normalizeUpdate(payload)
      if (update) {
        Y.applyUpdate(options.document, update, this)
      }
    })

    this.socket.on('document-reload', () => {
      options.onReload()
    })
  }

  destroy(document: Y.Doc) {
    document.off('update', this.updateHandler)
    this.awareness.destroy()
    this.socket.disconnect()
  }
}

function normalizeUpdate(payload: unknown): Uint8Array | null {
  if (payload instanceof Uint8Array) return payload
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload)
  if (Array.isArray(payload)) return new Uint8Array(payload)

  if (
    payload &&
    typeof payload === 'object' &&
    'data' in payload &&
    Array.isArray((payload as { data?: unknown }).data)
  ) {
    return new Uint8Array((payload as { data: number[] }).data)
  }

  return null
}

function socketUrl() {
  const configuredOrigin = import.meta.env.VITE_API_ORIGIN as string | undefined
  return `${configuredOrigin ?? 'http://localhost:3000'}/docs`
}

function setupEditor() {
  teardownEditor()

  ydoc = new Y.Doc()
  provider = new SocketIoYjsProvider({
    url: socketUrl(),
    docId: props.docId,
    document: ydoc,
    onReload: setupEditor,
  })

  editor.value = new Editor({
    extensions: [
      StarterKit.configure({
        undoRedo: false,
      }),
      Collaboration.configure({
        document: ydoc,
      }),
      CollaborationCursor.configure({
        provider,
        user: { name: 'CEO', color: '#3b82f6' },
      }),
    ],
    editorProps: {
      attributes: {
        class:
          'prose prose-slate max-w-none min-h-full focus:outline-none text-slate-900',
      },
    },
    onSelectionUpdate: updateAskButton,
  })
}

function teardownEditor() {
  askButton.value.visible = false
  editor.value?.destroy()
  editor.value = null

  if (provider && ydoc) {
    provider.destroy(ydoc)
  }
  provider = null

  ydoc?.destroy()
  ydoc = null
}

function updateAskButton() {
  nextTick(() => {
    const currentEditor = editor.value
    const shell = editorShellRef.value
    if (!currentEditor || !shell) return

    const { from, to, empty } = currentEditor.state.selection
    const text = currentEditor.state.doc.textBetween(from, to, ' ').trim()
    if (empty || !text) {
      askButton.value.visible = false
      return
    }

    const start = currentEditor.view.coordsAtPos(from)
    const end = currentEditor.view.coordsAtPos(to)
    const shellRect = shell.getBoundingClientRect()
    const top = Math.max(12, Math.min(start.top, end.top) - shellRect.top - 44)
    const left = Math.max(
      12,
      Math.min(
        shellRect.width - 96,
        (start.left + end.right) / 2 - shellRect.left - 44,
      ),
    )

    askButton.value = {
      visible: true,
      top,
      left,
      text,
    }
  })
}

function handleAskClick() {
  const text = askButton.value.text
  askButton.value.visible = false
  if (text) {
    emit('ask', text)
  }
}

watch(
  () => props.docId,
  () => setupEditor(),
  { immediate: true },
)

onBeforeUnmount(() => {
  teardownEditor()
})
</script>

<template>
  <section class="relative flex h-full flex-col bg-white">
    <header class="flex h-14 items-center justify-between border-b border-slate-200 px-5">
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold text-slate-900">Specification</p>
        <p class="truncate text-xs text-slate-500">#{{ docId }}</p>
      </div>
    </header>

    <div
      ref="editorShellRef"
      class="relative flex-1 overflow-y-auto px-8 py-7"
      @mouseup="updateAskButton"
      @keyup="updateAskButton"
    >
      <button
        v-if="askButton.visible"
        type="button"
        class="absolute z-20 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg transition hover:bg-slate-700"
        :style="{ top: `${askButton.top}px`, left: `${askButton.left}px` }"
        @mousedown.prevent
        @click="handleAskClick"
      >
        Ask AI
      </button>

      <EditorContent
        v-if="editor"
        :editor="editor"
        class="mx-auto min-h-full max-w-3xl"
      />
    </div>
  </section>
</template>

<style scoped>
:deep(.ProseMirror) {
  min-height: calc(100vh - 7rem);
  font-size: 16px;
  line-height: 1.7;
}

:deep(.ProseMirror p) {
  margin: 0.75rem 0;
}

:deep(.ProseMirror h1) {
  margin: 1.5rem 0 0.75rem;
  font-size: 2rem;
  font-weight: 700;
}

:deep(.ProseMirror h2) {
  margin: 1.35rem 0 0.65rem;
  font-size: 1.5rem;
  font-weight: 700;
}

:deep(.collaboration-cursor__caret) {
  border-left: 1px solid;
  border-right: 1px solid;
  margin-left: -1px;
  margin-right: -1px;
  pointer-events: none;
  position: relative;
  word-break: normal;
}

:deep(.collaboration-cursor__label) {
  border-radius: 3px 3px 3px 0;
  color: white;
  font-size: 12px;
  font-style: normal;
  font-weight: 600;
  left: -1px;
  line-height: 1;
  padding: 0.2rem 0.35rem;
  position: absolute;
  top: -1.4em;
  user-select: none;
  white-space: nowrap;
}
</style>
