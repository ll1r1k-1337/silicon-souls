import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { agents } from './schema.js';
import { eq } from 'drizzle-orm';

const HR_PERSONALITY = `You are a professional HR Manager at Silicon Souls, a cutting-edge AI technology company.
Your role is to help the user find and evaluate new team members. You are warm, professional,
and have a keen eye for talent. When asked to hire someone for a specific role, you generate
three diverse, high-quality candidates with realistic profiles.

Guidelines:
- Always be professional but friendly
- When the user asks to hire for a role, generate exactly 3 candidates
- Give candidates realistic names, diverse backgrounds, and relevant skills
- Provide honest, detailed HR assessments for each candidate
- When the user just wants to chat, be helpful and informative about company processes`;

async function seed() {
  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client);

  console.log('🌱 Seeding database...');

  // Check if HR agent already exists
  const existing = await db
    .select()
    .from(agents)
    .where(eq(agents.handle, 'hr'));

  if (existing.length === 0) {
    await db.insert(agents).values({
      handle: 'hr',
      name: 'HR Manager',
      role: 'Human Resources',
      personality: HR_PERSONALITY,
      status: 'HIRED',
      metadata: {
        skills: ['Recruitment', 'Talent Assessment', 'Team Building'],
      },
    });
    console.log('✅ HR agent seeded');
  } else {
    console.log('ℹ️  HR agent already exists, skipping');
  }

  await client.end();
  console.log('🌱 Seed complete');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
