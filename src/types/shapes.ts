import type { Node } from '@xyflow/react';
import type { DataBinding } from './variables';
import type { ShapeLink } from './links';

export type ShapeKind =
  | 'rectangle' | 'diamond' | 'ellipse' | 'stickyNote'
  | 'text' | 'image' | 'umlActor' | 'group' | 'pageFrame' | 'hotspot' | 'path'
  | 'triangle' | 'parallelogram' | 'hexagon';

// Coordinates are local to the path shape's own node origin (0,0 = the
// node's top-left); handle offsets are vectors relative to their own anchor,
// not absolute coordinates, so translating the node never requires touching
// them — only anchor x/y shift.
export interface PathAnchor {
  x: number;
  y: number;
  handleIn?: { x: number; y: number };
  handleOut?: { x: number; y: number };
}

export interface ShapeNodeData extends Record<string, unknown> {
  kind: ShapeKind;
  pageId: string;
  label?: string;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  rotation?: number;
  zIndex?: number;
  revealOrder?: number;
  highlightGroup?: string;
  dataBinding?: DataBinding;
  link?: ShapeLink;
  imageUrl?: string;
  locked?: boolean;
  hidden?: boolean;
  pathAnchors?: PathAnchor[];
  pathClosed?: boolean;
  cornerRadius?: number;
  fontSize?: number;
  fontColor?: string;
  fontWeight?: 'normal' | 'bold';
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
  strokeStyle?: 'solid' | 'dashed' | 'dotted';
  effect?: 'none' | 'shadow' | 'float' | 'glow';
}

export type DiagramNode = Node<ShapeNodeData>;
