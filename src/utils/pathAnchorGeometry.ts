import type { PathAnchor } from '../types/shapes';

export interface AbsoluteRect { x: number; y: number; width: number; height: number }

// PathAnchor coordinates live in "path-local/viewBox space" — the fixed
// coordinate system established at creation time (see computePathViewBox),
// independent of the node's current on-screen width/height (which can differ
// after a NodeResizer stretch) and independent of its rotation. Every
// function below maps consistently between that local space and absolute
// flow coordinates, so the pen tool's live preview, the anchor-edit overlay,
// and anchor-docked connectors all agree pixel-for-pixel on where an anchor
// actually renders.

export function computePathViewBox(anchors: PathAnchor[]): { width: number; height: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const a of anchors) {
    xs.push(a.x, a.x + (a.handleIn?.x ?? 0), a.x + (a.handleOut?.x ?? 0));
    ys.push(a.y, a.y + (a.handleIn?.y ?? 0), a.y + (a.handleOut?.y ?? 0));
  }
  if (xs.length === 0) return { width: 1, height: 1 };
  return { width: Math.max(1, Math.max(...xs)), height: Math.max(1, Math.max(...ys)) };
}

// The single source of truth for turning anchors into an SVG path string —
// used identically by the final PathNode render, the live drawing overlay,
// and the anchor-edit overlay, so what you see while drawing/editing always
// matches what actually renders.
export function buildPathD(anchors: PathAnchor[], closed: boolean): string {
  if (anchors.length === 0) return '';
  let d = `M ${anchors[0].x} ${anchors[0].y}`;
  const segCount = closed ? anchors.length : anchors.length - 1;
  for (let i = 0; i < segCount; i++) {
    const a = anchors[i];
    const b = anchors[(i + 1) % anchors.length];
    if (a.handleOut || b.handleIn) {
      const c1 = a.handleOut ? { x: a.x + a.handleOut.x, y: a.y + a.handleOut.y } : a;
      const c2 = b.handleIn ? { x: b.x + b.handleIn.x, y: b.y + b.handleIn.y } : b;
      d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;
    } else {
      d += ` L ${b.x} ${b.y}`;
    }
  }
  if (closed) d += ' Z';
  return d;
}

function rotatePoint(p: { x: number; y: number }, center: { x: number; y: number }, deg: number): { x: number; y: number } {
  if (!deg) return p;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const dx = p.x - center.x, dy = p.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

function rectCenter(rect: AbsoluteRect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function anchorToAbsolute(anchor: PathAnchor, rect: AbsoluteRect, vbW: number, vbH: number, rotationDeg = 0) {
  const scaleX = rect.width / vbW, scaleY = rect.height / vbH;
  const local = { x: rect.x + anchor.x * scaleX, y: rect.y + anchor.y * scaleY };
  return rotatePoint(local, rectCenter(rect), rotationDeg);
}

export function handleToAbsolute(
  anchor: PathAnchor, which: 'handleIn' | 'handleOut', rect: AbsoluteRect, vbW: number, vbH: number, rotationDeg = 0,
) {
  const offset = anchor[which];
  if (!offset) return undefined;
  const scaleX = rect.width / vbW, scaleY = rect.height / vbH;
  const local = { x: rect.x + (anchor.x + offset.x) * scaleX, y: rect.y + (anchor.y + offset.y) * scaleY };
  return rotatePoint(local, rectCenter(rect), rotationDeg);
}

export function absoluteToAnchorLocal(absPoint: { x: number; y: number }, rect: AbsoluteRect, vbW: number, vbH: number, rotationDeg = 0) {
  const unrotated = rotatePoint(absPoint, rectCenter(rect), -rotationDeg);
  const scaleX = rect.width / vbW, scaleY = rect.height / vbH;
  return { x: (unrotated.x - rect.x) / scaleX, y: (unrotated.y - rect.y) / scaleY };
}

// After an anchor is dragged outside the node's originally-stored bounding
// box, the node's own position/width/height (set once at creation) must be
// re-derived or the shape ends up misaligned with its own resize handles and
// hit area. Mirrors finalizePath's pad+translate logic, while preserving
// whatever visual stretch a prior NodeResizer resize already applied.
export function normalizePathAnchors(anchors: PathAnchor[], currentRect: AbsoluteRect, prevVbW: number, prevVbH: number) {
  const PAD = 8;
  const xs: number[] = [0, prevVbW];
  const ys: number[] = [0, prevVbH];
  for (const a of anchors) {
    xs.push(a.x, a.x + (a.handleIn?.x ?? 0), a.x + (a.handleOut?.x ?? 0));
    ys.push(a.y, a.y + (a.handleIn?.y ?? 0), a.y + (a.handleOut?.y ?? 0));
  }
  const minX = Math.min(...xs) - PAD;
  const minY = Math.min(...ys) - PAD;
  const maxX = Math.max(...xs) + PAD;
  const maxY = Math.max(...ys) + PAD;
  const newVbW = maxX - minX;
  const newVbH = maxY - minY;
  const shifted = anchors.map(a => ({ ...a, x: a.x - minX, y: a.y - minY }));
  const scaleX = currentRect.width / prevVbW, scaleY = currentRect.height / prevVbH;
  return {
    anchors: shifted,
    position: { x: currentRect.x + minX * scaleX, y: currentRect.y + minY * scaleY },
    width: newVbW * scaleX,
    height: newVbH * scaleY,
  };
}
