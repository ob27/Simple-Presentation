import { useEffect, useRef, useState } from 'react';

// Shared by ShapeNode and PathNode — feeds NodeResizer/EdgeResizeHandles'
// `keepAspectRatio` so holding Shift while dragging a resize handle locks
// proportions, matching Illustrator/Figma convention. Only listens while
// `active` (selected and resizable), so most nodes never pay for a global
// listener at all.
//
// Returns both the LIVE value (for UI feedback, e.g. a cursor/hint) and a
// ref tracking the same value without triggering a re-render — resize
// controls should snapshot the ref's `.current` at the moment a drag starts
// (via onResizeStart) rather than binding the live boolean directly, since a
// keydown/keyup re-render racing with an in-progress drag's own pointermove
// handlers was flipping `keepAspectRatio` mid-gesture, making long/high-
// aspect-ratio shapes visibly "jump" as the constraint toggled on/off partway
// through a single resize.
export function useShiftHeld(active: boolean): { shiftHeld: boolean; shiftHeldRef: React.MutableRefObject<boolean> } {
  const [shiftHeld, setShiftHeld] = useState(false);
  const shiftHeldRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Shift') { shiftHeldRef.current = true; setShiftHeld(true); }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'Shift') { shiftHeldRef.current = false; setShiftHeld(false); }
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      shiftHeldRef.current = false;
      setShiftHeld(false);
    };
  }, [active]);

  return { shiftHeld, shiftHeldRef };
}
