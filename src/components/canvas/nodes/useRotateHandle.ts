import { useCallback, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';

// Shared by ShapeNode and PathNode — a path behaves exactly like any other
// shape for rotate/resize/move (no per-anchor re-editing in v1), so both
// node types pull this from one place rather than duplicating the drag math.
//
// `shiftHeldRef`/`constrainEnabled` add Illustrator-style rotate-constrain:
// checked LIVE on every move event (not snapshotted at drag-start, unlike
// resize's own `resizeShiftLock`) — rotation should be toggleable mid-drag by
// holding/releasing Shift, and a rotation angle jumping between 1°/15°
// granularity is a much smaller, expected visual snap than resize's
// aspect-lock (which reshapes a long/thin shape entirely), so live-binding
// here is intentional and doesn't share resize's "jump" problem.
export function useRotateHandle(
  id: string,
  rotation: number,
  onCommit?: (id: string, patch: { rotation: number }) => void,
  shiftHeldRef?: React.MutableRefObject<boolean>,
  constrainEnabled?: boolean,
) {
  const { updateNodeData, getNode } = useReactFlow();
  const rotatingRef = useRef(false);

  return useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    rotatingRef.current = true;
    const node = getNode(id);
    if (!node) return;
    const wrapper = (e.currentTarget as HTMLElement).closest('.react-flow__node') as HTMLElement | null;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let finalDeg = rotation;

    function onMove(ev: MouseEvent) {
      if (!rotatingRef.current) return;
      const dx = ev.clientX - centerX;
      const dy = ev.clientY - centerY;
      const rawDeg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      const step = (constrainEnabled && shiftHeldRef?.current) ? 15 : 1;
      finalDeg = Math.round(rawDeg / step) * step;
      updateNodeData(id, { rotation: finalDeg });
    }
    function onUp() {
      rotatingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      onCommit?.(id, { rotation: finalDeg });
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [id, getNode, updateNodeData, rotation, onCommit, shiftHeldRef, constrainEnabled]);
}
