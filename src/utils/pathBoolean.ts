import paper from 'paper/dist/paper-core';
import type { PathAnchor } from '../types/shapes';

// True curve-preserving boolean path operations (union/subtract/intersect/
// exclude), via paper.js's PathItem boolean math rather than a hand-rolled
// polygon-clipping approximation — paper.js works directly with bezier
// segments, so a circle stays a smooth circle after being unioned with a
// square instead of decaying into short straight-line approximations.
//
// paper.js needs an active Project to construct Path/Segment objects at
// all, even for pure off-screen geometry math — `paper.setup(new Size(1,1))`
// creates one without ever touching a real <canvas>, and `{ insert: false }`
// on every constructed Path keeps it out of that (invisible) project's
// scene graph so nothing accumulates there across repeated calls.
let paperReady = false;
function ensurePaperSetup() {
  if (paperReady) return;
  paper.setup(new paper.Size(1, 1));
  paperReady = true;
}

// paper.js's Segment#handleIn/#handleOut are offsets relative to the
// segment's own point — exactly this app's own PathAnchor convention
// (confirmed in pathAnchorGeometry.ts, e.g. `a.x + a.handleOut.x`) — so
// building a paper.Path from our anchors is a direct field mapping with no
// coordinate-space conversion.
function anchorsToPaperPath(anchors: PathAnchor[], closed: boolean): paper.Path {
  const segments = anchors.map(a => new paper.Segment(
    new paper.Point(a.x, a.y),
    a.handleIn ? new paper.Point(a.handleIn.x, a.handleIn.y) : undefined,
    a.handleOut ? new paper.Point(a.handleOut.x, a.handleOut.y) : undefined,
  ));
  return new paper.Path({ segments, closed, insert: false });
}

function segmentToAnchor(seg: paper.Segment): PathAnchor {
  const handleIn = seg.handleIn && (seg.handleIn.x !== 0 || seg.handleIn.y !== 0) ? { x: seg.handleIn.x, y: seg.handleIn.y } : undefined;
  const handleOut = seg.handleOut && (seg.handleOut.x !== 0 || seg.handleOut.y !== 0) ? { x: seg.handleOut.x, y: seg.handleOut.y } : undefined;
  return { x: seg.point.x, y: seg.point.y, handleIn, handleOut };
}

export interface PathContour {
  anchors: PathAnchor[];
  closed: boolean;
}

// Standard cubic-bezier circular-arc approximation constant (4/3 * (sqrt(2)-1)).
const KAPPA = 0.5522847498;

// A closed bezier approximation of an axis-aligned ellipse inscribed in a
// `w`x`h` box, local to that box's own (0,0)-to-(w,h) space — the classic
// 4-anchor construction used throughout vector graphics, accurate to within
// a fraction of a percent of a true ellipse.
export function ellipseToAnchors(w: number, h: number): PathAnchor[] {
  const rx = w / 2, ry = h / 2, kx = rx * KAPPA, ky = ry * KAPPA;
  return [
    { x: rx, y: 0, handleIn: { x: -kx, y: 0 }, handleOut: { x: kx, y: 0 } },
    { x: w, y: ry, handleIn: { x: 0, y: -ky }, handleOut: { x: 0, y: ky } },
    { x: rx, y: h, handleIn: { x: kx, y: 0 }, handleOut: { x: -kx, y: 0 } },
    { x: 0, y: ry, handleIn: { x: 0, y: ky }, handleOut: { x: 0, y: -ky } },
  ];
}

// A closed bezier approximation of a rounded rectangle in the same local
// box-space convention as ellipseToAnchors — 8 anchors: a straight-edge pair
// per side, joined by a quarter-circle arc at each corner. `radius` is
// clamped so opposing corners never overlap (matching the visual clamp any
// rounded-rect renderer applies). Each corner's two arc-adjacent anchors
// carry the entering anchor's handleOut (forward tangent) and the exiting
// anchor's handleIn (backward tangent) — derived from the quarter-circle's
// parametric tangent at each end, not guessed.
export function roundedRectToAnchors(w: number, h: number, radius: number): PathAnchor[] {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (r === 0) {
    return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  }
  const k = r * KAPPA;
  return [
    { x: r, y: 0, handleIn: { x: -k, y: 0 } },
    { x: w - r, y: 0, handleOut: { x: k, y: 0 } },
    { x: w, y: r, handleIn: { x: 0, y: -k } },
    { x: w, y: h - r, handleOut: { x: 0, y: k } },
    { x: w - r, y: h, handleIn: { x: k, y: 0 } },
    { x: r, y: h, handleOut: { x: -k, y: 0 } },
    { x: 0, y: h - r, handleIn: { x: 0, y: k } },
    { x: 0, y: r, handleOut: { x: 0, y: -k } },
  ];
}

