import { useViewport } from '@xyflow/react';
import type { DiagramPage } from '../../types/document';

// Determines which page is centered in the current viewport — shared by
// PageNavigatorRail and LayersPanel so "current page" means the same thing
// everywhere rather than two independently-drifting heuristics.
export function useActivePageId(
  pages: DiagramPage[],
  pageOrigins: Map<string, number>,
  pageDimensions: Map<string, { width: number; height: number }>,
): string | undefined {
  const { y, zoom } = useViewport();
  const viewportCenterY = (-y + window.innerHeight / 2) / zoom;
  let activePageId = pages[0]?.id;
  let bestDist = Infinity;
  for (const page of pages) {
    const origin = pageOrigins.get(page.id) ?? 0;
    const dims = pageDimensions.get(page.id);
    const centerY = origin + (dims?.height ?? 0) / 2;
    const dist = Math.abs(centerY - viewportCenterY);
    if (dist < bestDist) {
      bestDist = dist;
      activePageId = page.id;
    }
  }
  return activePageId;
}
