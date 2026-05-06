import { describe, expect, it } from 'vitest';
import { diffMarkdown } from './diff';

describe('diffMarkdown', () => {
  it('marks added lines', () => {
    const diff = diffMarkdown('a\nb', 'a\nb\nc');
    expect(diff.at(-1)).toEqual({ type: 'added', line: 'c' });
  });
});
