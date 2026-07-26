import { useEffect, useRef, useState } from 'react';

// Mirrors useShiftHeld.ts exactly, tracking Alt/Option instead of Shift — used
// to snapshot Alt-held-at-resize-start for center-anchored resize, the same
// "decided once at drag-start, not re-evaluated live" philosophy as
// resizeShiftLock (see that file's own comment for why: a live-bound value
// racing an in-progress drag's pointermove handlers causes a visible jump).
export function useAltHeld(active: boolean): { altHeld: boolean; altHeldRef: React.MutableRefObject<boolean> } {
  const [altHeld, setAltHeld] = useState(false);
  const altHeldRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Alt') { altHeldRef.current = true; setAltHeld(true); }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'Alt') { altHeldRef.current = false; setAltHeld(false); }
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      altHeldRef.current = false;
      setAltHeld(false);
    };
  }, [active]);

  return { altHeld, altHeldRef };
}
