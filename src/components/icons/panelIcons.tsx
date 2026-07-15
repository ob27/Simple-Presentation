import type { IconProps } from './iconBase';
import { ICON_STROKE, ICON_VIEWBOX } from './iconBase';

// Layers panel toggle — 3 stacked offset sheets, the universal
// Photoshop/Figma/Sketch "layers" glyph. No longer shares BlockOutlined
// with Boolean Intersect (see alignIcons.tsx).
export function IconLayers({ style, className }: IconProps) {
  return (
    <svg data-icon="layers" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 12l9 5 9-5" />
      <path d="M3 16l9 5 9-5" />
    </svg>
  );
}

// Branch highlight — one node splitting into two downstream paths.
export function IconBranchHighlight({ style, className }: IconProps) {
  return (
    <svg data-icon="branch-highlight" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4v7" />
      <path d="M6 11c0 3 2.5 3 4 3h4" />
      <path d="M6 11v9" />
      <circle cx="6" cy="4" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="18" cy="14" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="6" cy="20" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Animation panel toggle — a timeline of steps ending in a play triangle.
export function IconAnimationPanel({ style, className }: IconProps) {
  return (
    <svg data-icon="animation-panel" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h11" strokeDasharray="0.1 4" />
      <circle cx="7" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="13" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <path d="M17 7.5l5 4.5-5 4.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Data / Variables panel toggle — a database cylinder (variable
// definitions). Distinct from IconDataBinding used on the per-shape tab.
export function IconVariables({ style, className }: IconProps) {
  return (
    <svg data-icon="variables" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="6" rx="7" ry="2.6" />
      <path d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6" />
      <path d="M5 12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6" />
    </svg>
  );
}

// Data binding — a tag with a small link, for the per-shape Data tab
// (binding a shape's style to a variable). Distinct from IconVariables.
export function IconDataBinding({ style, className }: IconProps) {
  return (
    <svg data-icon="data-binding" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h8l10 10-8 8L3 11V3z" />
      <circle cx="7.5" cy="7.5" r="1.4" fill="currentColor" stroke="none" />
      <path d="M14 17l3-3 3 3-3 3z" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Check Diagram / Validation panel toggle — a checklist.
export function IconValidation({ style, className }: IconProps) {
  return (
    <svg data-icon="validation" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3" width="17" height="18" rx="1.5" />
      <path d="M6.5 8l1.3 1.3L10 6.7" />
      <path d="M6.5 13.5l1.3 1.3L10 12.2" />
      <path d="M6.5 19l1.3 1.3L10 17.7" />
      <path d="M12.5 8h5M12.5 13.5h5M12.5 19h5" />
    </svg>
  );
}

// Grid & rulers popover — an L-shaped ruler with tick marks, not a
// spreadsheet table (the app has a real Table shape kind elsewhere).
export function IconRulerGrid({ style, className }: IconProps) {
  return (
    <svg data-icon="ruler-grid" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 3.5h17M3.5 3.5v17" />
      <path d="M6.5 3.5v2M9.5 3.5v3M12.5 3.5v2M15.5 3.5v3M18.5 3.5v2" />
      <path d="M3.5 6.5h2M3.5 9.5h3M3.5 12.5h2M3.5 15.5h3M3.5 18.5h2" />
      <path d="M9.5 20.5v-9h9" opacity="0.4" />
    </svg>
  );
}

// Tags popover — a price-tag glyph, with a second tag peeking out behind
// to suggest "tags" (plural).
export function IconTags({ style, className }: IconProps) {
  return (
    <svg data-icon="tags" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4h6l6 6-8 8-8-8V4z" opacity="0.45" />
      <path d="M3 3h6l6 6-8 8-4-4V3z" />
      <circle cx="6.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Export modal trigger — an arrow into an open tray.
export function IconExport({ style, className }: IconProps) {
  return (
    <svg data-icon="export" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v11" />
      <path d="M7.5 10.5L12 15l4.5-4.5" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

// Shortcuts help — a question mark in a circle.
export function IconHelp({ style, className }: IconProps) {
  return (
    <svg data-icon="help" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.3 9.3a2.8 2.8 0 1 1 3.9 2.6c-.9.4-1.5 1.1-1.5 2.1v.3" />
      <circle cx="12" cy="17.2" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Contextual info tooltip trigger — an "i" in a circle, distinct from the
// help icon's "?" (that one opens the Shortcuts modal; this one just
// explains the thing it's next to).
export function IconInfo({ style, className }: IconProps) {
  return (
    <svg data-icon="info" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
