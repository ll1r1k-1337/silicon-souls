import { Injectable } from '@nestjs/common';
import { createPrefixedId, nowIso, type Project } from '@sdd/domain';
import { desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../../shared/database/database.service';
import { projects, type ProjectRow } from '../../shared/database/schema';
import { EventStoreService } from '../../shared/events/event-store.service';
import { throwNotFound } from '../../shared/errors/not-found';

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    status: row.status as Project['status'],
    currentSpecSessionId: row.currentSpecSessionId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly events: EventStoreService,
  ) {}

  async create(input: { name: string; description?: string }): Promise<Project> {
    const now = new Date(nowIso());
    const [project] = await this.database.db
      .insert(projects)
      .values({
        id: createPrefixedId('prj'),
        name: input.name,
        description: input.description,
        status: 'created',
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await this.events.append({
      aggregateId: project.id,
      aggregateType: 'project',
      eventType: 'project.created',
      payload: {
        name: project.name,
        description: project.description,
      },
    });

    return mapProject(project);
  }

  async list(): Promise<Project[]> {
    const rows = await this.database.db
      .select()
      .from(projects)
      .orderBy(desc(projects.updatedAt));

    return rows.map(mapProject);
  }

  async get(id: string): Promise<Project> {
    const [project] = await this.database.db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (!project) {
      throwNotFound('Project', id);
    }

    return mapProject(project);
  }

  async setCurrentSession(projectId: string, sessionId: string): Promise<void> {
    await this.database.db
      .update(projects)
      .set({
        currentSpecSessionId: sessionId,
        status: 'specification_in_progress',
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));
  }

  async setStatus(projectId: string, status: Project['status']): Promise<void> {
    await this.database.db
      .update(projects)
      .set({ status, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
  }
}
