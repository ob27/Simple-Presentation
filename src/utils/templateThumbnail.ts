import type { DiagramNode } from '../types/shapes';

// A deliberately rough approximation (layout + rough geometry + color, not
// a pixel-faithful mini-render of every shape kind) — mirrors
// PageNavigatorRail.tsx's ThumbnailShape exactly, but as a plain SVG string
// rather than JSX, since this runs from store.ts (no live DOM to capture:
// "Save as template" is triggered from the Dashboard, where the diagram
// being saved isn't open/rendered anywhere) rather than screenshotting an
// already-rendered page.
function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function shapeToSvg(node: DiagramNode): string {
  const data = node.data;
  if (data.hidden) return '';
  const x = node.position.x;
  const y = node.position.y;
  const w = node.width ?? 0;
  const h = node.height ?? 0;
  if (!w || !h) return '';
  const fill = data.kind === 'text' ? 'none' : (data.fillColor || '#e4e6ee');
  const stroke = data.strokeColor || (data.kind === 'text' ? 'none' : 'none');
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rotation = data.rotation ? ` transform="rotate(${data.rotation}, ${cx}, ${cy})"` : '';

  let shape: string;
  if (data.kind === 'ellipse' || data.kind === 'cylinder' || data.kind === 'umlActor' || data.kind === 'cloud') {
    shape = `<ellipse cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${h / 2}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="1" />`;
  } else if (data.kind === 'diamond') {
    shape = `<polygon points="${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="1" />`;
  } else if (data.kind === 'triangle') {
    shape = `<polygon points="${cx},${y} ${x + w},${y + h} ${x},${y + h}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="1" />`;
  } else if (data.kind === 'text') {
    return '';
  } else {
    shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${data.cornerRadius ?? 2}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="1" />`;
  }
  return `<g${rotation}>${shape}</g>`;
}

export function buildTemplateThumbnailSvgDataUrl(
  shapes: DiagramNode[],
  pageDims: { width: number; height: number },
): string {
  const body = shapes.map(shapeToSvg).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pageDims.width} ${pageDims.height}">`
    + `<rect x="0" y="0" width="${pageDims.width}" height="${pageDims.height}" fill="#ffffff" />`
    + body
    + `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
