import { describe, expect, it, vi } from 'vitest';
import { ProjectsController } from '../src/modules/projects/projects.controller';
import { SpecSessionsController } from '../src/modules/spec-sessions/spec-sessions.controller';

describe('API controller contracts', () => {
  it('returns projectId and status from POST /projects', async () => {
    const controller = new ProjectsController({
      create: vi.fn().mockResolvedValue({
        id: 'prj_123',
        name: 'Product',
        status: 'created',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    } as any);

    await expect(controller.create({ name: 'Product' })).resolves.toMatchObject({
      projectId: 'prj_123',
      status: 'created',
    });
  });

  it('returns queued jobs from POST /spec-sessions/:sessionId/messages', async () => {
    const controller = new SpecSessionsController({
      sendUserMessage: vi.fn().mockResolvedValue({
        messageId: 'msg_123',
        jobs: [
          { jobId: 'job_extract_123', type: 'extract_artifacts', status: 'queued' },
          {
            jobId: 'job_questions_123',
            type: 'generate_clarifying_questions',
            status: 'queued',
          },
        ],
        status: 'clarifying',
      }),
    } as any);

    await expect(
      controller.sendMessage('spec_123', { message: 'MVP must support expenses' }),
    ).resolves.toMatchObject({
      messageId: 'msg_123',
      status: 'clarifying',
      jobs: [
        { type: 'extract_artifacts', status: 'queued' },
        { type: 'generate_clarifying_questions', status: 'queued' },
      ],
    });
  });
});
