import { Global, Module } from '@nestjs/common';
import {
  drizzleProvider,
  PostgresShutdownService,
  postgresProvider,
} from './database.providers.js';

@Global()
@Module({
  providers: [postgresProvider, drizzleProvider, PostgresShutdownService],
  exports: [drizzleProvider],
})
export class DatabaseModule {}
