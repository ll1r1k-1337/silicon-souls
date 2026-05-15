import * as path from 'node:path';
import * as fs from 'node:fs';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { DatabaseModule } from './database/database.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { AgentsModule } from './agents/agents.module.js';
import { ChatModule } from './chat/chat.module.js';
import { LlmModule } from './llm/llm.module.js';

function resolveWebDist(): string {
  // At runtime __dirname is server/dist (Nest compiles src/app.module.ts → dist/app.module.js)
  const candidates = [
    path.resolve(process.cwd(), 'web', 'dist'),
    path.resolve(process.cwd(), '..', 'web', 'dist'),
    path.resolve(__dirname, '..', '..', 'web', 'dist'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0]!;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    LlmModule,
    SettingsModule,
    AgentsModule,
    ChatModule,
    ServeStaticModule.forRoot({
      rootPath: resolveWebDist(),
      exclude: ['/api/{*splat}'],
      serveStaticOptions: { fallthrough: true },
    }),
  ],
})
export class AppModule {}
