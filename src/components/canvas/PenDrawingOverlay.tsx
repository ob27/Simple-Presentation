import { ViewportPortal } from '@xyflow/react';
import type { PathAnchor } from '../../types/shapes';
import { buildPathD } from '../../utils/pathAnchorGeometry';

const EXTENT = 5000; // flow-space units; long enough to span any realistic document

interface Props {
  anchors: PathAnchor[];
  dragPreview: { start: { x: number; y: number }; current: { x: number; y: number } } | null;
}

// The Arrow tool's live preview — reuses the exact same buildPathD math the
// final PathNode render uses, so a dragged (curved) point shows its real
// bezier shape while drawing instead of a straight-line guess. Only the
// in-progress drag segment (not yet a placed anchor) stays a plain preview
// line, since it has no handle data yet.
export function PenDrawingOverlay({ anchors, dragPreview }: Props) {
  if (anchors.length === 0 && !dragPreview) return null;
  const off = EXTENT / 2;

  // Shift only the anchors' own x/y into the EXTENT-centered viewport before
  // building the path — handle offsets are relative to their anchor (not
  // absolute), so they must stay untouched; buildPathD's own math
  // (anchor + handleOffset) then naturally lands in the shifted space too.
  const shiftedAnchors = anchors.map(a => ({ ...a, x: a.x + off, y: a.y + off }));
  let shiftedD = buildPathD(shiftedAnchors, false);
  if (dragPreview && anchors.length > 0) {
    shiftedD += ` L ${dragPreview.start.x + off} ${dragPreview.start.y + off}`;
  }

  return (
    <ViewportPortal>
      <svg style={{ position: 'absolute', top: -off, left: -off, width: EXTENT, height: EXTENT, pointerEvents: 'none', overflow: 'visible' }}>
        {shiftedD && <path d={shiftedD} fill="none" stroke="#ff5fc4" strokeWidth={1.5} strokeDasharray="4 3" />}
        {anchors.map((a, i) => (
          <g key={i}>
            <circle cx={a.x + off} cy={a.y + off} r={4} fill="#fff" stroke="#ff5fc4" strokeWidth={1.5} />
            {a.handleIn && (
              <>
                <line x1={a.x + off} y1={a.y + off} x2={a.x + a.handleIn.x + off} y2={a.y + a.handleIn.y + off} stroke="#ff5fc4" strokeWidth={1} strokeDasharray="2 2" />
                <rect x={a.x + a.handleIn.x + off - 2.5} y={a.y + a.handleIn.y + off - 2.5} width={5} height={5} fill="#ff5fc4" />
              </>
            )}
            {a.handleOut && (
              <>
                <line x1={a.x + off} y1={a.y + off} x2={a.x + a.handleOut.x + off} y2={a.y + a.handleOut.y + off} stroke="#ff5fc4" strokeWidth={1} strokeDasharray="2 2" />
                <rect x={a.x + a.handleOut.x + off - 2.5} y={a.y + a.handleOut.y + off - 2.5} width={5} height={5} fill="#ff5fc4" />
              </>
            )}
          </g>
        ))}
        {dragPreview && (
          <>
            <line
              x1={dragPreview.start.x + off} y1={dragPreview.start.y + off}
              x2={dragPreview.current.x + off} y2={dragPreview.current.y + off}
              stroke="#ff5fc4" strokeWidth={1}
            />
            <line
              x1={2 * dragPreview.start.x - dragPreview.current.x + off} y1={2 * dragPreview.start.y - dragPreview.current.y + off}
              x2={dragPreview.current.x + off} y2={dragPreview.current.y + off}
              stroke="#ff5fc4" strokeWidth={1} strokeDasharray="2 2" opacity={0.6}
            />
            <circle cx={dragPreview.current.x + off} cy={dragPreview.current.y + off} r={3} fill="#ff5fc4" />
          </>
        )}
      </svg>
    </ViewportPortal>
  );
}
