import { describe, expect, it } from 'vitest';
import { markdownFromRichDocument, richDocumentFromMarkdown } from './rich-document';

describe('rich document markdown projection', () => {
  it('imports headings and lists from markdown', () => {
    const doc = richDocumentFromMarkdown('# Title\n\n- First\n- Second\n');
    expect(doc.type).toBe('doc');
    expect(JSON.stringify(doc)).toContain('heading');
    expect(JSON.stringify(doc)).toContain('bulletList');
  });

  it('excludes comment marks from markdown export', () => {
    const markdown = markdownFromRichDocument({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Annotated',
              marks: [{ type: 'comment', attrs: { threadId: 'dct_1' } }],
            },
          ],
        },
      ],
    });

    expect(markdown.trim()).toBe('Annotated');
    expect(markdown).not.toContain('dct_1');
  });
});
