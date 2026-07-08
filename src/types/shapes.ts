import type { Node } from '@xyflow/react';
import type { DataBinding } from './variables';
import type { ShapeLink } from './links';

export type ShapeKind =
  | 'rectangle' | 'diamond' | 'ellipse' | 'stickyNote'
  | 'text' | 'image' | 'umlActor' | 'group' | 'pageFrame' | 'hotspot' | 'path'
  | 'triangle' | 'parallelogram' | 'hexagon' | 'container' | 'video'
  | 'umlClass' | 'umlPackage' | 'umlComponent' | 'umlNote'
  | 'icon' | 'archimateElement' | 'cylinder' | 'cloud' | 'cross' | 'star' | 'document' | 'pieChart'
  | 'brushStroke';

export interface PieSegment {
  id: string;
  label: string;
  value: number;
  color: string;
}

// Local to the brush stroke's own node origin (0,0 = top-left), captured at
// draw time in the same pixel space as brushViewBoxWidth/Height — frozen at
// finalize, unlike path anchors there's no later re-editing, so no dynamic
// viewbox recomputation is needed.
export interface BrushPoint {
  x: number;
  y: number;
  pressure: number;
}

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
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline' | 'line-through';
  letterSpacing?: number;
  lineHeight?: number;
  verticalAlign?: 'top' | 'middle' | 'bottom';
  strokeStyle?: 'solid' | 'dashed' | 'dotted';
  effect?: 'none' | 'shadow' | 'float' | 'glow';
  containerTheme?: 'plain' | 'filled' | 'header' | 'swimlane';
  containerAccentColor?: string;
  laneCount?: number;
  laneOrientation?: 'vertical' | 'horizontal';
  laneLabels?: string[];
  videoUrl?: string;
  posterUrl?: string;
  videoAutoplay?: boolean;
  videoLoop?: boolean;
  videoMuted?: boolean;
  videoControls?: boolean;
  iconName?: string;
  archimateLayer?: 'business' | 'application' | 'technology';
  archimateType?: string;
  starPoints?: number;
  starInnerRadius?: number;
  pieSegments?: PieSegment[];
  pieInnerRadius?: number;
  brushPoints?: BrushPoint[];
  brushStyle?: 'pencil' | 'marker' | 'calligraphy';
  brushBaseWidth?: number;
  brushViewBoxWidth?: number;
  brushViewBoxHeight?: number;
}

export type DiagramNode = Node<ShapeNodeData>;
