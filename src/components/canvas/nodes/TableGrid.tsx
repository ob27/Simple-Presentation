import { useState } from 'react';
import type { TableRow } from '../../../types/shapes';

interface Props {
  rows: number;
  cols: number;
  cells: TableRow[];
  stroke: string;
  fontSize: number;
  locked: boolean;
  onCommitCells: (cells: TableRow[]) => void;
}

// Rows/columns are always rendered evenly split (100/cols %, 100/rows %) —
// no per-column/row width is stored, so a whole-shape resize redistributes
// every cell proportionally for free. Cell text is plain (no rich
// formatting, no merge) — a deliberately narrower first cut than the
// shape-level rich-text editor, kept as a single-line <input> per cell
// matching the original (pre-rich-text) label-editing convention.
export function TableGrid({ rows, cols, cells, stroke, fontSize, locked, onCommitCells }: Props) {
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [draft, setDraft] = useState('');

  function cellText(r: number, c: number): string {
    return cells[r]?.cells[c] ?? '';
  }

  function commit() {
    if (!editingCell) return;
    const { row, col } = editingCell;
    setEditingCell(null);
    if (draft === cellText(row, col)) return;
    const next = cells.map(r => ({ cells: [...r.cells] }));
    while (next.length <= row) next.push({ cells: Array.from({ length: cols }, () => '') });
    while (next[row].cells.length <= col) next[row].cells.push('');
    next[row].cells[col] = draft;
    onCommitCells(next);
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => (
          <div
            key={`${r}-${c}`}
            className="nodrag nopan"
            onDoubleClick={() => { if (locked) return; setDraft(cellText(r, c)); setEditingCell({ row: r, col: c }); }}
            style={{
              position: 'absolute',
              left: `${(c / cols) * 100}%`, top: `${(r / rows) * 100}%`,
              width: `${(1 / cols) * 100}%`, height: `${(1 / rows) * 100}%`,
              border: `1px solid ${stroke}`, boxSizing: 'border-box',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '2px 4px', overflow: 'hidden',
              cursor: locked ? 'default' : 'text',
            }}
          >
            {editingCell?.row === r && editingCell?.col === c ? (
              <input
                autoFocus
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={e => {
                  if (e.key === 'Enter') commit();
                  if (e.key === 'Escape') setEditingCell(null);
                  e.stopPropagation();
                }}
                style={{ width: '100%', textAlign: 'center', border: 'none', outline: 'none', background: 'transparent', fontSize, fontFamily: 'inherit' }}
              />
            ) : (
              <span style={{ fontSize, wordBreak: 'break-word', userSelect: 'none', textAlign: 'center' }}>
                {cellText(r, c)}
              </span>
            )}
          </div>
        )),
      )}
    </div>
  );
}
