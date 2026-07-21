import type { IconProps } from './iconBase';
import { ICON_STROKE, ICON_VIEWBOX } from './iconBase';

// Shared between ShapePropertiesPanel's Text tab and RichTextEditor's
// floating toolbar (same concept both places).
export function IconBold({ style, className }: IconProps) {
  return (
    <svg data-icon="bold" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h6.5a3.5 3.5 0 0 1 0 7H7z" />
      <path d="M7 11h7a3.5 3.5 0 0 1 0 7H7z" />
    </svg>
  );
}

// Toolbar entry point for placing a Text-kind shape — distinct from IconBold/
// IconItalic/etc. above (those style existing text), this is the "add text"
// tool button itself.
export function IconTextTool({ style, className }: IconProps) {
  return (
    <svg data-icon="text-tool" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 6h14M12 6v13" />
    </svg>
  );
}

export function IconItalic({ style, className }: IconProps) {
  return (
    <svg data-icon="italic" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4h7M6 20h7M14 4L10 20" />
    </svg>
  );
}

export function IconUnderline({ style, className }: IconProps) {
  return (
    <svg data-icon="underline" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4v7a6 6 0 0 0 12 0V4" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function IconStrikethrough({ style, className }: IconProps) {
  return (
    <svg data-icon="strikethrough" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 6c1-1.5 3-2 5.5-2 3 0 5 1 5 3" />
      <path d="M7 18c1 1.5 3 2 5.5 2 3 0 5.5-1 5.5-3.2 0-1.5-1-2.5-2.5-3" />
      <path d="M4 12h16" />
    </svg>
  );
}

export function IconLineHeight({ style, className }: IconProps) {
  return (
    <svg data-icon="line-height" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4v16M5 7l4-3 4 3M5 17l4 3 4-3" />
      <path d="M14 6h6M14 12h6M14 18h6" />
    </svg>
  );
}

// Four full-width lines — actually evokes "justified" text, unlike the
// hamburger-menu glyph it replaces.
export function IconJustify({ style, className }: IconProps) {
  return (
    <svg data-icon="justify" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 11h16M4 16h16M4 21h16" />
    </svg>
  );
}

export function IconUnorderedList({ style, className }: IconProps) {
  return (
    <svg data-icon="unordered-list" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none" />
      <path d="M9 6h11M9 12h11M9 18h11" />
    </svg>
  );
}

export function IconOrderedList({ style, className }: IconProps) {
  return (
    <svg data-icon="ordered-list" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6h11M9 12h11M9 18h11" />
      <text x="2" y="8" fontSize="6" fill="currentColor" stroke="none">1</text>
      <text x="2" y="14" fontSize="6" fill="currentColor" stroke="none">2</text>
      <text x="2" y="20" fontSize="6" fill="currentColor" stroke="none">3</text>
    </svg>
  );
}

export function IconFontSize({ style, className }: IconProps) {
  return (
    <svg data-icon="font-size" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 19L10 5l5 14M6.5 14.5h7" />
      <path d="M17 19v-7M14.5 14l2.5-2.5 2.5 2.5" />
    </svg>
  );
}

// Shared between ShapePropertiesPanel's Video tab and ShapeStampCursor's
// video-placement cursor stamp.
export function IconVideoCamera({ style, className }: IconProps) {
  return (
    <svg data-icon="video-camera" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="12" height="12" rx="1.5" />
      <path d="M15 10l6-3v10l-6-3z" />
    </svg>
  );
}
