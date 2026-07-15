import type { IconProps } from './iconBase';
import { ICON_STROKE, ICON_VIEWBOX } from './iconBase';

// Select tool — a solid pointer/cursor arrow.
export function IconSelect({ style, className }: IconProps) {
  return (
    <svg data-icon="select" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className}>
      <path d="M5 3l14 8-6 1.6 3 6-2.4 1.2-3-6L6 19V3z" fill="currentColor" />
    </svg>
  );
}

// Shape gallery — a 2x2 cluster of distinct basic shapes (circle, square,
// triangle, diamond), literally evoking "a grid of shapes to pick from".
export function IconShapes({ style, className }: IconProps) {
  return (
    <svg data-icon="shapes" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="3.5" />
      <rect x="13" y="3.5" width="7" height="7" rx="1" />
      <polygon points="7,13.5 10.5,20.5 3.5,20.5" />
      <polygon points="17,13.5 20.5,17 17,20.5 13.5,17" />
    </svg>
  );
}

// Pen tool — an angled fountain-pen nib with a small anchor-point dot at
// the tip, the classic bezier pen-tool signifier from vector editors.
export function IconPenTool({ style, className }: IconProps) {
  return (
    <svg data-icon="pen-tool" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20l2-6L16 4l4 4L10 18l-6 2z" />
      <path d="M14 6l4 4" />
      <circle cx="18.5" cy="5.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Brush tool. Earlier attempts either read as too abstract (a bare
// diagonal line + soft blob) or, once given a thicker collar, read as a
// screwdriver/chisel instead (a rounded-stub tip doesn't say "bristles").
// This version keeps the same three-part anatomy — handle, collar, tip —
// but the tip is a straight-edged wedge that actually comes to a point
// (a screwdriver's tip is blunt; a brush's is not), and the collar is a
// thin band rather than a block matching the tip's own width.
export function IconBrush({ style, className }: IconProps) {
  return (
    <svg data-icon="brush" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18.5 3.5 L13.5 8.5" />
      <path d="M11.7 6.7 L15.3 10.3" strokeWidth={2.4} />
      <polygon points="15.3,10.3 3.2,18.8 11.7,6.7" fill="currentColor" stroke="none" />
      <circle cx="3.2" cy="18.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Direct Selection — a hollow pointer beside a small square anchor-point
// handle, the classic Illustrator/Figma "white arrow" glyph. Deliberately
// distinct from both Select (solid arrow) and Connector (two joined nodes).
export function IconDirectSelect({ style, className }: IconProps) {
  return (
    <svg data-icon="direct-select" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 3l9 5.5-3.5 1.3L12 15l-1.8.9-2.5-5.2L5 13z" />
      <rect x="14.5" y="13.5" width="5" height="5" rx="1" />
    </svg>
  );
}

// Arrow / Connect tool — two nodes joined by a line with an arrowhead,
// literally "connecting two points" rather than a generic arrow.
export function IconConnector({ style, className }: IconProps) {
  return (
    <svg data-icon="connector" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="19" r="2.1" />
      <circle cx="19" cy="5" r="2.1" />
      <path d="M7 17L16 8" />
      <path d="M12 8h4v4" />
    </svg>
  );
}

// Hotspot — a target/crosshair, redrawn in the shared stroke style.
export function IconHotspot({ style, className }: IconProps) {
  return (
    <svg data-icon="hotspot" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
    </svg>
  );
}

// Container tool — a box with a shaded header band, evoking a styleable
// frame (as opposed to Group's plain, unfilled bounding box).
export function IconContainer({ style, className }: IconProps) {
  return (
    <svg data-icon="container" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className}>
      <rect x="4" y="4" width="16" height="5" rx="1.5" fill="currentColor" fillOpacity="0.3" />
      <rect x="4" y="4" width="16" height="16" rx="1.5" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinejoin="round" />
      <line x1="4" y1="9" x2="20" y2="9" stroke="currentColor" strokeWidth={ICON_STROKE} />
    </svg>
  );
}

// Comment tool — a speech bubble. Shared with the unresolved comment-pin
// glyph (CommentPinNode.tsx) since it's the same concept.
export function IconComment({ style, className }: IconProps) {
  return (
    <svg data-icon="comment" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 4V6z" />
    </svg>
  );
}

// Style Paint ("format painter") — a paint roller (drum + handle), distinct
// from the Brush tool's angled fountain-brush-nib glyph.
export function IconStylePaint({ style, className }: IconProps) {
  return (
    <svg data-icon="style-paint" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="14" height="7" rx="1.5" />
      <rect x="8" y="11" width="4" height="4" />
      <path d="M10 15v4" />
      <circle cx="10" cy="20.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Image / picture — frame + sun + mountains, the classic "image" glyph.
// Shared with LayersPanel's image-row indicator and Dashboard's folder-icon
// upload button (same underlying concept: a picture).
export function IconImage({ style, className }: IconProps) {
  return (
    <svg data-icon="image" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <circle cx="8.5" cy="9.5" r="1.8" fill="currentColor" stroke="none" />
      <path d="M3.5 17l5-5 4 4 3-3 6.5 6.5" />
    </svg>
  );
}
