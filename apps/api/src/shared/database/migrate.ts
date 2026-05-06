import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';

async function main(): Promise<void> {
  const url =
    process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/sdd_stage0';
  const sql = postgres(url, { max: 1 });
  const migrationPath = resolve(process.cwd(), 'migrations/0000_stage0.sql');
  const migration = await readFile(migrationPath, 'utf8');

  await sql.unsafe(migration);
  await sql.end();
  console.log('Stage 0 database migration applied.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
