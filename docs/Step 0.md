# **System Prompt / Technical Specification for AI Assistant**

**Project Name:** Silicon Souls (Stage 0 \- PoC)

**Role:** You are a Senior Fullstack Developer. Your task is to implement the MVP based on the strict technical contracts below.

## **1\. Tech Stack (Strict Constraints)**

* **Frontend:** Vue 3 (Composition API), Tailwind CSS, Headless UI (Vue), @ai-sdk/vue.  
* **Backend:** Nest.js (10+), TypeScript.  
* **LLM integration:** @langchain/openai, zod.  
* **Database:** PostgreSQL, drizzle-orm.

## **2\. Database Schema (Drizzle ORM)**

Generate the following tables exactly as specified:

// system\_settings  
key: varchar('key', { length: 50 }).primaryKey(),  
value: jsonb('value').$type\<{ baseURL?: string; apiKey: string; modelName: string }\>(),

// agents  
id: uuid('id').defaultRandom().primaryKey(),  
handle: varchar('handle', { length: 50 }).unique().notNull(), // e.g. 'hr', 'alice'  
name: varchar('name', { length: 100 }).notNull(),  
role: varchar('role', { length: 100 }).notNull(),  
personality: text('personality').notNull(),  
status: varchar('status', { enum: \['CANDIDATE', 'HIRED'\] }).default('CANDIDATE'),  
metadata: jsonb('metadata').$type\<{ skills?: string\[\]; expected\_salary?: string; hr\_comment?: string; }\>(),  
createdAt: timestamp('created\_at').defaultNow(),

// messages  
id: uuid('id').defaultRandom().primaryKey(),  
senderType: varchar('sender\_type', { enum: \['USER', 'AGENT'\] }).notNull(),  
senderId: uuid('sender\_id').references(() \=\> agents.id), // Nullable  
content: text('content').notNull(),  
createdAt: timestamp('created\_at').defaultNow(),

## **3\. API Contracts (Nest.js \-\> Vue)**

### **3.1. POST /api/chat**

* **Input:** { messages: Array\<{ role: 'user' | 'assistant', content: string }\> }  
* **Output:** text/event-stream (Vercel AI SDK format).  
* **Data Stream Append (if candidates generated):** Custom JSON appended to stream: \[{ type: "CANDIDATES\_LIST", payload: \[ { id, handle, name, role, skills, hr\_comment } \] }\].

### **3.2. POST /api/agents/hire**

* **Input:** { candidateId: string }  
* **Action:** UPDATE agents SET status \= 'HIRED' WHERE id \= candidateId  
* **Output:** { success: boolean }

### **3.3. GET /api/agents/active**

* **Output:** { agents: Array\<{ handle: string, name: string }\> } (Only WHERE status \= 'HIRED')

## **4\. Backend Logic (Nest.js)**

### **4.1. Message Routing Algorithm**

1. Extract lastMessage from input array.  
2. Regex match: /@(\[a-zA-Z0-9\_\]+)/  
3. If no match \-\> Return standard error stream: *"Please mention an agent using @handle"*.  
4. If match \-\> Extract handle. Query agents table.  
5. If not found or status \!= 'HIRED' \-\> Return error stream: *"Agent not found"*.  
6. If handle \=== 'hr' AND intent is hiring \-\> Trigger CandidateGeneratorService.  
7. Else \-\> Trigger standard LangChain ChatOpenAI.stream() using the agent's personality as the SystemMessage.

### **4.2. Candidate Generation (LangChain Structured Output)**

Use this Zod schema for generation when HR is asked to hire:

z.object({  
  replyMessage: z.string(), // Streamed as text  
  candidates: z.array(z.object({  
    handle: z.string(),  
    name: z.string(),  
    role: z.string(),  
    personality: z.string(),  
    skills: z.array(z.string()),  
    expectedSalary: z.string(),  
    hrComment: z.string()  
  })).length(3)  
})

Save generated candidates to DB with status CANDIDATE. Append to Vercel AI SDK StreamData.

## **5\. Frontend Logic (Vue 3\)**

### **5.1. Chat View (@ai-sdk/vue)**

* Use const { messages, input, handleSubmit, data } \= useChat();  
* Render Timeline.vue using v-for="msg in messages".  
* If data contains CANDIDATES\_LIST for the current message, render \<CandidateCard\> components below the message text.

### **5.2. Autocomplete Input**

* Fetch /api/agents/active on mount.  
* On textarea @input, track cursor. If word starts with @, render Headless UI Popover with filtered agents. On select, autocomplete handle.

### **5.3. Hiring Action**

* Inside \<CandidateCard\>, button "Hire" triggers POST /api/agents/hire.  
* On success: hide all candidate cards, show local system message, refresh active agents list.