import { NodeResizeControl, ResizeControlVariant, type OnResizeEnd, type OnResizeStart } from '@xyflow/react';

const EDGE_POSITIONS = ['top', 'right', 'bottom', 'left'] as const;

// NodeResizer alone only renders visible Handle-variant squares at the 4
// corners — the 4 edges get a Line-variant control instead (a thin
// draggable strip, which is what actually draws the blue selection outline
// and already supports single-axis resize by dragging anywhere along an
// edge). That's easy to miss as a resize affordance since nothing marks
// the edges as grabbable. This adds an explicit, visible Handle-variant
// dot at each edge's midpoint, on top of the existing Line — same visual
// style as the corner handles, so all 8 standard resize points are
// obviously there.
//
// These are independent NodeResizeControl instances, not just a visual
// overlay on top of NodeResizer's own (invisible) line controls — dragging
// one of these dots runs its own resize entirely, so a caller that needs to
// know when a resize finishes (e.g. GroupNode, to rescale its children) must
// pass `onResizeEnd` here too, not only to the sibling `<NodeResizer>`.
//
// zIndex is required, not cosmetic: these controls are siblings rendered
// before the shape's own content div, so with no z-index they'd lose the
// default DOM-order stacking to that content div, which fully covers the
// same edge-midpoint pixel — silently swallowing the drag. (Corner handles
// happened to escape this by sitting exactly on a rounded corner, outside
// the content div's hit-testable area — an accident of corner-radius, not
// a real fix, so it's addressed the same way here.)
export function EdgeResizeHandles({
  minWidth, minHeight, keepAspectRatio, onResizeStart, onResizeEnd,
}: {
  minWidth: number;
  minHeight: number;
  keepAspectRatio?: boolean;
  onResizeStart?: OnResizeStart;
  onResizeEnd?: OnResizeEnd;
}) {
  return (
    <>
      {EDGE_POSITIONS.map(position => (
        <NodeResizeControl
          key={position}
          position={position}
          variant={ResizeControlVariant.Handle}
          minWidth={minWidth}
          minHeight={minHeight}
          keepAspectRatio={keepAspectRatio}
          onResizeStart={onResizeStart}
          onResizeEnd={onResizeEnd}
          // Explicit auto: MultiSelectOverlayNode wraps its content in a
          // pointer-events:none div (so clicks elsewhere in the combined
          // bbox pass through to the shape underneath) — these handles are
          // the one thing inside it that must stay interactive regardless
          // of what ancestor sets, and every other caller already inherits
          // 'auto' anyway, so this is a no-op for them.
          style={{ width: 8, height: 8, borderRadius: 2, zIndex: 10, pointerEvents: 'auto' }}
        />
      ))}
    </>
  );
}
