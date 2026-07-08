import { memo, useState, useRef } from 'react';
import type { NodeProps } from '@xyflow/react';

export interface PageFrameNodeData extends Record<string, unknown> {
  pageName: string;
  pageId?: string;
  width: number;
  height: number;
  onRename?: (pageId: string, name: string) => void;
  onDeselectAll?: () => void;
}

function PageFrameNodeImpl({ data }: NodeProps) {
  const { pageName, pageId, width, height, onRename, onDeselectAll } = data as unknown as PageFrameNodeData;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(pageName);

  function commit() {
    setEditing(false);
    if (draft.trim() && draft !== pageName && pageId) onRename?.(pageId, draft.trim());
  }

  // A plain onClick fires on mouseup as long as down and up both land on
  // this div — true even after a drag-select marquee that started on the
  // page background, since nothing here ever moves out from under the
  // cursor. That was silently clearing the marquee's selection immediately
  // after RF applied it. Tracking real movement (same threshold convention
  // used for anchor click-vs-drag elsewhere) makes this only fire on an
  // actual click.
  const downPosRef = useRef({ x: 0, y: 0 });
  function handleMouseDown(e: React.MouseEvent) {
    downPosRef.current = { x: e.clientX, y: e.clientY };
  }
  function handleClick(e: React.MouseEvent) {
    const dist = Math.hypot(e.clientX - downPosRef.current.x, e.clientY - downPosRef.current.y);
    if (dist < 3) onDeselectAll?.();
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      style={{
        width, height,
        background: '#fff',
        boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
        border: '1px solid rgba(0,0,0,0.06)',
        position: 'relative',
      }}
    >
      {editing ? (
        <input
          autoFocus
          // React Flow only assigns its own "nopan" class to draggable nodes
          // (see noPanClassName usage in RF's Node component) — this node is
          // intentionally draggable={false}, so without opting back in here,
          // RF's zoomOnDoubleClick swallows the double-click before it ever
          // reaches this label, and a plain click/drag would pan the canvas
          // out from under the input while typing.
          className="nopan nodrag"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(pageName); setEditing(false); }
          }}
          style={{
            position: 'absolute', top: -26, left: 0, fontSize: 12, fontWeight: 600, color: '#8a8fa3',
            border: '1px solid #1677ff', borderRadius: 3, outline: 'none', padding: '1px 4px', background: '#fff',
          }}
        />
      ) : (
        <div
          className="nopan nodrag"
          onDoubleClick={() => { setDraft(pageName); setEditing(true); }}
          style={{
            position: 'absolute', top: -26, left: 0,
            fontSize: 12, fontWeight: 600, color: '#8a8fa3', cursor: 'text',
          }}
        >
          {pageName}
        </div>
      )}
    </div>
  );
}

export const PageFrameNode = memo(PageFrameNodeImpl);
