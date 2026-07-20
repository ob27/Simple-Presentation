import { toPng, toSvg, toJpeg } from 'html-to-image';
import { getViewportForBounds } from '@xyflow/react';

export interface PageBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Renders one page at its true paper-size pixel dimensions (times `scale` for
// print quality) rather than whatever zoom level the user happens to be at.
// html-to-image clones the node and applies the style override to the clone,
// so this never disturbs the live, on-screen viewport. `quality` only affects
// the 'jpeg' format (0-1, passed straight through to html-to-image's toJpeg).
export async function exportPageAsImage(bounds: PageBounds, format: 'png' | 'svg' | 'jpeg', scale = 2, quality = 0.8): Promise<string> {
  const width = Math.round(bounds.width * scale);
  const height = Math.round(bounds.height * scale);
  const viewport = getViewportForBounds(bounds, width, height, scale, scale, 0);

  const viewportEl = document.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (!viewportEl) throw new Error('React Flow viewport not found');

  const options = {
    backgroundColor: '#ffffff',
    width,
    height,
    quality,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
  };

  if (format === 'png') return toPng(viewportEl, options);
  if (format === 'jpeg') return toJpeg(viewportEl, options);
  return toSvg(viewportEl, options);
}

// React Flow's onlyRenderVisibleElements culls any node outside the current
// camera viewport from the DOM entirely. Export callers flip it off (via
// Canvas.tsx's isExporting state) right before capturing so every page's
// shapes actually exist to be cloned/cropped — this just gives React a
// moment to commit and paint those newly-mounted nodes before the first
// capture starts.
export async function waitForFullRender(): Promise<void> {
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  await new Promise<void>(resolve => setTimeout(resolve, 50));
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
