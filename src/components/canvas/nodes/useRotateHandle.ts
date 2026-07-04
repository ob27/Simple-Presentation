import { useCallback, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';

// Shared by ShapeNode and PathNode — a path behaves exactly like any other
// shape for rotate/resize/move (no per-anchor re-editing in v1), so both
// node types pull this from one place rather than duplicating the drag math.
export function useRotateHandle(
  id: string,
  rotation: number,
  onCommit?: (id: string, patch: { rotation: number }) => void,
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
      finalDeg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI + 90);
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
  }, [id, getNode, updateNodeData, rotation, onCommit]);
}
