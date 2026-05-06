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
  };
}

export function extractChangelog(markdown: string): string {
  const marker = '## Changelog';
  const index = markdown.indexOf(marker);
  return index >= 0 ? markdown.slice(index).trim() : '# Changelog\n\n- No changelog entries.';
}
