export interface Agent {
  handle: string
  name: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  agentHandle?: string
  agentName?: string
  candidates?: Candidate[]
  isGeneratingCandidates?: boolean
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

export interface LlmSettings {
  baseURL: string
  apiKey: string
  modelName: string
}
