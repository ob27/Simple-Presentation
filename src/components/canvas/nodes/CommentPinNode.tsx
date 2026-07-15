import { memo, useRef, useState } from 'react';
import { IconComment, IconCheck } from '../../icons';
import { useReactFlow, type NodeProps } from '@xyflow/react';

export interface CommentPinData extends Record<string, unknown> {
  resolved: boolean;
  replyCount: number;
  active: boolean;
  x: number;
  y: number;
  onOpen: (id: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
}

const LONG_PRESS_MS = 450;
const MOVE_CANCEL_THRESHOLD = 5;

// A long-press (not a plain drag) repositions a pin — a short click still
// opens its thread, so the two gestures need active disambiguation rather
// than just flipping on React Flow's normal per-node drag (which starts
// moving the instant the pointer moves, no hold required, and would hijack
// every click-to-open). Orange while open (matches the "needs attention"
// convention used elsewhere for unsaved/pending state), green once
// resolved — both distinct from the app's blue shape-selection accent so
// pins never get mistaken for a selected shape.
function CommentPinNodeImpl({ id, data }: NodeProps) {
  const pin = data as unknown as CommentPinData;
  const { screenToFlowPosition } = useReactFlow();
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  const justDraggedRef = useRef(false);

  function handleMouseDown(e: React.MouseEvent) {
    e.stopPropagation();
    if (!pin.onMove) return;
    const startScreen = { x: e.clientX, y: e.clientY };
    let dragging = false;
    let startFlow = { x: 0, y: 0 };

    const pressTimer = setTimeout(() => {
      dragging = true;
      startFlow = screenToFlowPosition(startScreen);
      setDragOffset({ dx: 0, dy: 0 });
    }, LONG_PRESS_MS);

    function onMouseMove(ev: MouseEvent) {
      if (!dragging) {
        const dist = Math.hypot(ev.clientX - startScreen.x, ev.clientY - startScreen.y);
        if (dist > MOVE_CANCEL_THRESHOLD) clearTimeout(pressTimer);
        return;
      }
      const currentFlow = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      setDragOffset({ dx: currentFlow.x - startFlow.x, dy: currentFlow.y - startFlow.y });
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      clearTimeout(pressTimer);
      if (dragging) {
        justDraggedRef.current = true;
        setDragOffset(current => {
          if (current && pin.onMove) pin.onMove(id, pin.x + current.dx, pin.y + current.dy);
          return null;
        });
        setTimeout(() => { justDraggedRef.current = false; }, 0);
      }
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (justDraggedRef.current) return;
    pin.onOpen(id);
  }

  const color = pin.resolved ? '#2e9e5b' : '#ff8a3d';

  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      style={{
        position: 'relative', width: 26, height: 26, borderRadius: '50%',
        background: color, border: pin.active ? '2px solid #1a1a2e' : '2px solid #fff',
        boxShadow: '0 2px 5px rgba(0,0,0,0.3)', cursor: pin.onMove ? 'grab' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transform: dragOffset ? `translate(${dragOffset.dx}px, ${dragOffset.dy}px)` : undefined,
      }}
    >
      <div style={{ color: '#fff', display: 'flex', alignItems: 'center' }}>
        {pin.resolved ? <IconCheck style={{ fontSize: 13 }} /> : <IconComment style={{ fontSize: 13 }} />}
      </div>
      {pin.replyCount > 0 && (
        <span style={{
          position: 'absolute', top: -6, right: -6,
          background: '#1a1a2e', color: '#fff', borderRadius: 8, fontSize: 9, fontWeight: 700,
          minWidth: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
        }}>
          {pin.replyCount}
        </span>
      )}
    </div>
  );
}

export const CommentPinNode = memo(CommentPinNodeImpl);
