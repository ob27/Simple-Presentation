import { ViewportPortal } from '@xyflow/react';
import type { PathAnchor } from '../../types/shapes';
import { anchorToAbsolute, handleToAbsolute, buildPathD, type AbsoluteRect } from '../../utils/pathAnchorGeometry';

const EXTENT = 5000; // flow-space units; long enough to span any realistic document

export type AnchorPart = 'anchor' | 'handleIn' | 'handleOut';

interface Props {
  anchors: PathAnchor[];
  closed: boolean;
  rect: AbsoluteRect;
  vbW: number;
  vbH: number;
  rotationDeg: number;
  onMarkerMouseDown: (index: number, part: AnchorPart, e: React.MouseEvent) => void;
}

// Draggable anchor + bezier-handle markers for a path shape in "edit points"
// mode — drawn directly on top of the real rendered curve (using the same
// buildPathD math as PathNode/PenDrawingOverlay) so handles always sit
// exactly where they visually should, including through resize and rotation.
export function AnchorEditOverlay({ anchors, closed, rect, vbW, vbH, rotationDeg, onMarkerMouseDown }: Props) {
  const off = EXTENT / 2;
  const absAnchors = anchors.map(a => anchorToAbsolute(a, rect, vbW, vbH, rotationDeg));
  const shiftedAbsAnchors = absAnchors.map(p => ({ x: p.x + off, y: p.y + off }));
  const d = buildPathD(shiftedAbsAnchors, closed);

  return (
    <ViewportPortal>
      <svg style={{ position: 'absolute', top: -off, left: -off, width: EXTENT, height: EXTENT, overflow: 'visible' }}>
        {d && <path d={d} fill="none" stroke="#1677ff" strokeWidth={1.5} strokeDasharray="4 3" pointerEvents="none" />}
        {anchors.map((a, i) => {
          const abs = absAnchors[i];
          const hIn = handleToAbsolute(a, 'handleIn', rect, vbW, vbH, rotationDeg);
          const hOut = handleToAbsolute(a, 'handleOut', rect, vbW, vbH, rotationDeg);
          return (
            <g key={i}>
              {hIn && (
                <>
                  <line x1={abs.x + off} y1={abs.y + off} x2={hIn.x + off} y2={hIn.y + off} stroke="#1677ff" strokeWidth={1} strokeDasharray="2 2" pointerEvents="none" />
                  <rect
                    x={hIn.x + off - 5} y={hIn.y + off - 5} width={10} height={10} fill="#1677ff" style={{ cursor: 'grab' }}
                    onMouseDown={e => onMarkerMouseDown(i, 'handleIn', e)}
                  />
                </>
              )}
              {hOut && (
                <>
                  <line x1={abs.x + off} y1={abs.y + off} x2={hOut.x + off} y2={hOut.y + off} stroke="#1677ff" strokeWidth={1} strokeDasharray="2 2" pointerEvents="none" />
                  <rect
                    x={hOut.x + off - 5} y={hOut.y + off - 5} width={10} height={10} fill="#1677ff" style={{ cursor: 'grab' }}
                    onMouseDown={e => onMarkerMouseDown(i, 'handleOut', e)}
                  />
                </>
              )}
              <circle
                cx={abs.x + off} cy={abs.y + off} r={6} fill="#fff" stroke="#1677ff" strokeWidth={2} style={{ cursor: 'grab' }}
                onMouseDown={e => onMarkerMouseDown(i, 'anchor', e)}
              />
            </g>
          );
        })}
      </svg>
    </ViewportPortal>
  );
}
