import type { PathAnchor, PathContourData } from '../types/shapes';

export interface AbsoluteRect { x: number; y: number; width: number; height: number }

// PathAnchor coordinates live in "path-local/viewBox space" — the fixed
// coordinate system established at creation time (see computePathViewBox),
// independent of the node's current on-screen width/height (which can differ
// after a NodeResizer stretch) and independent of its rotation. Every
// function below maps consistently between that local space and absolute
// flow coordinates, so the pen tool's live preview, the anchor-edit overlay,
// and anchor-docked connectors all agree pixel-for-pixel on where an anchor
// actually renders.

export function computePathViewBox(anchors: PathAnchor[], holes?: PathContourData[]): { width: number; height: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  const contours = holes ? [anchors, ...holes.map(h => h.anchors)] : [anchors];
  for (const contour of contours) {
    for (const a of contour) {
      xs.push(a.x, a.x + (a.handleIn?.x ?? 0), a.x + (a.handleOut?.x ?? 0));
      ys.push(a.y, a.y + (a.handleIn?.y ?? 0), a.y + (a.handleOut?.y ?? 0));
    }
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

// Appends each hole as its own `M...Z` subpath onto the main contour's `d` —
// SVG natively supports multiple subpaths in one `d` attribute, and with
// `fill-rule="evenodd"` (set by the renderer alongside this) an overlapping
// subpath cuts a real hole rather than just drawing another opaque shape on
// top. Only path shapes produced by a boolean op populate `holes`; the pen
// tool and direct-select anchor editing never touch this — they only ever
// see and edit the single main `anchors` contour.
export function buildPathDWithHoles(anchors: PathAnchor[], closed: boolean, holes?: PathContourData[]): string {
  let d = buildPathD(anchors, closed);
  if (holes) {
    for (const hole of holes) d += ' ' + buildPathD(hole.anchors, hole.closed);
  }
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

// Splits a cubic bezier at parameter t via De Casteljau subdivision — the
// exact way to insert a new on-curve point without visibly kinking the
// curve, since the two resulting half-curves are geometrically identical to
// the original (unlike, say, just averaging the endpoints).
export function subdivideBezierAt(
  a: { x: number; y: number }, c1: { x: number; y: number }, c2: { x: number; y: number }, b: { x: number; y: number }, t: number,
) {
  const lerp = (p: { x: number; y: number }, q: { x: number; y: number }) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const p01 = lerp(a, c1), p12 = lerp(c1, c2), p23 = lerp(c2, b);
  const p012 = lerp(p01, p12), p123 = lerp(p12, p23);
  const point = lerp(p012, p123);
  return { point, c1Left: p01, c2Left: p012, c1Right: p123, c2Right: p23 };
}

// Finds the closest point on a path (in path-local/viewBox space) to a given
// local point, across every segment. Line segments use exact point-to-segment
// projection; bezier segments have no closed-form nearest-point solution, so
// this samples the curve then refines around the best coarse sample — plenty
// precise for a UI click target, and cheap (well under a millisecond).
export function findNearestPointOnPath(anchors: PathAnchor[], closed: boolean, localPoint: { x: number; y: number }) {
  if (anchors.length < 2) return undefined;
  const segCount = closed ? anchors.length : anchors.length - 1;
  let best: { segmentIndex: number; t: number; distance: number; point: { x: number; y: number } } | undefined;

  function consider(segmentIndex: number, t: number, point: { x: number; y: number }) {
    const distance = Math.hypot(point.x - localPoint.x, point.y - localPoint.y);
    if (!best || distance < best.distance) best = { segmentIndex, t, distance, point };
  }

  for (let i = 0; i < segCount; i++) {
    const a = anchors[i];
    const b = anchors[(i + 1) % anchors.length];
    if (a.handleOut || b.handleIn) {
      const c1 = a.handleOut ? { x: a.x + a.handleOut.x, y: a.y + a.handleOut.y } : a;
      const c2 = b.handleIn ? { x: b.x + b.handleIn.x, y: b.y + b.handleIn.y } : b;
      const N = 40;
      let coarseT = 0;
      let coarseDist = Infinity;
      for (let s = 0; s <= N; s++) {
        const t = s / N;
        const pt = subdivideBezierAt(a, c1, c2, b, t).point;
        const d = Math.hypot(pt.x - localPoint.x, pt.y - localPoint.y);
        if (d < coarseDist) { coarseDist = d; coarseT = t; }
      }
      const refineStep = 1 / N;
      for (let s = -10; s <= 10; s++) {
        const t = Math.min(1, Math.max(0, coarseT + (s / 10) * refineStep));
        const pt = subdivideBezierAt(a, c1, c2, b, t).point;
        consider(i, t, pt);
      }
    } else {
      const dx = b.x - a.x, dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      const t = lenSq === 0 ? 0 : Math.min(1, Math.max(0, ((localPoint.x - a.x) * dx + (localPoint.y - a.y) * dy) / lenSq));
      consider(i, t, { x: a.x + t * dx, y: a.y + t * dy });
    }
  }
  return best;
}

function normalizeVec(v: { x: number; y: number }) {
  const len = Math.hypot(v.x, v.y);
  return len === 0 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
}

// Synthesizes symmetric handles for a corner point being converted to
// smooth, from the direction of its neighbors — there's no existing tangent
// to preserve (a corner has none), so this uses the same "smooth through the
// neighbors' direction" heuristic every vector tool uses for this operation,
// scaled to a third of the distance to each respective neighbor.
export function synthesizeSmoothHandles(anchors: PathAnchor[], index: number, closed: boolean): { handleIn?: { x: number; y: number }; handleOut?: { x: number; y: number } } {
  const n = anchors.length;
  const anchor = anchors[index];
  const prev = closed || index > 0 ? anchors[(index - 1 + n) % n] : undefined;
  const next = closed || index < n - 1 ? anchors[(index + 1) % n] : undefined;
  if (!prev && !next) return {};
  if (prev && next) {
    const dir = normalizeVec({ x: next.x - prev.x, y: next.y - prev.y });
    const outLen = Math.hypot(next.x - anchor.x, next.y - anchor.y) / 3;
    const inLen = Math.hypot(anchor.x - prev.x, anchor.y - prev.y) / 3;
    return { handleOut: { x: dir.x * outLen, y: dir.y * outLen }, handleIn: { x: -dir.x * inLen, y: -dir.y * inLen } };
  }
  if (next) {
    const dir = normalizeVec({ x: next.x - anchor.x, y: next.y - anchor.y });
    const len = Math.hypot(next.x - anchor.x, next.y - anchor.y) / 3;
    return { handleOut: { x: dir.x * len, y: dir.y * len } };
  }
  const dir = normalizeVec({ x: anchor.x - prev!.x, y: anchor.y - prev!.y });
  const len = Math.hypot(anchor.x - prev!.x, anchor.y - prev!.y) / 3;
  return { handleIn: { x: -dir.x * len, y: -dir.y * len } };
}

// After an anchor is dragged outside the node's originally-stored bounding
// box, the node's own position/width/height (set once at creation) must be
// re-derived or the shape ends up misaligned with its own resize handles and
// hit area. Mirrors finalizePath's pad+translate logic, while preserving
// whatever visual stretch a prior NodeResizer resize already applied.
export function normalizePathAnchors(anchors: PathAnchor[], currentRect: AbsoluteRect, prevVbW: number, prevVbH: number) {
  const PAD = 8;
  // Bounds come ONLY from the anchors themselves — seeding this with the
  // previous viewbox's own corners (0, prevVbW/H) was the bug: since anchors
  // always settle at exactly PAD from each edge after a call, 0 is always
  // less than that, so every single call re-padded by another 8 units on
  // top of the last, growing and shifting the shape on every edit even when
  // nothing actually moved near an edge.
  const xs: number[] = [];
  const ys: number[] = [];
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
