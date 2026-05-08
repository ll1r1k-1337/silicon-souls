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
    const sendUserMessage = vi.fn().mockResolvedValue({
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
    });
    const controller = new SpecSessionsController({
      sendUserMessage,
    } as any);

    await expect(
      controller.sendMessage('spec_123', {
        kind: 'text',
        text: 'MVP must support expenses',
      }),
    ).resolves.toMatchObject({
      messageId: 'msg_123',
      status: 'clarifying',
      jobs: [
        { type: 'extract_artifacts', status: 'queued' },
        { type: 'generate_clarifying_questions', status: 'queued' },
      ],
    });
    expect(sendUserMessage).toHaveBeenCalledWith('spec_123', {
      kind: 'text',
      text: 'MVP must support expenses',
    });

    await expect(
      controller.sendMessage('spec_123', { message: 'Legacy payload still works' }),
    ).resolves.toMatchObject({
      messageId: 'msg_123',
      status: 'clarifying',
    });
  });

  it('accepts rich document content from PATCH /spec-sessions/:sessionId/document', async () => {
    const directEdit = vi.fn().mockResolvedValue({
      documentId: 'doc_123',
      versionId: 'ver_123',
      status: 'draft',
    });
    const controller = new SpecSessionsController({ directEdit } as any);
    const contentJson = { type: 'doc', content: [{ type: 'paragraph' }] };

    await expect(
      controller.directEdit('spec_123', {
        contentJson,
        markdown: '# Spec',
        projectionStatus: 'stale',
        changeSummary: 'Edited rich document',
      }),
    ).resolves.toMatchObject({
      documentId: 'doc_123',
      versionId: 'ver_123',
    });
    expect(directEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'spec_123',
        contentJson,
        projectionStatus: 'stale',
      }),
    );
  });

  it('disables document assistant endpoints in chat-only mode', async () => {
    const controller = new SpecSessionsController({} as any);

    await expect(
      controller.createDocumentCommentThread('spec_123', {
        anchor: { from: 1, to: 8, selectedText: 'section' },
        selectedText: 'section',
        content: 'Please check this.',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ statusCode: 409 }),
    });

    await expect(
      controller.documentAssistant('spec_123', {
        mode: 'comment',
        prompt: 'Find ambiguity.',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ statusCode: 409 }),
    });
  });
});
