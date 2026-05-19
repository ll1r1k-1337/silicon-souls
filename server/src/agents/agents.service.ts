import { Inject, Injectable } from '@nestjs/common';
import {
  RXDB_DATABASE,
  type SilSolDatabase,
} from '../database/rxdb.providers.js';
import type { AgentDoc } from '../database/schemas/agent.schema.js';

export interface CandidateInput {
  handle: string;
  name: string;
  role: string;
  personality: string;
  skills: string[];
  expectedSalary: string;
  hrComment: string;
}

export interface SavedAgent {
  id: string;
  handle: string;
  name: string;
  role: string;
  personality: string;
  status: 'CANDIDATE' | 'HIRED';
  skills: string[];
  expectedSalary: string;
  hrComment: string;
}

function toPlain(doc: AgentDoc): SavedAgent {
  return {
    id: doc.id,
    handle: doc.handle,
    name: doc.name,
    role: doc.role,
    personality: doc.personality,
    status: doc.status,
    skills: doc.skills ?? [],
    expectedSalary: doc.expectedSalary ?? '',
    hrComment: doc.hrComment ?? '',
  };
}

@Injectable()
export class AgentsService {
  constructor(@Inject(RXDB_DATABASE) private readonly db: SilSolDatabase) {}

  async findByHandle(handle: string): Promise<SavedAgent | null> {
    const doc = await this.db.agents.findOne({ selector: { handle } }).exec();
    if (!doc) return null;
    const plain = toPlain(doc.toJSON() as AgentDoc);
    return plain.status === 'HIRED' ? plain : null;
  }

  async findById(id: string): Promise<SavedAgent | null> {
    const doc = await this.db.agents.findOne(id).exec();
    if (!doc) return null;
    return toPlain(doc.toJSON() as AgentDoc);
  }

  async getActiveAgents(): Promise<Array<{ handle: string; name: string }>> {
    const docs = await this.db.agents
      .find({ selector: { status: 'HIRED' } })
      .exec();
    return docs.map((d) => ({ handle: d.handle, name: d.name }));
  }

  async hireCandidate(candidateId: string): Promise<boolean> {
    const doc = await this.db.agents.findOne(candidateId).exec();
    if (!doc) return false;
    await doc.patch({ status: 'HIRED' });
    return true;
  }

  async createCandidates(candidates: CandidateInput[]): Promise<SavedAgent[]> {
    const now = Date.now();
    const rows = candidates.map((c) => ({
      id: crypto.randomUUID(),
      handle: c.handle,
      name: c.name,
      role: c.role,
      personality: c.personality,
      status: 'CANDIDATE' as const,
      skills: c.skills,
      expectedSalary: c.expectedSalary,
      hrComment: c.hrComment,
      createdAt: now,
    }));

    const result = await this.db.agents.bulkInsert(rows);
    if (result.error.length > 0) {
      console.error('Some candidates failed to insert:', result.error);
    }
    return result.success.map((doc) => toPlain(doc.toJSON() as AgentDoc));
  }
}
