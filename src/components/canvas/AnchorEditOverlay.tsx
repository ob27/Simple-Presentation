import { ViewportPortal } from '@xyflow/react';
import type { PathAnchor } from '../../types/shapes';
import { anchorToAbsolute, handleToAbsolute, buildPathD, absoluteToAnchorLocal, findNearestPointOnPath, type AbsoluteRect } from '../../utils/pathAnchorGeometry';

const EXTENT = 5000; // flow-space units; long enough to span any realistic document

export type AnchorPart = 'anchor' | 'handleIn' | 'handleOut';

interface Props {
  anchors: PathAnchor[];
  closed: boolean;
  rect: AbsoluteRect;
  vbW: number;
  vbH: number;
  rotationDeg: number;
  activeAnchorIndex: number | null;
  interactive: boolean;
  onMarkerMouseDown: (index: number, part: AnchorPart, e: React.MouseEvent) => void;
  onMarkerDoubleClick: (index: number, e: React.MouseEvent) => void;
  onSegmentMouseDown: (segmentIndex: number, t: number, e: React.MouseEvent) => void;
}

// Draggable anchor + bezier-handle markers for a path shape — drawn directly
// on top of the real rendered curve (using the same buildPathD math as
// PathNode/PenDrawingOverlay) so handles always sit exactly where they
// visually should, including through resize and rotation. Passively visible
// whenever a single path is selected; only interactive (draggable/
// insertable/deletable) while Direct Selection mode is on, per `interactive`.
export function AnchorEditOverlay({
  anchors, closed, rect, vbW, vbH, rotationDeg, activeAnchorIndex, interactive,
  onMarkerMouseDown, onMarkerDoubleClick, onSegmentMouseDown,
}: Props) {
  const off = EXTENT / 2;
  const absAnchors = anchors.map(a => anchorToAbsolute(a, rect, vbW, vbH, rotationDeg));
  const shiftedAbsAnchors = absAnchors.map(p => ({ x: p.x + off, y: p.y + off }));
  const d = buildPathD(shiftedAbsAnchors, closed);

  function handleSegmentMouseDown(e: React.MouseEvent<SVGPathElement>) {
    if (!interactive) return;
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const svgRect = svg.getBoundingClientRect();
    const absPoint = { x: e.clientX - svgRect.left - off, y: e.clientY - svgRect.top - off };
    const localPoint = absoluteToAnchorLocal(absPoint, rect, vbW, vbH, rotationDeg);
    const hit = findNearestPointOnPath(anchors, closed, localPoint);
    if (hit) onSegmentMouseDown(hit.segmentIndex, hit.t, e);
  }

  return (
    <ViewportPortal>
      <svg style={{ position: 'absolute', top: -off, left: -off, width: EXTENT, height: EXTENT, overflow: 'visible', zIndex: 10000, pointerEvents: 'none' }}>
        {d && <path d={d} fill="none" stroke="#1677ff" strokeWidth={1.5} strokeDasharray="4 3" pointerEvents="none" />}
        {/* Wide invisible hit-stroke for segment-click insertion — only live in Direct Selection mode.
            React Flow sets `pointer-events: none` on `.react-flow__viewport` (the ViewportPortal's
            ancestor), so every interactive marker below must explicitly opt back in with pointerEvents:'auto'. */}
        {d && interactive && (
          <path d={d} fill="none" stroke="transparent" strokeWidth={12} style={{ cursor: 'copy', pointerEvents: 'auto' }} onMouseDown={handleSegmentMouseDown} />
        )}
        {anchors.map((a, i) => {
          const abs = absAnchors[i];
          const hIn = handleToAbsolute(a, 'handleIn', rect, vbW, vbH, rotationDeg);
          const hOut = handleToAbsolute(a, 'handleOut', rect, vbW, vbH, rotationDeg);
          const isActive = interactive && activeAnchorIndex === i;
          // A "corner" anchor (no bezier handles at all) reads as a square —
          // matching the convention that a smooth curve point is round and a
          // sharp corner is angular. The active anchor overrides this with a
          // red-outlined circle regardless of corner/smooth, since "this is
          // the one you're editing" takes visual priority over its geometry.
          const isCorner = !a.handleIn && !a.handleOut;
          const markerCursor = { cursor: interactive ? 'grab' : 'default', pointerEvents: interactive ? 'auto' as const : 'none' as const };
          return (
            <g key={i}>
              {hIn && (
                <>
                  <line x1={abs.x + off} y1={abs.y + off} x2={hIn.x + off} y2={hIn.y + off} stroke="#1677ff" strokeWidth={1} strokeDasharray="2 2" pointerEvents="none" />
                  <circle
                    cx={hIn.x + off} cy={hIn.y + off} r={4.5} fill="#8FB8FF" stroke="#5B8FE8" strokeWidth={1}
                    style={markerCursor}
                    onMouseDown={e => onMarkerMouseDown(i, 'handleIn', e)}
                  />
                </>
              )}
              {hOut && (
                <>
                  <line x1={abs.x + off} y1={abs.y + off} x2={hOut.x + off} y2={hOut.y + off} stroke="#1677ff" strokeWidth={1} strokeDasharray="2 2" pointerEvents="none" />
                  <circle
                    cx={hOut.x + off} cy={hOut.y + off} r={4.5} fill="#8FB8FF" stroke="#5B8FE8" strokeWidth={1}
                    style={markerCursor}
                    onMouseDown={e => onMarkerMouseDown(i, 'handleOut', e)}
                  />
                </>
              )}
              {isActive ? (
                <circle
                  cx={abs.x + off} cy={abs.y + off} r={7}
                  fill="#fff" stroke="#e14b4b" strokeWidth={2.5}
                  style={markerCursor}
                  onMouseDown={e => onMarkerMouseDown(i, 'anchor', e)}
                  onDoubleClick={e => onMarkerDoubleClick(i, e)}
                />
              ) : isCorner ? (
                <rect
                  x={abs.x + off - 5} y={abs.y + off - 5} width={10} height={10}
                  fill="#fff" stroke="#1677ff" strokeWidth={2}
                  style={markerCursor}
                  onMouseDown={e => onMarkerMouseDown(i, 'anchor', e)}
                  onDoubleClick={e => onMarkerDoubleClick(i, e)}
                />
              ) : (
                <circle
                  cx={abs.x + off} cy={abs.y + off} r={6}
                  fill="#fff" stroke="#1677ff" strokeWidth={2}
                  style={markerCursor}
                  onMouseDown={e => onMarkerMouseDown(i, 'anchor', e)}
                  onDoubleClick={e => onMarkerDoubleClick(i, e)}
                />
              )}
            </g>
          );
        })}
      </svg>
    </ViewportPortal>
  );
}
