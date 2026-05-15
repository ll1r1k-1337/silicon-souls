import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module.js';
import { ChatSessionStore } from '../chat/session-store.js';
import { PresentCandidatesTool } from './tools/present-candidates.tool.js';
import { InternalMcpController } from './mcp/internal-mcp.controller.js';

@Module({
  imports: [AgentsModule],
  controllers: [InternalMcpController],
  providers: [ChatSessionStore, PresentCandidatesTool],
  exports: [ChatSessionStore, PresentCandidatesTool],
})
export class LlmModule {}
