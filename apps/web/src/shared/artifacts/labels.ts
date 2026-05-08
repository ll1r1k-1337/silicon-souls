import type { SpecArtifactType } from '@sdd/domain';

const artifactTypeLabels: Record<SpecArtifactType, string> = {
  requirement: 'Requirement',
  assumption: 'Assumption',
  open_question: 'Open question',
  acceptance_criterion: 'Acceptance criterion',
  risk: 'Risk',
  decision: 'Decision',
  goal: 'Goal',
  non_goal: 'Non-goal',
  scenario: 'Scenario',
  target_user: 'Target user',
};

export function artifactTypeLabel(type: string): string {
  return artifactTypeLabels[type as SpecArtifactType] ?? humanizeIdentifier(type);
}

function humanizeIdentifier(value: string): string {
  const label = value.replace(/[_-]+/g, ' ').trim();
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : value;
}
