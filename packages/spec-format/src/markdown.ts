import { createPrefixedId, nowIso } from '@sdd/domain';
import type {
  AcceptanceCriterion,
  Assumption,
  Decision,
  Goal,
  NonGoal,
  OpenQuestion,
  ProductSpecJson,
  Project,
  Requirement,
  Risk,
  SpecArtifact,
  SpecSession,
  TargetUser,
  UserScenario,
} from '@sdd/domain';

export interface BuildProductSpecInput {
  project: Pick<Project, 'id' | 'name' | 'description'>;
  session: Pick<SpecSession, 'id' | 'projectId' | 'rawIdea' | 'status' | 'approvedAt'>;
  artifacts: SpecArtifact[];
  version: string;
}

function byType<T>(artifacts: SpecArtifact[], type: string): T[] {
  return artifacts
    .filter((artifact) => artifact.artifactType === type && artifact.status !== 'rejected')
    .map((artifact) => artifact.payload as T);
}

export function buildProductSpecJson(input: BuildProductSpecInput): ProductSpecJson {
  const now = nowIso();
  const requirements = byType<Requirement>(input.artifacts, 'requirement');
  const assumptions = byType<Assumption>(input.artifacts, 'assumption');
  const openQuestions = byType<OpenQuestion>(input.artifacts, 'open_question');
  const acceptanceCriteria = byType<AcceptanceCriterion>(
    input.artifacts,
    'acceptance_criterion',
  );
  const risks = byType<Risk>(input.artifacts, 'risk');
  const decisions = byType<Decision>(input.artifacts, 'decision');
  const users = byType<TargetUser>(input.artifacts, 'target_user');
  const goals = byType<Goal>(input.artifacts, 'goal');
  const nonGoals = byType<NonGoal>(input.artifacts, 'non_goal');
  const scenarios = byType<UserScenario>(input.artifacts, 'scenario');

  return {
    meta: {
      id: createPrefixedId('doc'),
      projectId: input.project.id,
      sessionId: input.session.id,
      title: input.project.name,
      version: input.version,
      status: input.session.status,
      createdAt: now,
      updatedAt: now,
      approvedAt: input.session.approvedAt,
    },
    product: {
      name: input.project.name,
      summary: input.project.description || input.session.rawIdea,
    },
    problem: {
      description: input.session.rawIdea,
      painPoints: [],
    },
    users,
    goals,
    nonGoals,
    scenarios,
    requirements,
    assumptions,
    openQuestions,
    acceptanceCriteria,
    risks,
    decisions,
  };
}

function list(items: string[]): string {
  if (items.length === 0) {
    return '- Not specified';
  }

  return items.map((item) => `- ${item}`).join('\n');
}

export function renderProductSpecMarkdown(spec: ProductSpecJson): string {
  const requirementLines =
    spec.requirements.length === 0
      ? '- No requirements extracted yet.'
      : spec.requirements
          .map(
            (requirement) =>
              `### ${requirement.title}\n\n` +
              `- ID: \`${requirement.id}\`\n` +
              `- Type: ${requirement.type}\n` +
              `- Priority: ${requirement.priority}\n` +
              `- Status: ${requirement.status}\n` +
              `- Source: ${requirement.source.type} (${requirement.source.confidence})\n\n` +
              `${requirement.description}`,
          )
          .join('\n\n');

  const criteriaLines =
    spec.acceptanceCriteria.length === 0
      ? '- No acceptance criteria generated yet.'
      : spec.acceptanceCriteria
          .map(
            (criterion) =>
              `- ${criterion.title}: ${criterion.description} ` +
              `(${criterion.verificationMethod}, ${criterion.status})`,
          )
          .join('\n');

  const openQuestions =
    spec.openQuestions.length === 0
      ? '- No open questions.'
      : spec.openQuestions
          .map(
            (question) =>
              `- [${question.severity}/${question.status}] ${question.question} ` +
              `- ${question.whyItMatters}`,
          )
          .join('\n');

  const assumptions =
    spec.assumptions.length === 0
      ? '- No assumptions recorded.'
      : spec.assumptions
          .map(
            (assumption) =>
              `- [${assumption.impact}/${assumption.status}] ${assumption.text} ` +
              `- ${assumption.reason}`,
          )
          .join('\n');

  const risks =
    spec.risks.length === 0
      ? '- No risks identified.'
      : spec.risks
          .map((risk) => `- [${risk.level}/${risk.status}] ${risk.title}: ${risk.description}`)
          .join('\n');

  const decisions =
    spec.decisions.length === 0
      ? '- No decisions recorded.'
      : spec.decisions
          .map((decision) => `- ${decision.title}: ${decision.decision}`)
          .join('\n');

  return `# ${spec.product.name}

## Meta

- Version: ${spec.meta.version}
- Status: ${spec.meta.status}
- Project: \`${spec.meta.projectId}\`
- Session: \`${spec.meta.sessionId}\`

## Product Summary

${spec.product.summary || 'Not specified'}

## Problem

${spec.problem.description || 'Not specified'}

### Pain Points

${list(spec.problem.painPoints)}

## Target Users

${
  spec.users.length === 0
    ? '- No target users specified.'
    : spec.users
        .map((user) => `- ${user.name}: ${user.description}`)
        .join('\n')
}

## Goals

${spec.goals.length === 0 ? '- No goals specified.' : list(spec.goals.map((goal) => goal.description))}

## Non-Goals

${
  spec.nonGoals.length === 0
    ? '- No non-goals specified.'
    : list(spec.nonGoals.map((nonGoal) => nonGoal.description))
}

## User Scenarios

${
  spec.scenarios.length === 0
    ? '- No scenarios specified.'
    : spec.scenarios
        .map((scenario) => `### ${scenario.title}\n\n${scenario.steps.map((step) => `- ${step}`).join('\n')}`)
        .join('\n\n')
}

## Requirements

${requirementLines}

## Acceptance Criteria

${criteriaLines}

## Assumptions

${assumptions}

## Open Questions

${openQuestions}

## Risks

${risks}

## Decisions

${decisions}

## Changelog

- ${spec.meta.version}: Generated snapshot.
`;
}
