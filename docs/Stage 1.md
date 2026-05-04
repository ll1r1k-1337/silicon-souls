# **System Prompt / Strict Technical Specification for AI Assistant**

**Project Name:** Silicon Souls (Stage 1 \- Spec-Driven Development)

**Role:** You are a Senior Fullstack Developer. Your task is to implement collaborative real-time document editing (SDD) and LLM context injection.

**Constraint:** DO NOT invent architecture. Follow the exact file structures, schemas, and algorithms provided below. Do not use mock data.

## **1\. Database Schema Update (server/src/database/schema.ts)**

Add the documents table exactly as defined below. Generate and apply Drizzle migrations.

import { pgTable, uuid, varchar, text, customType, boolean, timestamp } from 'drizzle-orm/pg-core';

// Custom type for Yjs binary updates in PostgreSQL (bytea)  
const bytea \= customType\<{ data: Buffer; driverData: Buffer }\>({  
  dataType() { return 'bytea'; },  
  toDriver(val: Buffer) { return val; },  
  fromDriver(val: Buffer) { return val; },  
});

export const documents \= pgTable('documents', {  
  id: uuid('id').defaultRandom().primaryKey(),  
  title: varchar('title', { length: 255 }).notNull().default('New Specification'),  
  contentMarkdown: text('content\_markdown').default(''),   
  yjsState: bytea('yjs\_state'),   
  isApproved: boolean('is\_approved').default(false),   
  createdAt: timestamp('created\_at').defaultNow(),  
  updatedAt: timestamp('updated\_at').defaultNow(),  
});

## **2\. Backend Logic (Nest.js)**

### **2.1. Document WebSocket Gateway (server/src/documents/document.gateway.ts)**

Implement a WebSocket Gateway to handle Yjs syncing.

**Algorithm & Constraints:**

1. Use @WebSocketGateway({ namespace: '/docs', cors: true }).  
2. Keep an in-memory map of active Y.Doc instances: const docs: Map\<string, Y.Doc\> \= new Map().  
3. On client connect (handleConnection), expect a docId in the query string.  
4. If the doc is not in memory, fetch yjsState from the DB. If it exists, apply it: Y.applyUpdate(ydoc, dbDoc.yjsState).  
5. Listen for sync-update events from clients containing Uint8Array updates.  
6. When an update is received:  
   * Apply to the in-memory Y.Doc: Y.applyUpdate(ydoc, update).  
   * Broadcast the update to all other clients in the same room (client.broadcast.to(docId).emit('sync-update', update)).  
   * **Debounce DB Save (2000ms):** Extract markdown using ydoc.getText('default').toString() (or custom prosemirror parser). Save Y.encodeStateAsUpdate(ydoc) to yjsState and the markdown to contentMarkdown.

### **2.2. LangChain Tools (server/src/llm/tools/document.tools.ts)**

Implement these exact tools using @langchain/core/tools and zod. Bind them to the agent in your ChatService.

import { tool } from "@langchain/core/tools";  
import { z } from "zod";

export const createDocumentTool \= tool(  
  async ({ title, initialContentMarkdown }) \=\> {  
    // 1\. Insert new row into \`documents\` table via Drizzle.  
    // 2\. Return the new \`docId\` as a string.  
  },  
  {  
    name: "create\_document",  
    description: "Creates a new specification document and returns its ID.",  
    schema: z.object({  
      title: z.string(),  
      initialContentMarkdown: z.string().describe("Markdown formatted text")  
    }),  
  }  
);

export const editDocumentTool \= tool(  
  async ({ docId, newContentMarkdown }) \=\> {  
    // 1\. Fetch document from DB.  
    // 2\. IMPORTANT: In a real scenario, this would apply a Yjs diff.   
    // For Stage 1: Overwrite \`contentMarkdown\`, generate a fresh Y.Doc from this markdown,   
    // extract \`Y.encodeStateAsUpdate(ydoc)\`, save to DB.  
    // 3\. Emit a Socket.io event to the Gateway to force clients to reload or apply update.  
    return "Document successfully updated.";  
  },  
  {  
    name: "edit\_document",  
    description: "Overwrites the content of an existing document. Use this to apply fixes.",  
    schema: z.object({  
      docId: z.string().uuid(),  
      newContentMarkdown: z.string().describe("Complete new markdown content")  
    }),  
  }  
);

