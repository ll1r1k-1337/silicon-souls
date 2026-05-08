import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { SystemLogsService, type SystemLogsResponse } from './system-logs.service';

const SystemLogsQuerySchema = z.object({
  sessionId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

@Controller('system/logs')
export class SystemLogsController {
  constructor(private readonly logs: SystemLogsService) {}

  @Get()
  async getLogs(@Query() query: unknown): Promise<SystemLogsResponse> {
    return this.logs.getLogs(SystemLogsQuerySchema.parse(query));
  }
}
