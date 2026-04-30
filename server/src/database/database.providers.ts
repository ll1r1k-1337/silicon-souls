import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export const DRIZZLE = Symbol('DRIZZLE');

export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

export const drizzleProvider = {
  provide: DRIZZLE,
  useFactory: () => {
    const client = postgres(process.env.DATABASE_URL!);
    return drizzle(client, { schema });
  },
};
