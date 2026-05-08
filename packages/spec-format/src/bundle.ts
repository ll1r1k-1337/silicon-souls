import type { ProductSpecJson, Stage1InputBundle } from '@sdd/domain';
import { Stage1InputBundleSchema } from '@sdd/schemas';

export interface BundleFiles {
  'product.md': string;
  'requirements.json': string;
  'assumptions.json': string;
  'open-questions.json': string;
  'acceptance-criteria.json': string;
  'risks.json': string;
  'changelog.md': string;
  'spec-meta.json': string;
  'llm-prompt.md': string;
}

export function buildStage1InputBundle(
  markdown: string,
  spec: ProductSpecJson,
): Stage1InputBundle {
  return Stage1InputBundleSchema.parse({
    specMeta: spec.meta,
    productSpecMarkdown: markdown,
    productSpecJson: spec,
    requirements: spec.requirements,
    acceptanceCriteria: spec.acceptanceCriteria,
    decisions: spec.decisions,
    risks: spec.risks,
  });
}

export function buildBundleFiles(markdown: string, spec: ProductSpecJson): BundleFiles {
  return {
    'product.md': markdown,
    'requirements.json': JSON.stringify(spec.requirements, null, 2),
    'assumptions.json': JSON.stringify(spec.assumptions, null, 2),
    'open-questions.json': JSON.stringify(spec.openQuestions, null, 2),
    'acceptance-criteria.json': JSON.stringify(spec.acceptanceCriteria, null, 2),
    'risks.json': JSON.stringify(spec.risks, null, 2),
    'changelog.md': extractChangelog(markdown),
    'spec-meta.json': JSON.stringify(spec.meta, null, 2),
    'llm-prompt.md': buildLlmPromptExport(markdown, spec),
  };
}

export function buildLlmPromptExport(markdown: string, spec: ProductSpecJson): string {
  const openQuestions = spec.openQuestions.filter((question) => question.status === 'open');
  const openQuestionLines =
    openQuestions.length > 0
      ? openQuestions.map(
          (question) =>
            `- ${question.id}: ${question.question} Why it matters: ${question.whyItMatters}`,
        )
      : ['- None.'];

  return [
    '# LLM Implementation Prompt',
    '',
    'You are working from a structured product specification. Treat the specification below as the source of truth.',
    '',
    'Operating rules:',
    '- Preserve explicit requirements, acceptance criteria, risks, decisions, assumptions, and non-goals.',
    '- Do not silently invent scope. If a requirement is ambiguous, ask a concise question.',
    '- Use IDs from the JSON when referencing requirements, acceptance criteria, risks, decisions, or open questions.',
    '- Keep non-goals out of the implementation unless the user explicitly changes scope.',
    '',
    'Expected response format:',
    '- Summary of understanding',
    '- Implementation plan or answer to the user request',
    '- Risks, assumptions, and open questions that affect execution',
    '',
    'Project snapshot:',
    `- Title: ${spec.meta.title}`,
    `- Version: ${spec.meta.version}`,
    `- Status: ${spec.meta.status}`,
    `- Requirements: ${spec.requirements.length}`,
    `- Acceptance criteria: ${spec.acceptanceCriteria.length}`,
    `- Open questions: ${openQuestions.length}`,
    '',
    'Unresolved open questions:',
    ...openQuestionLines,
    '',
    'Product specification markdown:',
    '',
    '````markdown',
    markdown.trim(),
    '````',
    '',
    'Structured product specification JSON:',
    '',
    '````json',
    JSON.stringify(spec, null, 2),
    '````',
    '',
  ].join('\n');
}

export function extractChangelog(markdown: string): string {
  const marker = '## Changelog';
  const index = markdown.indexOf(marker);
  return index >= 0 ? markdown.slice(index).trim() : '# Changelog\n\n- No changelog entries.';
}
