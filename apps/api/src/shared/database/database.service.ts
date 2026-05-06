import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly client: postgres.Sql;
  readonly db: PostgresJsDatabase<typeof schema>;

  constructor(config: ConfigService) {
    const url =
      config.get<string>('DATABASE_URL') ??
      'postgres://postgres:postgres@localhost:5432/sdd_stage0';

    this.client = postgres(url, {
      max: 10,
      idle_timeout: 20,
    });
    this.db = drizzle(this.client, { schema });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.end();
  }
}
