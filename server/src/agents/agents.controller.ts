import { Controller, Get, Post, Body } from '@nestjs/common';
import { AgentsService } from './agents.service.js';

@Controller('api/agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get('active')
  async getActive() {
    const agentsList = await this.agentsService.getActiveAgents();
    return { agents: agentsList };
  }

  @Post('hire')
  async hire(@Body() body: { candidateId: string }) {
    const success = await this.agentsService.hireCandidate(body.candidateId);
    return { success };
  }
}
