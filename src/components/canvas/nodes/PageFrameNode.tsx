import { memo, useState } from 'react';
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

  return (
    <div
      onClick={() => onDeselectAll?.()}
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
