import { toPng, toSvg } from 'html-to-image';
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
// so this never disturbs the live, on-screen viewport.
export async function exportPageAsImage(bounds: PageBounds, format: 'png' | 'svg', scale = 2): Promise<string> {
  const width = Math.round(bounds.width * scale);
  const height = Math.round(bounds.height * scale);
  const viewport = getViewportForBounds(bounds, width, height, scale, scale, 0);

  const viewportEl = document.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (!viewportEl) throw new Error('React Flow viewport not found');

  const options = {
    backgroundColor: '#ffffff',
    width,
    height,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
  };

  return format === 'png' ? toPng(viewportEl, options) : toSvg(viewportEl, options);
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
