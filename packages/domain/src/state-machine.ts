import type { ProjectStatus, SpecStatus } from './types';

const specTransitions: Record<SpecStatus, SpecStatus[]> = {
  raw_idea: ['clarifying', 'archived'],
  clarifying: ['draft', 'needs_user_input', 'archived'],
  draft: ['needs_user_input', 'review', 'archived'],
  needs_user_input: ['clarifying', 'draft', 'archived'],
  review: ['needs_user_input', 'approved', 'draft', 'archived'],
  approved: ['ready_for_decomposition', 'draft', 'archived'],
  ready_for_decomposition: ['draft', 'archived'],
  archived: [],
};

const projectTransitions: Record<ProjectStatus, ProjectStatus[]> = {
  created: ['specification_in_progress', 'archived'],
  specification_in_progress: [
    'specification_approved',
    'ready_for_decomposition',
    'archived',
  ],
  specification_approved: ['ready_for_decomposition', 'specification_in_progress', 'archived'],
  ready_for_decomposition: ['specification_in_progress', 'archived'],
  archived: [],
};

export function canTransitionSpecStatus(from: SpecStatus, to: SpecStatus): boolean {
  return from === to || specTransitions[from]?.includes(to) === true;
}

export function canTransitionProjectStatus(
  from: ProjectStatus,
  to: ProjectStatus,
): boolean {
  return from === to || projectTransitions[from]?.includes(to) === true;
}

export function assertSpecStatusTransition(from: SpecStatus, to: SpecStatus): void {
  if (!canTransitionSpecStatus(from, to)) {
    throw new Error(`Invalid spec status transition: ${from} -> ${to}`);
  }
}
