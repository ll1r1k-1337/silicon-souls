import { describe, expect, it } from 'vitest';
import { ArtifactSourceSchema, OpenQuestionSchema } from './index';

describe('ArtifactSourceSchema', () => {
  it('rejects out-of-range confidence', () => {
    expect(() =>
      ArtifactSourceSchema.parse({
        type: 'llm_inferred',
        confidence: 2,
        requiresUserConfirmation: true,
      }),
    ).toThrow();
  });
});

describe('OpenQuestionSchema', () => {
  it('accepts structured answer mode and custom answer metadata', () => {
    expect(() =>
      OpenQuestionSchema.parse({
        id: 'oq_1',
        sessionId: 'spec_1',
        question: 'Which MVP option should we adopt?',
        whyItMatters: 'MVP scope controls the first release.',
        severity: 'blocking',
        status: 'open',
        answerMode: 'single_choice',
        suggestedAnswers: ['CRUD only'],
        allowOtherAnswer: true,
        otherAnswerLabel: 'Other',
        customAnswer: 'Matrix view plus local persistence',
        relatedRequirementIds: [],
        createdAt: '2026-05-07T00:00:00.000Z',
        updatedAt: '2026-05-07T00:00:00.000Z',
      }),
    ).not.toThrow();
  });
});
