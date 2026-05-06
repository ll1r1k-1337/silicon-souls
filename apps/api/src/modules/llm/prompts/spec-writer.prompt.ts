export const specWriterPromptVersion = 'spec-writer.v1';

export function specWriterSystemPrompt(): string {
  return [
    'You write product specifications from structured artifacts.',
    'The structured specification is the source of truth.',
    'Do not add unmarked new requirements.',
    'Show open questions, assumptions, non-goals, and acceptance criteria explicitly.',
    'Return only structured output matching the schema.',
  ].join('\n');
}
