import { Button } from 'antd';
import { IconClose, IconWarning } from '../icons';
import { PeekableDrawer } from './PeekableDrawer';

export interface ValidationIssue {
  id: string;
  shapeId: string;
  label: string;
  message: string;
}

interface Props {
  issues: ValidationIssue[];
  onSelectIssue: (shapeId: string) => void;
  onClose: () => void;
}

// Computed on demand (only while this panel is open — see Canvas.tsx's
// validationIssues useMemo, gated on validationPanelOpen), not a live/
// reactive validator running on every edit. There's no existing "computed
// diagnostics" layer to build on (Layers/Animation/Data panels all render
// live document state directly), and re-scanning on every drag/edge redraw
// would be premature for an occasional "check my diagram" action.
export function ValidationPanel({ issues, onSelectIssue, onClose }: Props) {
  return (
    <PeekableDrawer>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#1a1a2e' }}>
          Check Diagram {issues.length > 0 && `(${issues.length})`}
        </span>
        <Button size="small" type="text" icon={<IconClose />} onClick={onClose} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
        {issues.length === 0 ? (
          <div style={{ fontSize: 12, color: '#999', textAlign: 'center', paddingTop: 20 }}>
            No issues found.
          </div>
        ) : (
          issues.map(issue => (
            <div
              key={issue.id}
              onClick={() => onSelectIssue(issue.shapeId)}
              style={{
                display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 6px', borderRadius: 6,
                cursor: 'pointer', marginBottom: 4,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <IconWarning style={{ color: '#faad14', fontSize: 14, marginTop: 1, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {issue.label}
                </div>
                <div style={{ fontSize: 11, color: '#888' }}>{issue.message}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </PeekableDrawer>
  );
}
