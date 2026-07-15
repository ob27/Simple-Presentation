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
      const items: React.ReactNode[] = [];
      while (i < paragraphs.length && paragraphs[i].listType === p.listType) {
        items.push(<li key={key++}><Paragraph runs={paragraphs[i].runs} /></li>);
        i++;
      }
      const ListTag = p.listType === 'bullet' ? 'ul' : 'ol';
      blocks.push(<ListTag key={key++} style={{ margin: 0, paddingLeft: '1.4em', textAlign: 'left' }}>{items}</ListTag>);
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
