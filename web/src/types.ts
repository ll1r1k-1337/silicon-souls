export interface Agent {
  handle: string
  name: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  agentHandle?: string
  agentName?: string
  candidates?: Candidate[]
  isGeneratingCandidates?: boolean
  sessionId?: string
  pendingToolCallId?: string
}

export interface Candidate {
  id: string
  handle: string
  name: string
  role: string
  personality: string
  skills: string[]
  expectedSalary: string
  hrComment: string
}

export type ProviderType = 'openai' | 'claude-cli' | 'codex-cli' | 'gemini-cli'

export interface LlmSettings {
  providerType: ProviderType
  baseURL: string
  apiKey: string
  modelName: string
}
