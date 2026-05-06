import { describe, expect, it } from 'vitest';
import type { ProductSpecJson } from '@sdd/domain';
import { buildStage1InputBundle, renderProductSpecMarkdown } from '@sdd/spec-format';

const now = new Date().toISOString();

const spec: ProductSpecJson = {
  meta: {
    id: 'doc_1',
    projectId: 'prj_1',
    sessionId: 'spec_1',
    title: 'Stage 0',
    version: '1.0.0',
    status: 'ready_for_decomposition',
    createdAt: now,
    updatedAt: now,
    approvedAt: now,
  },
  product: { name: 'Stage 0', summary: 'Creates approved specifications.' },
  problem: { description: 'Specs need structure.', painPoints: ['Chat is not source of truth'] },
  users: [{ id: 'usr_1', name: 'Owner', description: 'Product owner', needs: [], constraints: [] }],
  goals: [{ id: 'goal_1', description: 'Approve a specification' }],
  nonGoals: [{ id: 'ng_1', description: 'Generate production code' }],
  scenarios: [
    {
      id: 'scn_1',
      title: 'Approve spec',
      actor: 'Owner',
      goal: 'Approve',
      preconditions: [],
      steps: ['Create project', 'Review spec'],
      expectedOutcome: 'Approved spec',
      priority: 'primary',
      relatedRequirementIds: ['req_1'],
    },
  ],
  requirements: [
    {
      id: 'req_1',
      sessionId: 'spec_1',
      type: 'functional',
      title: 'Create project',
      description: 'User can create a project.',
      priority: 'must',
      status: 'confirmed',
      source: { type: 'user_explicit', confidence: 1, requiresUserConfirmation: false },
      sourceTurnIds: [],
      dependencies: [],
      conflictsWith: [],
      acceptanceCriteriaIds: ['ac_1'],
      createdAt: now,
      updatedAt: now,
    },
  ],
  assumptions: [],
  openQuestions: [],
  acceptanceCriteria: [
    {
      id: 'ac_1',
      sessionId: 'spec_1',
      requirementId: 'req_1',
      title: 'Project persisted',
      description: 'Project is saved.',
      verificationMethod: 'test',
      status: 'confirmed',
      createdAt: now,
      updatedAt: now,
    },
  ],
  risks: [],
  decisions: [],
};

describe('Stage 1 export contract', () => {
  it('builds a schema-valid bundle payload', () => {
    const markdown = renderProductSpecMarkdown(spec);
    const bundle = buildStage1InputBundle(markdown, spec);
    expect(bundle.specMeta.version).toBe('1.0.0');
    expect(bundle.requirements).toHaveLength(1);
  });
});
