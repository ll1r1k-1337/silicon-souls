import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ExportsService } from './exports.service';

@Controller('spec-sessions/:sessionId/export')
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get()
  async export(
    @Param('sessionId') sessionId: string,
    @Query('format') format: 'markdown' | 'json' | 'bundle' | 'llm-prompt' = 'markdown',
    @Res() response: any,
  ): Promise<void> {
    if (format === 'json') {
      response.type('application/json').send(await this.exportsService.exportJson(sessionId));
      return;
    }

    if (format === 'bundle') {
      const bundle = await this.exportsService.exportBundle(sessionId);
      response
        .type('application/zip')
        .attachment(`stage0-${sessionId}.zip`)
        .send(bundle);
      return;
    }

    if (format === 'llm-prompt') {
      response.type('text/markdown').send(await this.exportsService.exportLlmPrompt(sessionId));
      return;
    }

    response.type('text/markdown').send(await this.exportsService.exportMarkdown(sessionId));
  }
}
