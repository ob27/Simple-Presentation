import type { RichTextParagraph, RichTextRun } from '../../../types/shapes';

interface Props {
  paragraphs?: RichTextParagraph[];
  label?: string;
  style: React.CSSProperties;
  textAlign: 'left' | 'center' | 'right' | 'justify';
}

function runStyle(run: RichTextRun): React.CSSProperties {
  const decorations: string[] = [];
  if (run.underline) decorations.push('underline');
  if (run.strikethrough) decorations.push('line-through');
  return {
    fontWeight: run.bold ? 'bold' : undefined,
    fontStyle: run.italic ? 'italic' : undefined,
    textDecoration: decorations.length > 0 ? decorations.join(' ') : undefined,
    color: run.color,
    // A run's text may contain an embedded '\n' (a Shift+Enter soft break,
    // see richText.ts's collectRuns) — plain text nodes collapse newlines,
    // so this renders it as a real line break with no extra DOM needed.
    whiteSpace: run.text.includes('\n') ? 'pre-line' : undefined,
  };
}

function Paragraph({ runs }: { runs: RichTextRun[] }) {
  return (
    <>
      {runs.map((run, i) => (
        <span key={i} style={runStyle(run)}>{run.text}</span>
      ))}
    </>
  );
}

// Mirrors buildEditableDom's stack-based flat-array -> nested-list
// construction (richText.ts) so Tab-indented sub-items render as genuine
// nested <ul>/<ol> here too — each nested <ol> is a real separate list, so
// ordered sub-items restart their own numbering for free.
interface ListItemNode { runs: RichTextRun[]; children: ListTreeNode[] }
interface ListTreeNode { listType: 'bullet' | 'ordered'; items: ListItemNode[] }

function buildListTree(paragraphs: RichTextParagraph[], start: number): { tree: ListTreeNode; next: number } {
  const stack: { node: ListTreeNode; level: number; lastItem: ListItemNode | null }[] = [];
  let root: ListTreeNode | null = null;
  let i = start;
  while (i < paragraphs.length && paragraphs[i].listType) {
    const p = paragraphs[i];
    const level = p.indentLevel ?? 0;
    const listType = p.listType!;
    while (stack.length > 0 && stack[stack.length - 1].level > level) stack.pop();
    let top = stack[stack.length - 1];
    if (!top || top.level < level) {
      const node: ListTreeNode = { listType, items: [] };
      if (!top) root = node;
      else top.lastItem!.children.push(node);
      const frame = { node, level, lastItem: null as ListItemNode | null };
      stack.push(frame);
      top = frame;
    } else if (top.node.listType !== listType) {
      const node: ListTreeNode = { listType, items: [] };
      if (stack.length === 1) root = node;
      else stack[stack.length - 2].lastItem!.children.push(node);
      const frame = { node, level, lastItem: null as ListItemNode | null };
      stack[stack.length - 1] = frame;
      top = frame;
    }
    const item: ListItemNode = { runs: p.runs, children: [] };
    top.node.items.push(item);
    top.lastItem = item;
    i++;
  }
  return { tree: root!, next: i };
}

function ListBlock({ node }: { node: ListTreeNode }) {
  const Tag = node.listType === 'bullet' ? 'ul' : 'ol';
  return (
    <Tag style={{ margin: 0, paddingLeft: '1.4em', textAlign: 'left' }}>
      {node.items.map((item, idx) => (
        <li key={idx}>
          <Paragraph runs={item.runs} />
          {item.children.map((child, ci) => <ListBlock key={ci} node={child} />)}
        </li>
      ))}
    </Tag>
  );
}

// Read-only rendering of a Text shape's body. Falls back to the plain
// `label` span (the only thing every Text shape had before this feature)
// whenever `paragraphs` is absent, so shapes created before rich text was
// added keep rendering exactly as they always have — no migration needed.
export function RichTextDisplay({ paragraphs, label, style, textAlign }: Props) {
  if (!paragraphs || paragraphs.length === 0) {
    return (
      <span style={{ textAlign, wordBreak: 'break-word', userSelect: 'none', ...style }}>{label}</span>
    );
  }

  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < paragraphs.length) {
    const p = paragraphs[i];
    if (p.listType) {
      const { tree, next } = buildListTree(paragraphs, i);
      blocks.push(<ListBlock key={key++} node={tree} />);
      i = next;
    } else {
      blocks.push(<div key={key++}><Paragraph runs={p.runs} /></div>);
      i++;
    }
  }

  return (
    <div style={{ width: '100%', textAlign, wordBreak: 'break-word', userSelect: 'none', ...style }}>
      {blocks}
    </div>
  );
}
