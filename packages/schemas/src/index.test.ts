import { describe, expect, it } from 'vitest';
import { ArtifactSourceSchema } from './index';

describe('ArtifactSourceSchema', () => {
  it('rejects out-of-range confidence', () => {
    expect(() =>
      ArtifactSourceSchema.parse({
        type: 'llm_inferred',
        confidence: 2,
        requiresUserConfirmation: true,
      }),
    ).toThrow();
  });
});
