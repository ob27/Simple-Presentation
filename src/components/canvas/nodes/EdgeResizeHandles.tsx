import { NodeResizeControl, ResizeControlVariant } from '@xyflow/react';

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
export function EdgeResizeHandles({ minWidth, minHeight }: { minWidth: number; minHeight: number }) {
  return (
    <>
      {EDGE_POSITIONS.map(position => (
        <NodeResizeControl
          key={position}
          position={position}
          variant={ResizeControlVariant.Handle}
          minWidth={minWidth}
          minHeight={minHeight}
          style={{ width: 8, height: 8, borderRadius: 2 }}
        />
      ))}
    </>
  );
}
