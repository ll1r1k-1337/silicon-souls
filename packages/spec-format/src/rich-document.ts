export type RichDocumentContent = Record<string, unknown>;

interface RichNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  text?: string;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
}

export const richDocumentSchemaVersion = 'tiptap.v1';

export function emptyRichDocument(): RichDocumentContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [],
      },
    ],
  };
}

export function richDocumentFromMarkdown(markdown: string): RichDocumentContent {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const content: RichNode[] = [];
  let paragraph: string[] = [];
  let bulletItems: RichNode[] = [];
  let orderedItems: RichNode[] = [];
  let codeFence: { language?: string; lines: string[] } | undefined;

  const flushParagraph = () => {
    const text = paragraph.join(' ').trim();
    paragraph = [];
    if (text) {
      content.push(paragraphNode(text));
    }
  };

  const flushBulletList = () => {
    if (bulletItems.length > 0) {
      content.push({ type: 'bulletList', content: bulletItems });
      bulletItems = [];
    }
  };

  const flushOrderedList = () => {
    if (orderedItems.length > 0) {
      content.push({ type: 'orderedList', attrs: { start: 1 }, content: orderedItems });
      orderedItems = [];
    }
  };

  const flushLists = () => {
    flushBulletList();
    flushOrderedList();
  };

  for (const line of lines) {
    const fenceMatch = line.match(/^```(\w+)?\s*$/);
    if (fenceMatch) {
      if (codeFence) {
        content.push({
          type: 'codeBlock',
          attrs: { language: codeFence.language ?? null },
          content: codeFence.lines.length ? [{ type: 'text', text: codeFence.lines.join('\n') }] : [],
        });
        codeFence = undefined;
      } else {
        flushParagraph();
        flushLists();
        codeFence = { language: fenceMatch[1], lines: [] };
      }
      continue;
    }

    if (codeFence) {
      codeFence.lines.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushLists();
      content.push({
        type: 'heading',
        attrs: { level: heading[1].length },
        content: textContent(heading[2].trim()),
      });
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      flushOrderedList();
      bulletItems.push(listItemNode(bullet[1].trim()));
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      flushBulletList();
      orderedItems.push(listItemNode(ordered[1].trim()));
      continue;
    }

    const quote = line.match(/^>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      flushLists();
      content.push({
        type: 'blockquote',
        content: [paragraphNode(quote[1].trim())],
      });
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushLists();
      continue;
    }

    paragraph.push(line.trim());
  }

  if (codeFence) {
    content.push({
      type: 'codeBlock',
      attrs: { language: codeFence.language ?? null },
      content: codeFence.lines.length ? [{ type: 'text', text: codeFence.lines.join('\n') }] : [],
    });
  }
  flushParagraph();
  flushLists();

  return {
    type: 'doc',
    content: content.length > 0 ? content : ((emptyRichDocument() as RichNode).content ?? []),
  };
}

export function markdownFromRichDocument(document: RichDocumentContent): string {
  const node = document as RichNode;
  const blocks = (node.content ?? []).map(renderBlock).filter(Boolean);
  return `${blocks.join('\n\n').trim()}\n`;
}

function paragraphNode(text: string): RichNode {
  return { type: 'paragraph', content: textContent(text) };
}

function listItemNode(text: string): RichNode {
  return { type: 'listItem', content: [paragraphNode(text)] };
}

function textContent(text: string): RichNode[] {
  return text ? [{ type: 'text', text }] : [];
}

function renderBlock(node: RichNode): string {
  switch (node.type) {
    case 'heading':
      return `${'#'.repeat(numberAttr(node.attrs?.level, 1, 6, 1))} ${renderInline(node)}`.trim();
    case 'paragraph':
      return renderInline(node);
    case 'bulletList':
      return renderList(node, '-');
    case 'orderedList':
      return renderList(node, '1.');
    case 'taskList':
      return renderTaskList(node);
    case 'listItem':
      return renderChildren(node);
    case 'taskItem':
      return renderChildren(node);
    case 'blockquote':
      return renderChildren(node)
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    case 'codeBlock':
      return ['```', renderText(node), '```'].join('\n');
    case 'horizontalRule':
      return '---';
    case 'table':
      return renderTable(node);
    default:
      return renderChildren(node);
  }
}

function renderList(node: RichNode, marker: '-' | '1.'): string {
  return (node.content ?? [])
    .map((item) =>
      renderBlock(item)
        .split('\n')
        .map((line, index) => `${index === 0 ? marker : '  '} ${line}`.trimEnd())
        .join('\n'),
    )
    .join('\n');
}

function renderTaskList(node: RichNode): string {
  return (node.content ?? [])
    .map((item) => {
      const checked = item.attrs?.checked === true ? 'x' : ' ';
      return `- [${checked}] ${renderBlock(item)}`.trimEnd();
    })
    .join('\n');
}

function renderTable(node: RichNode): string {
  const rows = node.content ?? [];
  const renderedRows = rows.map((row) =>
    (row.content ?? []).map((cell) => renderChildren(cell).replace(/\n+/g, ' ').trim()),
  );
  if (renderedRows.length === 0) return '';

  const columnCount = Math.max(...renderedRows.map((row) => row.length));
  const normalized = renderedRows.map((row) => [
    ...row,
    ...Array.from({ length: columnCount - row.length }, () => ''),
  ]);
  const header = normalized[0];
  const body = normalized.slice(1);
  return [
    `| ${header.join(' | ')} |`,
    `| ${Array.from({ length: columnCount }, () => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function renderChildren(node: RichNode): string {
  return (node.content ?? []).map(renderBlock).filter(Boolean).join('\n');
}

function renderInline(node: RichNode): string {
  return (node.content ?? []).map(renderInlineNode).join('');
}

function renderInlineNode(node: RichNode): string {
  if (node.type === 'text') {
    return applyMarks(node.text ?? '', node.marks ?? []);
  }

  if (node.type === 'hardBreak') {
    return '\n';
  }

  return renderInline(node);
}

function renderText(node: RichNode): string {
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map(renderText).join('');
}

function applyMarks(
  text: string,
  marks: Array<{ type?: string; attrs?: Record<string, unknown> }>,
): string {
  return marks.reduce((value, mark) => {
    if (mark.type === 'comment') return value;
    if (mark.type === 'bold') return `**${value}**`;
    if (mark.type === 'italic') return `_${value}_`;
    if (mark.type === 'code') return `\`${value}\``;
    if (mark.type === 'link' && typeof mark.attrs?.href === 'string') {
      return `[${value}](${mark.attrs.href})`;
    }
    return value;
  }, text);
}

function numberAttr(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
