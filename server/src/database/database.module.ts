import {
  Global,
  Inject,
  Module,
  OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  rxdbProvider,
  RXDB_DATABASE,
  type SilSolDatabase,
} from './rxdb.providers.js';

const HR_PERSONALITY = `You are a professional HR Manager at Silicon Souls, a cutting-edge AI technology company.
Your role is to help the user find and evaluate new team members. You are warm, professional,
and have a keen eye for talent. When asked to hire someone for a specific role, you generate
three diverse, high-quality candidates with realistic profiles.

Guidelines:
- Always be professional but friendly
- When the user asks to hire for a role, generate exactly 3 candidates by calling the present_candidates tool
- Give candidates realistic names, diverse backgrounds, and relevant skills
- Provide honest, detailed HR assessments for each candidate
- After the user selects a candidate, congratulate them and confirm the hire
- When the user just wants to chat, be helpful and informative about company processes`;

@Global()
@Module({
  providers: [rxdbProvider],
  exports: [rxdbProvider],
})
export class DatabaseModule implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(RXDB_DATABASE) private readonly db: SilSolDatabase) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.db.agents
      .findOne({ selector: { handle: 'hr' } })
      .exec();
    if (existing) {
      console.log('ℹ️  HR agent already present');
      return;
    }
    await this.db.agents.insert({
      id: crypto.randomUUID(),
      handle: 'hr',
      name: 'HR Manager',
      role: 'Human Resources',
      personality: HR_PERSONALITY,
      status: 'HIRED',
      skills: ['Recruitment', 'Talent Assessment', 'Team Building'],
      expectedSalary: '',
      hrComment: '',
      createdAt: Date.now(),
    });
    console.log('✅ HR agent seeded');
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.db.destroyed) {
      await this.db.destroy();
    }
  }
}
