import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export const DRIZZLE = Symbol('DRIZZLE');
const POSTGRES_CLIENT = Symbol('POSTGRES_CLIENT');

export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

export const postgresProvider = {
  provide: POSTGRES_CLIENT,
  useFactory: () => postgres(process.env.DATABASE_URL!),
};

export const drizzleProvider = {
  provide: DRIZZLE,
  useFactory: (client: postgres.Sql) => drizzle(client, { schema }),
  inject: [POSTGRES_CLIENT],
};

@Injectable()
export class PostgresShutdownService implements OnApplicationShutdown {
  constructor(@Inject(POSTGRES_CLIENT) private readonly client: postgres.Sql) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}
