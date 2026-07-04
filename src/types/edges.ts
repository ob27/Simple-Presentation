import type { Edge } from '@xyflow/react';
import type { ShapeLink } from './links';

export type EdgeRouting = 'orthogonal' | 'curved' | 'straight';
export type FlowAnimation = 'none' | 'dash' | 'dot';

export interface SmartEdgeData extends Record<string, unknown> {
  routing: EdgeRouting;
  flowAnimation?: FlowAnimation;
  revealOrder?: number;
  highlightGroup?: string;
  label?: string;
  link?: ShapeLink;
  // Index into the source/target path shape's pathAnchors, when that end is
  // a `path` node and the connector was dropped near one of its specific
  // anchor points rather than anywhere on its body. Undefined means "use the
  // normal floating-rectangle intersection" (today's behavior, unaffected).
  sourceAnchorIndex?: number;
  targetAnchorIndex?: number;
}

export type DiagramEdge = Edge<SmartEdgeData>;
