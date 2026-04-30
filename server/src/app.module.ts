import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { AgentsModule } from './agents/agents.module.js';
import { ChatModule } from './chat/chat.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    SettingsModule,
    AgentsModule,
    ChatModule,
  ],
})
export class AppModule {}
