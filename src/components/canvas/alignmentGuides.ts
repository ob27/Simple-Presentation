import type { Node } from '@xyflow/react';

const SNAP_THRESHOLD = 6;

export interface GuideLines {
  vertical: number[];
  horizontal: number[];
}

// Compares the dragged node's edges/center against every sibling on the same
// page and returns matching guide-line positions (flow-space coordinates).
// Informational only — does not mutate position (grid-snap already handles
// hard snapping); this is the cheap, non-fragile version of "alignment guides".
export function computeAlignmentGuides(
  dragged: { x: number; y: number; width: number; height: number },
  siblings: Node[],
): GuideLines {
  const vertical = new Set<number>();
  const horizontal = new Set<number>();

  const dLeft = dragged.x;
  const dRight = dragged.x + dragged.width;
  const dCenterX = dragged.x + dragged.width / 2;
  const dTop = dragged.y;
  const dBottom = dragged.y + dragged.height;
  const dCenterY = dragged.y + dragged.height / 2;

  for (const sib of siblings) {
    const sw = sib.width ?? sib.measured?.width ?? 0;
    const sh = sib.height ?? sib.measured?.height ?? 0;
    const sLeft = sib.position.x;
    const sRight = sLeft + sw;
    const sCenterX = sLeft + sw / 2;
    const sTop = sib.position.y;
    const sBottom = sTop + sh;
    const sCenterY = sTop + sh / 2;

    for (const [d, s] of [[dLeft, sLeft], [dLeft, sRight], [dRight, sLeft], [dRight, sRight], [dCenterX, sCenterX]]) {
      if (Math.abs(d - s) <= SNAP_THRESHOLD) vertical.add(s);
    }
    for (const [d, s] of [[dTop, sTop], [dTop, sBottom], [dBottom, sTop], [dBottom, sBottom], [dCenterY, sCenterY]]) {
      if (Math.abs(d - s) <= SNAP_THRESHOLD) horizontal.add(s);
    }
  }

  return { vertical: Array.from(vertical), horizontal: Array.from(horizontal) };
}

// Turns a GuideLines result (from computeAlignmentGuides, computed against
// the SAME `dragged` rect) into the {dx, dy} needed to land exactly on the
// closest in-range guide per axis — 0 on an axis with no guide in range.
// Picking the closest (not just the first) matters once multiple siblings
// each contribute a guide within threshold on the same axis.
export function computeSnapOffset(
  dragged: { x: number; y: number; width: number; height: number },
  guides: GuideLines,
): { dx: number; dy: number } {
  const dLeft = dragged.x;
  const dRight = dragged.x + dragged.width;
  const dCenterX = dragged.x + dragged.width / 2;
  const dTop = dragged.y;
  const dBottom = dragged.y + dragged.height;
  const dCenterY = dragged.y + dragged.height / 2;

  let dx = 0;
  let bestDx = Infinity;
  for (const g of guides.vertical) {
    for (const d of [dLeft, dRight, dCenterX]) {
      const delta = g - d;
      if (Math.abs(delta) <= SNAP_THRESHOLD && Math.abs(delta) < Math.abs(bestDx === Infinity ? delta : bestDx)) {
        bestDx = delta;
      }
    }
  }
  if (bestDx !== Infinity) dx = bestDx;

  let dy = 0;
  let bestDy = Infinity;
  for (const g of guides.horizontal) {
    for (const d of [dTop, dBottom, dCenterY]) {
      const delta = g - d;
      if (Math.abs(delta) <= SNAP_THRESHOLD && Math.abs(delta) < Math.abs(bestDy === Infinity ? delta : bestDy)) {
        bestDy = delta;
      }
    }
  }
  if (bestDy !== Infinity) dy = bestDy;

  return { dx, dy };
}
