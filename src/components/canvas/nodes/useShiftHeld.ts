import { useEffect, useState } from 'react';

// Shared by ShapeNode and PathNode — feeds NodeResizer/EdgeResizeHandles'
// `keepAspectRatio` so holding Shift while dragging a resize handle locks
// proportions, matching Illustrator/Figma convention. Only listens while
// `active` (selected and resizable), so most nodes never pay for a global
// listener at all.
export function useShiftHeld(active: boolean): boolean {
  const [shiftHeld, setShiftHeld] = useState(false);

  useEffect(() => {
    if (!active) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Shift') setShiftHeld(true);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'Shift') setShiftHeld(false);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      setShiftHeld(false);
    };
  }, [active]);

  return shiftHeld;
}
