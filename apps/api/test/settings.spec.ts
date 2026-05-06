import { describe, expect, it } from 'vitest';
import { maskApiKey } from '../src/modules/settings/settings.service';

describe('LLM settings helpers', () => {
  it('masks long API keys without exposing the full value', () => {
    expect(maskApiKey('sk-1234567890abcdef')).toBe('sk-1****cdef');
  });

  it('masks short API keys', () => {
    expect(maskApiKey('abcdef')).toBe('ab****ef');
  });

  it('returns undefined for missing keys', () => {
    expect(maskApiKey()).toBeUndefined();
  });
});
