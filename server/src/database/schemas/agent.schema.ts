import type { RxJsonSchema } from 'rxdb';

export interface AgentDoc {
  id: string;
  handle: string;
  name: string;
  role: string;
  personality: string;
  status: 'CANDIDATE' | 'HIRED';
  skills: string[];
  expectedSalary: string;
  hrComment: string;
  createdAt: number;
}

export const agentSchema: RxJsonSchema<AgentDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 64 },
    handle: { type: 'string', maxLength: 64 },
    name: { type: 'string', maxLength: 200 },
    role: { type: 'string', maxLength: 200 },
    personality: { type: 'string' },
    status: { type: 'string', enum: ['CANDIDATE', 'HIRED'], maxLength: 16 },
    skills: { type: 'array', items: { type: 'string' } },
    expectedSalary: { type: 'string' },
    hrComment: { type: 'string' },
    createdAt: { type: 'number' },
  },
  required: ['id', 'handle', 'name', 'role', 'personality', 'status'],
  indexes: ['handle', 'status'],
};
