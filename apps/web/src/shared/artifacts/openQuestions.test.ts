import { describe, expect, it } from 'vitest';
import type { SpecArtifact } from '@sdd/domain';
import { buildQuestionAnswer, choiceOptions, selectedAnswersOf } from './openQuestions';

const baseArtifact: SpecArtifact = {
  id: 'art_1',
  sessionId: 'spec_1',
  artifactType: 'open_question',
  status: 'open',
  source: { type: 'system_generated', confidence: 1, requiresUserConfirmation: false },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  payload: {
    question: 'Which plan?',
    whyItMatters: 'It changes scope.',
    severity: 'important',
    status: 'open',
    answerMode: 'single_choice',
    suggestedAnswers: ['A', 'B'],
    allowOtherAnswer: true,
    otherAnswerLabel: 'Other',
  },
};

describe('open question answer helpers', () => {
  it('adds a separate Other option only when allowed', () => {
    expect(choiceOptions(baseArtifact)).toEqual(['A', 'B', 'Other']);
  });

  it('builds a custom answer without duplicating the Other label', () => {
    expect(buildQuestionAnswer(baseArtifact, ['Other'], '', 'Custom')).toBe('Custom');
  });

  it('hydrates selected answers from existing payload answer', () => {
    expect(
      selectedAnswersOf({
        ...baseArtifact,
        payload: { ...(baseArtifact.payload as object), answer: 'A' },
      }),
    ).toEqual(['A']);
  });
});
