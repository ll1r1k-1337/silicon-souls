import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { ProjectsService } from './projects.service';

const CreateProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  async create(@Body() body: unknown): Promise<Record<string, unknown>> {
    const input = CreateProjectSchema.parse(body);
    const project = await this.projects.create(input);
    return { projectId: project.id, status: project.status, project };
  }

  @Get()
  async list(): Promise<Record<string, unknown>> {
    return { projects: await this.projects.list() };
  }

  @Get(':projectId')
  async get(@Param('projectId') projectId: string): Promise<Record<string, unknown>> {
    return { project: await this.projects.get(projectId) };
  }
}
