import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { AgentsModule } from './agents/agents.module.js';
import { ChatModule } from './chat/chat.module.js';
import { DocumentsModule } from './documents/documents.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    SettingsModule,
    AgentsModule,
    DocumentsModule,
    ChatModule,
  ],
})
export class AppModule {}
