import * as Y from 'yjs';

export function createYDocFromMarkdown(markdown: string): Y.Doc {
  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment('default');
  const blocks = markdownToBlocks(markdown);

  fragment.push(
    blocks.map((block) => {
      const element =
        block.type === 'heading'
          ? new Y.XmlElement('heading')
          : new Y.XmlElement('paragraph');

      if (block.type === 'heading') {
        element.setAttribute('level', String(block.level));
      }

      const text = new Y.XmlText();
      text.insert(0, block.text);
      element.push([text]);
      return element;
    }),
  );

  return ydoc;
}

export function yDocToMarkdown(ydoc: Y.Doc): string {
  const yText = ydoc.getText('default').toString();
  if (yText.trim().length > 0) return yText;

  const fragment = ydoc.getXmlFragment('default');
  return fragment
    .toArray()
    .map((node: Y.XmlElement | Y.XmlText | Y.XmlHook) =>
      nodeToMarkdown(node),
    )
    .filter((block: string) => block.length > 0)
    .join('\n\n');
}

function markdownToBlocks(
  markdown: string,
): Array<{ type: 'heading'; level: number; text: string } | { type: 'paragraph'; text: string }> {
  const normalized = markdown.trim();
  if (!normalized) return [{ type: 'paragraph', text: '' }];

  return normalized
    .split(/\n{2,}/)
    .flatMap((block) => block.split('\n'))
    .map((line) => {
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        return {
          type: 'heading' as const,
          level: heading[1].length,
          text: heading[2],
        };
      }

      return {
        type: 'paragraph' as const,
        text: line,
      };
    });
}

function nodeToMarkdown(node: Y.XmlElement | Y.XmlText | Y.XmlHook): string {
  if (node instanceof Y.XmlText) {
    return node.toString();
  }

  if (node instanceof Y.XmlElement) {
    const text = node
      .toArray()
      .map((child: Y.XmlElement | Y.XmlText | Y.XmlHook) =>
        nodeToMarkdown(child),
      )
      .join('');

    if (node.nodeName === 'heading') {
      const level = Number(node.getAttribute('level') ?? 1);
      return `${'#'.repeat(Math.min(Math.max(level, 1), 6))} ${text}`.trim();
    }

    return text.trim();
  }

  return '';
}
