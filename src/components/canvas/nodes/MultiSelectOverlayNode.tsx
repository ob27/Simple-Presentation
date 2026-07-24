import { memo, useCallback, useState } from 'react';
import { NodeResizer, type NodeProps, type OnResizeEnd, type OnResizeStart } from '@xyflow/react';
import { EdgeResizeHandles } from './EdgeResizeHandles';
import { useShiftHeld } from './useShiftHeld';

export interface MultiSelectOverlayNodeData extends Record<string, unknown> {
  onResizeStart?: OnResizeStart;
  onResizeEnd?: OnResizeEnd;
}

// A synthetic, ephemeral node (never persisted — Canvas.tsx only injects it
// into the rendered node array while 2+ independent, unlocked, top-level
// shapes are selected) giving multi-selection its own combined bounding-box
// resize handles. Previously each shape in a multi-selection only ever
// exposed its OWN resize handles — dragging any one of them resized just
// that shape, not "the selection" as a whole, the way a real group's frame
// already does via GroupNode. This reuses that exact same resizer setup,
// just anchored to an ad-hoc selection's combined bbox instead of a real
// group's own node.
function MultiSelectOverlayNodeImpl({ data }: NodeProps) {
  const { onResizeStart, onResizeEnd } = data as unknown as MultiSelectOverlayNodeData;
  const { shiftHeldRef } = useShiftHeld(true);
  const [resizeShiftLock, setResizeShiftLock] = useState(false);
  const handleResizeStart = useCallback<OnResizeStart>((e, params) => {
    setResizeShiftLock(shiftHeldRef.current);
    onResizeStart?.(e, params);
  }, [shiftHeldRef, onResizeStart]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', pointerEvents: 'none' }}>
      <NodeResizer
        isVisible minWidth={8} minHeight={8} keepAspectRatio={resizeShiftLock}
        // pointerEvents: 'auto' on both is required, not cosmetic — the
        // wrapper div above is pointer-events:none (so non-handle clicks in
        // the combined bbox reach the shape underneath), which these
        // controls would otherwise inherit and become entirely inert to.
        lineStyle={{ borderColor: '#ff7a1a', borderStyle: 'dashed', zIndex: 30, pointerEvents: 'auto' }}
        handleStyle={{ width: 9, height: 9, borderRadius: 2, zIndex: 30, background: '#ff7a1a', pointerEvents: 'auto' }}
        onResizeStart={handleResizeStart}
        onResizeEnd={onResizeEnd}
      />
      <EdgeResizeHandles
        minWidth={8} minHeight={8} keepAspectRatio={resizeShiftLock}
        onResizeStart={handleResizeStart} onResizeEnd={onResizeEnd}
      />
    </div>
  );
}

export const MultiSelectOverlayNode = memo(MultiSelectOverlayNodeImpl);
