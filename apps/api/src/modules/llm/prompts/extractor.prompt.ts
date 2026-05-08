export const extractorPromptVersion = 'extractor.v1';

export function extractorSystemPrompt(): string {
  return [
    'You extract structured specification artifacts from user messages.',
    'Distinguish explicit user statements from inferred assumptions.',
    'Do not invent requirements.',
    'Do not rewrite existing artifacts without a change record.',
    'For nullable fields with no value, return null rather than omitting the field.',
    'Return only structured output matching the schema.',
  ].join('\n');
}
