import { ViewportPortal } from '@xyflow/react';
import type { GuideLines } from './alignmentGuides';

const GUIDE_EXTENT = 5000; // flow-space units; long enough to span any realistic document

export function AlignmentGuidesOverlay({ guides }: { guides: GuideLines | null }) {
  if (!guides || (guides.vertical.length === 0 && guides.horizontal.length === 0)) return null;
  return (
    <ViewportPortal>
      <svg style={{ position: 'absolute', top: -GUIDE_EXTENT / 2, left: -GUIDE_EXTENT / 2, width: GUIDE_EXTENT, height: GUIDE_EXTENT, pointerEvents: 'none', overflow: 'visible' }}>
        {guides.vertical.map(x => (
          <line key={`v-${x}`} x1={x + GUIDE_EXTENT / 2} y1={0} x2={x + GUIDE_EXTENT / 2} y2={GUIDE_EXTENT} stroke="#ff4d8d" strokeWidth={1} />
        ))}
        {guides.horizontal.map(y => (
          <line key={`h-${y}`} x1={0} y1={y + GUIDE_EXTENT / 2} x2={GUIDE_EXTENT} y2={y + GUIDE_EXTENT / 2} stroke="#ff4d8d" strokeWidth={1} />
        ))}
      </svg>
    </ViewportPortal>
  );
}
