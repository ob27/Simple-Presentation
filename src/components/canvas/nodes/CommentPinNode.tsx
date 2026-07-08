import { memo } from 'react';
import { MessageOutlined, CheckOutlined } from '@ant-design/icons';
import type { NodeProps } from '@xyflow/react';

export interface CommentPinData extends Record<string, unknown> {
  resolved: boolean;
  replyCount: number;
  active: boolean;
  onOpen: (id: string) => void;
}

// A fixed-position marker for a comment thread — deliberately not draggable
// (repositioning a pin isn't supported; delete and re-add if it's in the
// wrong spot) so it needs no special-cased persistence path alongside the
// shape onNodesChange machinery. Orange while open (matches the "needs
// attention" convention used elsewhere for unsaved/pending state), green
// once resolved — both distinct from the app's blue shape-selection accent
// so pins never get mistaken for a selected shape.
function CommentPinNodeImpl({ id, data }: NodeProps) {
  const pin = data as unknown as CommentPinData;
  const color = pin.resolved ? '#2e9e5b' : '#ff8a3d';
  return (
    <div
      onMouseDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); pin.onOpen(id); }}
      style={{
        position: 'relative', width: 26, height: 26, borderRadius: '50%',
        background: color, border: pin.active ? '2px solid #1a1a2e' : '2px solid #fff',
        boxShadow: '0 2px 5px rgba(0,0,0,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{ color: '#fff', display: 'flex', alignItems: 'center' }}>
        {pin.resolved ? <CheckOutlined style={{ fontSize: 13 }} /> : <MessageOutlined style={{ fontSize: 13 }} />}
      </div>
      {pin.replyCount > 0 && (
        <span style={{
          position: 'absolute', top: -6, right: -6,
          background: '#1a1a2e', color: '#fff', borderRadius: 8, fontSize: 9, fontWeight: 700,
          minWidth: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
        }}>
          {pin.replyCount}
        </span>
      )}
    </div>
  );
}

export const CommentPinNode = memo(CommentPinNodeImpl);
