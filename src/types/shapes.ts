import type { Node } from '@xyflow/react';
import type { DataBinding } from './variables';
import type { ShapeLink } from './links';

export type ShapeKind =
  | 'rectangle' | 'diamond' | 'ellipse' | 'stickyNote'
  | 'text' | 'image' | 'umlActor' | 'group' | 'pageFrame' | 'hotspot' | 'path'
  | 'triangle' | 'parallelogram' | 'hexagon' | 'container' | 'video'
  | 'umlClass' | 'umlPackage' | 'umlComponent' | 'umlNote'
  | 'icon' | 'archimateElement' | 'cylinder' | 'cloud' | 'cross' | 'star' | 'document' | 'pieChart'
  | 'brushStroke' | 'table' | 'chart';

export interface PieSegment {
  id: string;
  label: string;
  value: number;
  color: string;
}

// Same shape as PieSegment (id/label/value/color) — static, manually-entered
// data, same as pie charts today. Live variable-binding is a bigger, separate
// change (DataBinding/DiagramVariable are scalar-only today — binding a
// whole series would need either N separate scalar bindings or a new
// array-valued variable type), deliberately deferred rather than attempted here.
export interface ChartDataPoint {
  id: string;
  label: string;
  value: number;
  color: string;
}

export interface GradientStop {
  color: string;
  offset: number; // 0-100
}

export interface FillGradient {
  type: 'linear' | 'radial';
  angle?: number; // degrees, linear only — 0 = left-to-right, 90 = top-to-bottom
  stops: GradientStop[];
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

// A secondary, non-anchor-editable sub-contour cut out of a path shape's
// main `pathAnchors` fill via even-odd fill-rule — how a genuine hole (e.g.
// a ring produced by subtracting a smaller shape from a larger one) gets
// represented, since `pathAnchors` itself stays a single contour that the
// pen tool / direct-select anchor editing can keep operating on unchanged.
export interface PathContourData {
  anchors: PathAnchor[];
  closed: boolean;
}

// Arbitrary per-shape key/value metadata (e.g. "Asset Tag: X, Owner: Y") —
// independent of the style-driven DataBinding/Variables system, which only
// ever conditionally changes a shape's appearance. This is just notes.
export interface CustomField {
  key: string;
  value: string;
}

// A run of same-formatted text within one paragraph. `color`, when unset,
// inherits the shape's whole-box `fontColor` — only stored when it overrides
// that base, so plain text costs nothing extra. Font family/size/line-height/
// letterSpacing/alignment stay whole-shape settings (ShapeNodeData's existing
// fontSize/fontFamily/etc.) rather than per-run — one text box virtually
// always shares one base typeface/size, and per-run overrides for those are
// a much rarer ask than per-run bold/italic/underline/strike/color.
export interface RichTextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  color?: string;
}

// One line/block of a Text-kind shape's body. `listType` marks it as a
// bullet/numbered list item; consecutive paragraphs sharing the same
// listType render as one grouped <ul>/<ol> rather than separate lists.
export interface RichTextParagraph {
  runs: RichTextRun[];
  listType?: 'bullet' | 'ordered';
  // Nesting depth for list items only (0 = top level, meaningless when
  // `listType` is unset) — stored flat rather than as a tree so paragraphs
  // stay a plain array; the nested <ul>/<ol> DOM (real sub-lists, so an
  // indented ordered item restarts its own numbering) is only ever built/
  // parsed at the edges: RichTextEditor's edit-mode seed, the commit
  // parser, and the read-only display renderer.
  indentLevel?: number;
}

export interface ShapeNodeData extends Record<string, unknown> {
  kind: ShapeKind;
  pageId: string;
  label?: string;
  // Structured multi-run/paragraph formatting for a Text-kind shape's body —
  // `label` stays in sync as the flattened plain text (newline-joined, no
  // formatting) so anything that only reads `label` keeps working unchanged.
  // Absent entirely for every shape that predates this field, and for every
  // non-Text kind, which never gets a rich-text editing surface.
  richText?: RichTextParagraph[];
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  rotation?: number;
  zIndex?: number;
  revealOrder?: number;
  // Only meaningful alongside revealOrder — how the shape appears at the
  // moment its reveal step is reached during presentation. 'fade' (default)
  // is the pre-existing opacity-only behavior every shape already had;
  // flyIn/zoom add a transform on top of that same opacity transition,
  // applied at the outermost wrapper so it composes with each kind's own
  // inner rotation transform rather than fighting it. Emphasis/exit
  // animations are deliberately out of scope — no "trigger at step N when
  // already visible" or "hide at step N" mechanism exists yet.
  animationType?: 'fade' | 'flyIn' | 'zoom';
  animationDuration?: number; // ms; defaults to 300 (the pre-existing hardcoded value)
  highlightGroup?: string;
  dataBinding?: DataBinding;
  customFields?: CustomField[];
  // Independent of the z-order/grouping tree LayersPanel exposes — a shape
  // can carry multiple tags regardless of where it sits in that tree (e.g.
  // "Electrical" AND "Floor 1" at once), and tag visibility is a local,
  // per-viewer filter (see Canvas.tsx's `hiddenTags`), not a persisted
  // document change — toggling a tag off never touches `hidden` itself.
  tags?: string[];
  link?: ShapeLink;
  imageUrl?: string;
  // Image-kind only — the uploaded file's byte size (from the Storage
  // upload's own metadata) and whether it's already been through
  // downsampleImageFile, so ShapePropertiesPanel's Settings tab can show
  // current size and only offer "Downsample now" when there's still
  // savings to be had.
  fileSizeBytes?: number;
  downsampled?: boolean;
  locked?: boolean;
  hidden?: boolean;
  pathAnchors?: PathAnchor[];
  pathClosed?: boolean;
  pathHoles?: PathContourData[];
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
  // Free-form, independent of the canned `effect` presets above — opacity is
  // a 0-100 percentage (matching how other numeric fields like strokeWidth
  // are stored) rather than the 0-1 fraction used internally for the
  // dim/hide runtime states, and blur is a plain px radius.
  opacity?: number;
  blur?: number;
  // When set, overrides `fillColor` on the shape's main body with a CSS
  // gradient instead of a solid color — scoped to div-rendered shape kinds
  // only (paths and pie-chart segments have their own separate fill logic).
  fillGradient?: FillGradient;
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
  // Rows/columns are always rendered evenly split (100/tableRows %,
  // 100/tableCols %) rather than storing individual widths/heights —
  // mirrors the existing swimlane container's laneCount convention, and
  // means a plain resize of the whole shape redistributes every
  // row/column proportionally for free, with no separate rescale logic
  // needed. Per-column/row width dragging and cell merge are both
  // deliberately out of scope for this first cut.
  tableRows?: number;
  tableCols?: number;
  // Each row wraps its cells in an object (`{ cells: [...] }`) rather than
  // storing `tableCells` as a plain `string[][]` — Firestore's `setDoc`
  // rejects literal nested arrays outright ("Nested arrays are not
  // supported"), the same reason `pathHoles`/`pieSegments` are arrays of
  // objects-that-contain-arrays rather than raw nested arrays. Plain text
  // only (no per-cell rich formatting) to keep this first cut proportionate;
  // ragged/undefined rows or cells render blank.
  tableCells?: TableRow[];
  chartType?: 'bar' | 'line';
  chartData?: ChartDataPoint[];
}

export interface TableRow {
  cells: string[];
}

export type DiagramNode = Node<ShapeNodeData>;
