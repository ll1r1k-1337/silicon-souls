import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.providers.js';
import { agents } from '../database/schema.js';

@Injectable()
export class AgentsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findByHandle(handle: string) {
    const rows = await this.db
      .select()
      .from(agents)
      .where(eq(agents.handle, handle));

    if (rows.length === 0) return null;
    const agent = rows[0];
    return agent.status === 'HIRED' ? agent : null;
  }

  async getActiveAgents() {
    return this.db
      .select({
        handle: agents.handle,
        name: agents.name,
      })
      .from(agents)
      .where(eq(agents.status, 'HIRED'));
  }

  async hireCandidate(candidateId: string): Promise<boolean> {
    const result = await this.db
      .update(agents)
      .set({ status: 'HIRED' })
      .where(eq(agents.id, candidateId))
      .returning();

    return result.length > 0;
  }

  async createCandidates(
    candidates: Array<{
      handle: string;
      name: string;
      role: string;
      personality: string;
      skills: string[];
      expectedSalary: string;
      hrComment: string;
    }>,
  ) {
    const inserted = await this.db
      .insert(agents)
      .values(
        candidates.map((c) => ({
          handle: c.handle,
          name: c.name,
          role: c.role,
          personality: c.personality,
          status: 'CANDIDATE' as const,
          metadata: {
            skills: c.skills,
            expected_salary: c.expectedSalary,
            hr_comment: c.hrComment,
          },
        })),
      )
      .returning();

    return inserted;
  }
}
