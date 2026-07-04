import { ViewportPortal } from '@xyflow/react';

const EXTENT = 5000; // flow-space units; long enough to span any realistic document

interface Props {
  drag: { sourceX: number; sourceY: number; current: { x: number; y: number } } | null;
}

// The Arrow tool's live preview — a single dashed line from the source
// shape's center to the cursor, same ViewportPortal technique as
// PenDrawingOverlay.tsx (stays fixed in flow space while the camera pans).
export function ConnectorDrawingOverlay({ drag }: Props) {
  if (!drag) return null;
  const off = EXTENT / 2;

  return (
    <ViewportPortal>
      <svg style={{ position: 'absolute', top: -off, left: -off, width: EXTENT, height: EXTENT, pointerEvents: 'none', overflow: 'visible' }}>
        <line
          x1={drag.sourceX + off} y1={drag.sourceY + off}
          x2={drag.current.x + off} y2={drag.current.y + off}
          stroke="#1677ff" strokeWidth={1.5} strokeDasharray="5 4"
        />
        <circle cx={drag.sourceX + off} cy={drag.sourceY + off} r={4} fill="#1677ff" />
        <circle cx={drag.current.x + off} cy={drag.current.y + off} r={3} fill="#1677ff" />
      </svg>
    </ViewportPortal>
  );
}
