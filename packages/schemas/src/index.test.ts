import { describe, expect, it } from 'vitest';
import {
  ArtifactSourceSchema,
  ChatInputEnvelopeSchema,
  ConversationStructuredPayloadSchema,
  OpenQuestionSchema,
} from './index';

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

describe('ChatInputEnvelopeSchema', () => {
  it('accepts typed command envelope', () => {
    expect(() =>
      ChatInputEnvelopeSchema.parse({
        kind: 'command',
        command: 'generate_draft',
        context: {
          selectedText: 'MVP scope',
          source: 'preview',
        },
      }),
    ).not.toThrow();
  });

  it('accepts legacy message payload for backward compatibility', () => {
    expect(() =>
      ChatInputEnvelopeSchema.parse({
        message: 'Please clarify missing assumptions.',
      }),
    ).not.toThrow();
  });
});

describe('ConversationStructuredPayloadSchema', () => {
  it('accepts a questionnaire block with multiple questions', () => {
    expect(() =>
      ConversationStructuredPayloadSchema.parse({
        version: 'chat_response.v1',
        blocks: [
          { type: 'text', text: 'I need a few clarifications before approval.' },
          {
            type: 'questionnaire',
            questions: [
              {
                questionArtifactId: 'art_1',
                question: 'Who is the primary user?',
                whyItMatters: 'Target audience drives scenarios and acceptance criteria.',
                severity: 'blocking',
                answerMode: 'single_choice',
                suggestedAnswers: ['Product owner', 'Operations', 'End users'],
                allowOtherAnswer: true,
                otherAnswerLabel: 'Other',
              },
              {
                questionArtifactId: 'art_2',
                question: 'What is out of scope for v1?',
                whyItMatters: 'Out-of-scope boundaries reduce delivery risk.',
                severity: 'important',
                answerMode: 'free_text',
              },
            ],
          },
        ],
      }),
    ).not.toThrow();
  });
});
