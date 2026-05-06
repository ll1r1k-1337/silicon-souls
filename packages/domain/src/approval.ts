import type { ApprovalValidationResult, ProductSpecJson, ReviewReportPayload } from './types';

export function validateApprovalReadiness(
  spec: ProductSpecJson,
  review?: ReviewReportPayload,
): ApprovalValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!spec.product.summary.trim()) {
    errors.push('Product summary is missing.');
  }

  if (!spec.problem.description.trim()) {
    errors.push('Problem statement is missing.');
  }

  if (spec.users.length === 0) {
    errors.push('At least one target user is required.');
  }

  if (spec.goals.length === 0) {
    errors.push('At least one goal is required.');
  }

  if (spec.nonGoals.length === 0) {
    errors.push('At least one non-goal is required.');
  }

  if (spec.scenarios.length === 0) {
    errors.push('At least one core user scenario is required.');
  }

  const functionalRequirements = spec.requirements.filter(
    (requirement) =>
      requirement.type === 'functional' && requirement.status !== 'rejected',
  );

  if (functionalRequirements.length === 0) {
    errors.push('At least one functional requirement is required.');
  }

  const missingAcceptanceCriteria = spec.requirements.filter((requirement) => {
    if (requirement.priority !== 'must' || requirement.status === 'rejected') {
      return false;
    }

    return (
      requirement.acceptanceCriteriaIds.length === 0 &&
      spec.acceptanceCriteria.every(
        (criterion) =>
          criterion.requirementId !== requirement.id ||
          criterion.status === 'rejected' ||
          criterion.status === 'deprecated',
      )
    );
  });

  if (missingAcceptanceCriteria.length > 0) {
    errors.push('All must-have requirements need acceptance criteria.');
  }

  if (
    spec.openQuestions.some(
      (question) => question.severity === 'blocking' && question.status === 'open',
    )
  ) {
    errors.push('Blocking open questions must be resolved.');
  }

  if (
    spec.assumptions.some(
      (assumption) =>
        (assumption.impact === 'critical' || assumption.impact === 'high') &&
        assumption.status === 'unconfirmed',
    )
  ) {
    errors.push('High-impact and critical assumptions must be confirmed or rejected.');
  }

  if (spec.requirements.some((requirement) => requirement.conflictsWith.length > 0)) {
    errors.push('Requirement conflicts must be resolved.');
  }

  if (review && !review.canApprove) {
    errors.push(...review.blockingIssues);
    warnings.push(...review.warnings);
  }

  return {
    canApprove: errors.length === 0,
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
  };
}