### **2.3. Context Injection Logic (server/src/chat/chat.service.ts)**

Before passing the user's message to the LLM, scan it for document references.

**Algorithm:**

1. Extract lastUserMessage \= messages\[messages.length \- 1\].content.  
2. Run Regex: const docMatches \= \[...lastUserMessage.matchAll(/(?:^|\\s)\#(\[0-9a-fA-F-\]{36})/g)\] (assuming the frontend sends the UUID after the \# hash, or a slug).  
3. If matches found, query Drizzle: SELECT title, content\_markdown FROM documents WHERE id IN (matches).  
4. Prepend a SystemMessage to the LangChain message array:  
   new SystemMessage(\`The user referenced the following documents in their message.   
   Use this context to answer:\\n\\n Title: ${doc.title}\\nContent: ${doc.contentMarkdown}\`)

## **3\. Frontend Logic (Vue 3\)**

### **3.1. IDE Layout (web/src/views/WorkspaceView.vue)**

Replace the single chat view with a split pane layout using Tailwind.

\<div class="flex h-screen w-full bg-gray-50"\>  
  \<\!-- Left Panel: Chat (30%) \--\>  
  \<aside class="w-\[30%\] min-w-\[350px\] border-r border-gray-200 bg-white flex flex-col"\>  
    \<ChatTimeline :messages="messages" /\>  
    \<ChatInput @send="handleSend" /\>  
  \</aside\>

  \<\!-- Right Panel: Tiptap Editor (70%) \--\>  
  \<main class="flex-1 overflow-hidden bg-white"\>  
    \<DocumentEditor v-if="activeDocId" :docId="activeDocId" /\>  
    \<div v-else class="flex h-full items-center justify-center text-gray-400"\>  
      Select or ask an agent to create a document.  
    \</div\>  
  \</main\>  
\</div\>

### **3.2. Collaborative Editor (web/src/components/DocumentEditor.vue)**

Use @tiptap/vue-3, yjs, and y-websocket (or a custom Socket.io provider that matches your NestJS gateway).

import { useEditor, EditorContent } from '@tiptap/vue-3'  
import StarterKit from '@tiptap/starter-kit'  
import Collaboration from '@tiptap/extension-collaboration'  
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'  
import \* as Y from 'yjs'  
import { HocuspocusProvider } from '@hocuspocus/provider' // Or standard y-websocket

// Setup must be reactive to \`props.docId\`  
const ydoc \= new Y.Doc()  
const provider \= new HocuspocusProvider({  
  url: 'ws://localhost:3000/docs',  
  name: props.docId,  
  document: ydoc,  
})

const editor \= useEditor({  
  extensions: \[  
    StarterKit,  
    Collaboration.configure({ document: ydoc }),  
    CollaborationCursor.configure({   
      provider,   
      user: { name: 'CEO', color: '\#3b82f6' }   
    }),  
  \],  
})

### **3.3. Contextual Ask (Annotation Flow)**

**Constraint:** Implement a "Highlight to Ask" feature.

1. In DocumentEditor.vue, listen to @mouseup or Tiptap's onSelectionUpdate.  
2. If editor.state.selection.empty is false, calculate coordinates and show a floating \<button\>Ask AI\</button\>.  
3. On click, extract the selected text: const text \= editor.state.doc.textBetween(from, to, ' ').  
4. Dispatch an event or use a global store to inject this into ChatInput.vue's textarea as a markdown blockquote:  
   \> "selected text from document"\\n@architect

### **3.4. \# Mention Autocomplete (web/src/components/ChatInput.vue)**

1. Fetch GET /api/documents (returns id, title) on mount.  
2. Monitor input. If the user types \#, render a Headless UI Popover above the input.  
3. On select, insert \#${doc.id} (or a visually hidden markdown link \[\#DocName\](\#doc-uuid)) so the backend Regex can cleanly parse the UUID.