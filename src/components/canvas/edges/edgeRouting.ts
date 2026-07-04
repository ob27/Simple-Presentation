import { Position, type InternalNode } from '@xyflow/react';
import type { ShapeNodeData } from '../../../types/shapes';
import { anchorToAbsolute, computePathViewBox } from '../../../utils/pathAnchorGeometry';

// `targetPoint` used to always be derived from a second InternalNode's
// center — refactored to accept a plain point so the same intersection math
// can be reused for anchor-docked edges, where one end is a fixed point
// rather than a rectangle.
function getNodeIntersection(intersectionNode: InternalNode, targetPoint: { x: number; y: number }) {
  const w = (intersectionNode.measured.width ?? 100) / 2;
  const h = (intersectionNode.measured.height ?? 70) / 2;
  const nodePos = intersectionNode.internals.positionAbsolute;

  const x2 = nodePos.x + w;
  const y2 = nodePos.y + h;
  const x1 = targetPoint.x;
  const y1 = targetPoint.y;

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;

  return { x: w * (xx3 + yy3) + x2, y: h * (-xx3 + yy3) + y2 };
}

function nodeCenter(node: InternalNode) {
  const pos = node.internals.positionAbsolute;
  return { x: pos.x + (node.measured.width ?? 100) / 2, y: pos.y + (node.measured.height ?? 70) / 2 };
}

function getEdgePosition(node: InternalNode, intersectionPoint: { x: number; y: number }): Position {
  const n = node.internals.positionAbsolute;
  const nw = node.measured.width ?? 100;
  const nh = node.measured.height ?? 70;
  const px = Math.round(intersectionPoint.x * 10) / 10;
  const py = Math.round(intersectionPoint.y * 10) / 10;

  if (px <= n.x + 1) return Position.Left;
  if (px >= n.x + nw - 1) return Position.Right;
  if (py <= n.y + 1) return Position.Top;
  if (py >= n.y + nh - 1) return Position.Bottom;
  return Position.Top;
}

export function getFloatingEdgeParams(source: InternalNode, target: InternalNode) {
  const sourceIntersection = getNodeIntersection(source, nodeCenter(target));
  const targetIntersection = getNodeIntersection(target, nodeCenter(source));
  const sourcePos = getEdgePosition(source, sourceIntersection);
  const targetPos = getEdgePosition(target, targetIntersection);

  return {
    sx: sourceIntersection.x, sy: sourceIntersection.y, sPos: sourcePos,
    tx: targetIntersection.x, ty: targetIntersection.y, tPos: targetPos,
  };
}

// The absolute point a specific pathAnchors[index] renders at, accounting
// for the path node's current stretch (width/vbW, height/vbH) and rotation —
// same math used by the pen tool's anchor-edit overlay, so a connector docked
// here always tracks the anchor exactly as the user sees it.
export function getAnchorPoint(node: InternalNode, anchorIndex: number): { x: number; y: number } | undefined {
  const data = node.data as ShapeNodeData;
  const anchor = data.pathAnchors?.[anchorIndex];
  if (!anchor) return undefined;
  const pos = node.internals.positionAbsolute;
  const rect = { x: pos.x, y: pos.y, width: node.measured.width ?? 0, height: node.measured.height ?? 0 };
  const { width: vbW, height: vbH } = computePathViewBox(data.pathAnchors ?? []);
  return anchorToAbsolute(anchor, rect, vbW, vbH, data.rotation ?? 0);
}

// Edge params when one or both ends are docked to a specific anchor point
// instead of a floating rectangle intersection. Restricted to straight/curved
// routing by the caller — an interior anchor point has no natural "side" for
// orthogonal routing's corner logic, so Position here is only a best-effort
// direction hint for getBezierPath's control points, not load-bearing.
export function getAnchorAwareEdgeParams(
  source: InternalNode, target: InternalNode,
  sourceAnchorIndex: number | undefined, targetAnchorIndex: number | undefined,
) {
  const sourceAnchorPt = sourceAnchorIndex !== undefined ? getAnchorPoint(source, sourceAnchorIndex) : undefined;
  const targetAnchorPt = targetAnchorIndex !== undefined ? getAnchorPoint(target, targetAnchorIndex) : undefined;

  const sPoint = sourceAnchorPt ?? getNodeIntersection(source, targetAnchorPt ?? nodeCenter(target));
  const tPoint = targetAnchorPt ?? getNodeIntersection(target, sourceAnchorPt ?? nodeCenter(source));
  const sPos = sourceAnchorPt ? Position.Bottom : getEdgePosition(source, sPoint);
  const tPos = targetAnchorPt ? Position.Bottom : getEdgePosition(target, tPoint);

  return { sx: sPoint.x, sy: sPoint.y, sPos, tx: tPoint.x, ty: tPoint.y, tPos };
}
