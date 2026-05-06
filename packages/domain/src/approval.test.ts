import { describe, expect, it } from 'vitest';
import { validateApprovalReadiness } from './approval';
import type { ProductSpecJson } from './types';

const baseSpec: ProductSpecJson = {
  meta: {
    id: 'meta_1',
    projectId: 'prj_1',
    sessionId: 'spec_1',
    title: 'Spec',
    version: '0.1.0',
    status: 'review',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  product: { name: 'Spec', summary: 'Summary' },
  problem: { description: 'Problem', painPoints: ['Manual planning'] },
  users: [{ id: 'usr_1', name: 'Owner', description: 'Owner', needs: [], constraints: [] }],
  goals: [{ id: 'goal_1', description: 'Create approved specs' }],
  nonGoals: [{ id: 'ng_1', description: 'Generate production code' }],
  scenarios: [
    {
      id: 'scn_1',
      title: 'Create spec',
      actor: 'Owner',
      goal: 'Approve specification',
      preconditions: [],
      steps: ['Create project'],
      expectedOutcome: 'Approved specification',
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  assumptions: [],
  openQuestions: [],
  acceptanceCriteria: [
    {
      id: 'ac_1',
      sessionId: 'spec_1',
      requirementId: 'req_1',
      title: 'Project saved',
      description: 'Project is persisted.',
      verificationMethod: 'test',
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  risks: [],
  decisions: [],
};

describe('validateApprovalReadiness', () => {
  it('allows a complete spec', () => {
    expect(validateApprovalReadiness(baseSpec).canApprove).toBe(true);
  });

  it('blocks unresolved blocking questions', () => {
    const result = validateApprovalReadiness({
      ...baseSpec,
      openQuestions: [
        {
          id: 'oq_1',
          sessionId: 'spec_1',
          question: 'Who is the user?',
          whyItMatters: 'Required for scope.',
          severity: 'blocking',
          status: 'open',
          relatedRequirementIds: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    expect(result.canApprove).toBe(false);
    expect(result.errors).toContain('Blocking open questions must be resolved.');
  });
});
