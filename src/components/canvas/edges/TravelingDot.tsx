import { useEffect, useRef, useState } from 'react';

interface Props {
  path: string;
  speed?: number; // seconds per full traversal
  color?: string;
}

// Samples points along the real rendered path via the native
// SVGGeometryElement.getPointAtLength API (not SMIL animateMotion — that API
// has an uncertain long-term browser roadmap; getPointAtLength is a plain,
// well-supported geometry query) so the dot always follows the actual route,
// including corners, regardless of routing style (orthogonal/curved/straight).
export function TravelingDot({ path, speed = 2, color = '#1677ff' }: Props) {
  const hiddenPathRef = useRef<SVGPathElement>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const pathEl = hiddenPathRef.current;
    if (!pathEl) return;
    const totalLength = pathEl.getTotalLength();
    if (totalLength === 0) return;
    let start: number | null = null;

    function tick(timestamp: number) {
      if (start === null) start = timestamp;
      const elapsed = (timestamp - start) / 1000;
      const t = (elapsed % speed) / speed;
      const p = pathEl!.getPointAtLength(t * totalLength);
      setPoint({ x: p.x, y: p.y });
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [path, speed]);

  return (
    <>
      <path ref={hiddenPathRef} d={path} fill="none" stroke="none" />
      {point && <circle cx={point.x} cy={point.y} r={3.5} fill={color} />}
    </>
  );
}
