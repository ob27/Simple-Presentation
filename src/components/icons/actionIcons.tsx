import type { IconProps } from './iconBase';
import { ICON_STROKE, ICON_VIEWBOX } from './iconBase';

// Generic close (X) — panels/tabs/modals. Distinct from IconExit, which is
// reserved for "leave presentation / leave a full-screen mode".
export function IconClose({ style, className }: IconProps) {
  return (
    <svg data-icon="close" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}

// Exit presentation / presenter view — an X inside a circle, distinct from
// both plain Close and Boolean Exclude (which now has its own Venn icon).
export function IconExit({ style, className }: IconProps) {
  return (
    <svg data-icon="exit" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  );
}

// Generic delete — a trash can. Used everywhere a delete action is
// permanent (shapes, pages, versions, members, variables, replies).
export function IconDelete({ style, className }: IconProps) {
  return (
    <svg data-icon="delete" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
      <path d="M6 7l1 13a1.5 1.5 0 0 0 1.5 1.4h7a1.5 1.5 0 0 0 1.5-1.4L18 7" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

// Generic add — a plus.
export function IconAdd({ style, className }: IconProps) {
  return (
    <svg data-icon="add" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v16M4 12h16" />
    </svg>
  );
}

// Remove-from-sequence — a minus in a circle, distinct from IconDelete
// (removing from an ordered list is not a permanent delete).
export function IconRemoveCircle({ style, className }: IconProps) {
  return (
    <svg data-icon="remove-circle" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </svg>
  );
}

// Generic check — resolve / save-edit / resolved comment pin.
export function IconCheck({ style, className }: IconProps) {
  return (
    <svg data-icon="check" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 12.5l5 5L20 7" />
    </svg>
  );
}

// Validation-issue marker — a warning triangle.
export function IconWarning({ style, className }: IconProps) {
  return (
    <svg data-icon="warning" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5L21.5 20h-19L12 3.5z" />
      <path d="M12 9.5v4.5" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Generic edit/rename — a pencil. Distinct from the Pen *tool* (IconPenTool
// in toolIcons.tsx, a fountain-pen nib) and from IconPathShape below.
export function IconPencil({ style, className }: IconProps) {
  return (
    <svg data-icon="pencil" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 4l5 5-11 11H4v-5L15 4z" />
      <path d="M13 6l5 5" />
    </svg>
  );
}

// LayersPanel path-kind row indicator — a small bezier curve with two
// anchor points, distinct from both the Pen tool and the generic pencil.
export function IconPathShape({ style, className }: IconProps) {
  return (
    <svg data-icon="path-shape" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 18c4-10 12-10 16-2" />
      <circle cx="4" cy="18" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="20" cy="16" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Save version — a floppy disk. Deliberately kept as one of the few pure
// UI-idiom glyphs with no better real-world object to draw from.
export function IconSave({ style, className }: IconProps) {
  return (
    <svg data-icon="save" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M8 3v6h8V3" />
      <rect x="7.5" y="13.5" width="9" height="6.5" />
    </svg>
  );
}

// Lock / unlock toggle.
export function IconLock({ style, className }: IconProps) {
  return (
    <svg data-icon="lock" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="1.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function IconUnlock({ style, className }: IconProps) {
  return (
    <svg data-icon="unlock" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="1.5" />
      <path d="M8 11V7a4 4 0 0 1 7.5-2" />
    </svg>
  );
}

// Show/hide (visibility) toggle.
export function IconEyeOpen({ style, className }: IconProps) {
  return (
    <svg data-icon="eye-open" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

export function IconEyeClosed({ style, className }: IconProps) {
  return (
    <svg data-icon="eye-closed" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18" />
      <path d="M6.4 6.6C4 8.3 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.5 4.5-1.1M9.9 5.2c.7-.1 1.4-.2 2.1-.2 6.5 0 10 7 10 7s-.8 1.6-2.3 3.2" />
      <path d="M9.5 9.7a2.6 2.6 0 0 0 3.7 3.7" />
    </svg>
  );
}

// Favorite toggle (shape gallery cards, favorites quick-access panel) — a
// plain 5-point star outline. Distinct from the "star" placeable SHAPE kind
// in ShapeSwatch/SHAPE_CATALOG, which is diagram content, not UI chrome.
export function IconStar({ style, className }: IconProps) {
  return (
    <svg data-icon="star" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l2.6 5.8 6.2.6-4.7 4.2 1.4 6.2L12 16.8 6.5 19.8l1.4-6.2-4.7-4.2 6.2-.6z" />
    </svg>
  );
}

export function IconStarFilled({ style, className }: IconProps) {
  return (
    <svg data-icon="star-filled" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="currentColor" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l2.6 5.8 6.2.6-4.7 4.2 1.4 6.2L12 16.8 6.5 19.8l1.4-6.2-4.7-4.2 6.2-.6z" />
    </svg>
  );
}

// CSV import — an arrow into an upload target (direction/style distinct
// from IconExport's downward arrow into a tray).
export function IconUpload({ style, className }: IconProps) {
  return (
    <svg data-icon="upload" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20V9" />
      <path d="M7.5 13.5L12 9l4.5 4.5" />
      <path d="M4 4h16" />
    </svg>
  );
}

// Post comment/reply — a paper airplane.
export function IconSend({ style, className }: IconProps) {
  return (
    <svg data-icon="send" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 3L3 10.5l7 2.5 2.5 7L21 3z" />
      <path d="M12.5 13.5L21 3" />
    </svg>
  );
}

// Screen eyedropper (ColorPickerField).
export function IconEyedropper({ style, className }: IconProps) {
  return (
    <svg data-icon="eyedropper" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3l5 5-3.5 3.5-5-5L16 3z" />
      <path d="M12.5 6.5L4 15v4.5h4.5L17 10.5" />
      <path d="M4 19.5L6 21" />
    </svg>
  );
}

// Version history — a clock with a counter-clockwise sweep arrow. Shared
// between VersionHistoryModal's row marker and DocumentEditor's header
// button.
export function IconHistory({ style, className }: IconProps) {
  return (
    <svg data-icon="history" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8a9 9 0 1 1 1.8 9" />
      <path d="M3 3v5h5" />
      <path d="M12 8v4.5l3 2" />
    </svg>
  );
}

// "Start blank" template card / "save as template" — a blank page with a
// plus-badge corner. Shared between TemplateGalleryModal and Dashboard.
export function IconFileAdd({ style, className }: IconProps) {
  return (
    <svg data-icon="file-add" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h9l4 4v14H6V3z" />
      <path d="M15 3v4h4" />
      <path d="M12 13v6M9 16h6" />
    </svg>
  );
}

// Person-silhouette fallback avatar — shared between FolderMembersModal's
// member row and ShapeSwatch's UML Actor preview glyph.
export function IconPersonFallback({ style, className }: IconProps) {
  return (
    <svg data-icon="person-fallback" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  );
}

// Chain-link — Link tab + ShapeNode's "follow link" badge.
export function IconLink({ style, className }: IconProps) {
  return (
    <svg data-icon="link" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 14.5l5-5" />
      <path d="M11 6.5l1.4-1.4a3.5 3.5 0 0 1 5 5L16 11.5" />
      <path d="M13 17.5l-1.4 1.4a3.5 3.5 0 0 1-5-5L8 12.5" />
    </svg>
  );
}

// Undo / Redo — counter-clockwise / clockwise curved arrows.
export function IconUndo({ style, className }: IconProps) {
  return (
    <svg data-icon="undo" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 4L4 8l4 4" />
      <path d="M4 8h9a7 7 0 1 1-6.4 9.8" />
    </svg>
  );
}

export function IconRedo({ style, className }: IconProps) {
  return (
    <svg data-icon="redo" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4l4 4-4 4" />
      <path d="M20 8h-9a7 7 0 1 0 6.4 9.8" />
    </svg>
  );
}

// Animation-panel "Reset sequence" — rewinds to BEFORE step 0, so this is
// a VCR-style rewind/restart glyph (bar + left triangle), not another
// Redo. Resolves the RedoOutlined collision found in the audit.
export function IconRewindReset({ style, className }: IconProps) {
  return (
    <svg data-icon="rewind-reset" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className}>
      <rect x="4" y="5" width="2.2" height="14" rx="0.5" fill="currentColor" />
      <path d="M19.5 5.5v13L8.5 12.5z" fill="currentColor" />
    </svg>
  );
}
