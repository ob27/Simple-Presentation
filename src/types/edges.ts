import type { Edge } from '@xyflow/react';
import type { ShapeLink } from './links';

export type EdgeRouting = 'orthogonal' | 'curved' | 'straight';
export type FlowAnimation = 'none' | 'dash' | 'dot';
export type ArrowStyle = 'none' | 'arrow' | 'arrowClosed';

export interface SmartEdgeData extends Record<string, unknown> {
  routing: EdgeRouting;
  flowAnimation?: FlowAnimation;
  // Independently configurable per end, chosen after the connector is
  // drawn — defaults preserve the pre-existing look (no start arrow, a
  // filled arrow at the end) for every connector that predates this field.
  startArrow?: ArrowStyle;
  endArrow?: ArrowStyle;
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
