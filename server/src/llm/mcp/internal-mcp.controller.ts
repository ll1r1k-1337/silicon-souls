import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import { ChatSessionStore } from '../../chat/session-store.js';
import { PresentCandidatesTool } from '../tools/present-candidates.tool.js';

interface ToolCallBody {
  toolName: string;
  args: unknown;
}

@Controller('api/internal/mcp')
export class InternalMcpController {
  private readonly logger = new Logger(InternalMcpController.name);

  constructor(
    private readonly sessionStore: ChatSessionStore,
    private readonly presentCandidatesTool: PresentCandidatesTool,
  ) {}

  @Post(':sessionId/tool')
  async invokeTool(
    @Param('sessionId') sessionId: string,
    @Headers('x-mcp-token') token: string | undefined,
    @Body() body: ToolCallBody,
  ): Promise<{ result?: unknown; error?: string }> {
    if (!token) throw new ForbiddenException('Missing token');
    const session = this.sessionStore.getByToken(sessionId, token);
    if (!session) throw new ForbiddenException('Invalid session/token');
    if (!body?.toolName) throw new BadRequestException('toolName required');

    const tool = this.toolByName(body.toolName);
    if (!tool) return { error: `Unknown tool: ${body.toolName}` };

    try {
      const result = await tool.handler(body.args, {
        sessionId,
        signal: session.abortController.signal,
      });
      return { result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Tool ${body.toolName} failed: ${msg}`);
      return { error: msg };
    }
  }

  private toolByName(name: string) {
    if (name === PresentCandidatesTool.NAME) {
      return this.presentCandidatesTool.toTool();
    }
    return null;
  }
}