export type BooleanOp = 'unite' | 'subtract' | 'intersect' | 'exclude';

// Returns one contour per resulting sub-path. Simple, common results (union
// of two overlapping shapes, subtract that doesn't leave an enclosed hole,
// intersect) come back as exactly one contour. A result that includes an
// actual hole (subtract/exclude producing a ring) comes back as MULTIPLE
// contours with no explicit "this is a hole of that" relationship — see
// groupContoursByContainment below, which reconstructs it.
export function applyBooleanOp(op: BooleanOp, a: PathContour, b: PathContour): PathContour[] | null {
  ensurePaperSetup();
  const pathA = anchorsToPaperPath(a.anchors, a.closed);
  const pathB = anchorsToPaperPath(b.anchors, b.closed);
  try {
    const result = pathA[op](pathB, { insert: false });
    const contours: PathContour[] = [];
    if (result instanceof paper.CompoundPath) {
      for (const child of result.children) {
        if (child instanceof paper.Path) contours.push({ anchors: child.segments.map(segmentToAnchor), closed: child.closed });
      }
    } else if (result instanceof paper.Path) {
      contours.push({ anchors: result.segments.map(segmentToAnchor), closed: result.closed });
    }
    result?.remove();
    return contours.length > 0 ? contours : null;
  } catch {
    // Self-intersecting input, degenerate/near-zero-area geometry, or a
    // numerical precision failure inside paper.js's curve-intersection math
    // — surfacing nothing is better than a broken/partial result.
    return null;
  } finally {
    pathA.remove();
    pathB.remove();
  }
}

// Straight-line (anchor-vertex) polygon area/containment — deliberately
// ignoring bezier curvature. Good enough for deciding "is this contour
// nested inside that one," which is a topological question, not one that
// needs curve-accurate geometry.
function polygonArea(anchors: PathAnchor[]): number {
  let sum = 0;
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i], b = anchors[(i + 1) % anchors.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function polygonContainsPoint(anchors: PathAnchor[], point: { x: number; y: number }): boolean {
  let inside = false;
  for (let i = 0, j = anchors.length - 1; i < anchors.length; j = i++) {
    const xi = anchors[i].x, yi = anchors[i].y;
    const xj = anchors[j].x, yj = anchors[j].y;
    const intersect = (yi > point.y) !== (yj > point.y) && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function contourCentroid(anchors: PathAnchor[]): { x: number; y: number } {
  const sum = anchors.reduce((acc, a) => ({ x: acc.x + a.x, y: acc.y + a.y }), { x: 0, y: 0 });
  return { x: sum.x / anchors.length, y: sum.y / anchors.length };
}

export interface GroupedContour {
  outer: PathContour;
  holes: PathContour[];
}

// paper.js's CompoundPath.children is a flat list with no explicit "this is
// a hole of that" relationship — reconstructed here by processing contours
// largest-area-first; a smaller contour whose centroid falls inside an
// already-placed larger one becomes that one's hole rather than its own
// top-level shape. This assumes at most one level of nesting (a shape with
// a hole, not a hole-within-a-hole-within-a-shape) — a reasonable scope for
// results of combining just two source shapes, which realistically never
// produces deeper nesting than that.
export function groupContoursByContainment(contours: PathContour[]): GroupedContour[] {
  const withMeta = contours.map(c => ({ contour: c, centroid: contourCentroid(c.anchors), area: polygonArea(c.anchors) }));
  withMeta.sort((a, b) => b.area - a.area);
  const groups: GroupedContour[] = [];
  for (const { contour, centroid } of withMeta) {
    const parent = groups.find(g => polygonContainsPoint(g.outer.anchors, centroid));
    if (parent) parent.holes.push(contour);
    else groups.push({ outer: contour, holes: [] });
  }
  return groups;
}
