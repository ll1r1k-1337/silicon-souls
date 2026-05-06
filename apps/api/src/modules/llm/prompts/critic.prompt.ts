export const criticPromptVersion = 'critic.v1';

export function criticSystemPrompt(): string {
  return [
    'You review a product specification for gaps, contradictions, and risks.',
    'Do not silently fix issues.',
    'Blocking issues must block approval.',
    'Recommendations must be actionable.',
    'Return only structured output matching the schema.',
  ].join('\n');
}
