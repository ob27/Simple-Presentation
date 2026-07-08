import { ViewportPortal } from '@xyflow/react';
import type { BrushPoint } from '../../types/shapes';
import { BrushStamps } from './BrushStamps';

const EXTENT = 5000;

interface Props {
  points: BrushPoint[];
}

// Live preview while a brush stroke is being drawn — always previewed as
// 'pencil' at a fixed width regardless of what style/color the finalized
// shape ends up with, since that's chosen afterward from the properties
// panel (same as every other shape: place first, style after).
export function BrushDrawingOverlay({ points }: Props) {
  if (points.length === 0) return null;
  const off = EXTENT / 2;
  const shifted = points.map(p => ({ x: p.x + off, y: p.y + off, pressure: p.pressure }));
  return (
    <ViewportPortal>
      <svg style={{ position: 'absolute', top: -off, left: -off, width: EXTENT, height: EXTENT, pointerEvents: 'none', overflow: 'visible' }}>
        <BrushStamps points={shifted} style="pencil" baseWidth={6} color="#1a1a2e" />
      </svg>
    </ViewportPortal>
  );
}
