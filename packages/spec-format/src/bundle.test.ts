import type { ProductSpecJson } from '@sdd/domain';
import { describe, expect, it } from 'vitest';
import { buildBundleFiles, buildLlmPromptExport } from './bundle';

const spec: ProductSpecJson = {
  meta: {
    id: 'doc_1',
    projectId: 'prj_1',
    sessionId: 'spec_1',
    title: 'Task Matrix',
    version: '0.1.0',
    status: 'draft',
    createdAt: '2026-05-07T00:00:00.000Z',
    updatedAt: '2026-05-07T00:00:00.000Z',
  },
  product: {
    name: 'Task Matrix',
    summary: 'Prioritize daily tasks.',
  },
  problem: {
    description: 'Flat task lists hide urgency.',
    painPoints: [],
  },
  users: [],
  goals: [],
  nonGoals: [],
  scenarios: [],
  requirements: [],
  assumptions: [],
  openQuestions: [
    {
      id: 'oq_1',
      sessionId: 'spec_1',
      question: 'Should tasks have due dates?',
      whyItMatters: 'Affects task metadata.',
      severity: 'normal',
      status: 'open',
      relatedRequirementIds: [],
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    },
  ],
  acceptanceCriteria: [],
  risks: [],
  decisions: [],
};

describe('LLM prompt export', () => {
  it('renders a prompt with markdown, JSON, and unresolved questions', () => {
    const prompt = buildLlmPromptExport('# Spec', spec);

    expect(prompt).toContain('# LLM Implementation Prompt');
    expect(prompt).toContain('Treat the specification below as the source of truth.');
    expect(prompt).toContain('oq_1: Should tasks have due dates?');
    expect(prompt).toContain('````markdown');
    expect(prompt).toContain('````json');
  });

  it('includes the LLM prompt in the export bundle', () => {
    const files = buildBundleFiles('# Spec', spec);

    expect(files['llm-prompt.md']).toContain('# LLM Implementation Prompt');
  });
});
