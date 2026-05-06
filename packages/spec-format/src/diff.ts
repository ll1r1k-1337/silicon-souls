import type { SpecArtifact } from '@sdd/domain';

export interface MarkdownDiffLine {
  type: 'added' | 'removed' | 'unchanged';
  line: string;
}

export interface ArtifactListDiff {
  added: SpecArtifact[];
  removed: SpecArtifact[];
  changed: Array<{
    before: SpecArtifact;
    after: SpecArtifact;
  }>;
}

export function diffMarkdown(before: string, after: string): MarkdownDiffLine[] {
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  const result: MarkdownDiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < beforeLines.length || j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      result.push({ type: 'unchanged', line: beforeLines[i] ?? '' });
      i += 1;
      j += 1;
      continue;
    }

    if (j < afterLines.length && !beforeLines.slice(i).includes(afterLines[j])) {
      result.push({ type: 'added', line: afterLines[j] });
      j += 1;
      continue;
    }

    if (i < beforeLines.length) {
      result.push({ type: 'removed', line: beforeLines[i] });
      i += 1;
      continue;
    }

    if (j < afterLines.length) {
      result.push({ type: 'added', line: afterLines[j] });
      j += 1;
    }
  }

  return result;
}

export function diffArtifacts(before: SpecArtifact[], after: SpecArtifact[]): ArtifactListDiff {
  const beforeById = new Map(before.map((artifact) => [artifact.id, artifact]));
  const afterById = new Map(after.map((artifact) => [artifact.id, artifact]));
  const added = after.filter((artifact) => !beforeById.has(artifact.id));
  const removed = before.filter((artifact) => !afterById.has(artifact.id));
  const changed = after
    .filter((artifact) => {
      const previous = beforeById.get(artifact.id);
      return previous && JSON.stringify(previous) !== JSON.stringify(artifact);
    })
    .map((artifact) => ({
      before: beforeById.get(artifact.id)!,
      after: artifact,
    }));

  return { added, removed, changed };
}
