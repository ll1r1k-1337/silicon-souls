import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { CandidateGeneratorService } from './candidate-generator.service.js';
import { AgentsModule } from '../agents/agents.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { DocumentsModule } from '../documents/documents.module.js';

@Module({
  imports: [AgentsModule, SettingsModule, DocumentsModule],
  controllers: [ChatController],
  providers: [ChatService, CandidateGeneratorService],
})
export class ChatModule {}
