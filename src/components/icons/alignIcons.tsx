import { useId } from 'react';
import type { IconProps } from './iconBase';
import { ICON_STROKE, ICON_VIEWBOX } from './iconBase';

// ── Align (horizontal) ───────────────────────────────────────────────────────
export function IconAlignLeft({ style, className }: IconProps) {
  return (
    <svg data-icon="align-left" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className}>
      <line x1="4" y1="3" x2="4" y2="21" stroke="currentColor" strokeWidth={ICON_STROKE} />
      <rect x="6" y="6" width="10" height="3" rx="0.8" fill="currentColor" />
      <rect x="6" y="11" width="14" height="3" rx="0.8" fill="currentColor" />
      <rect x="6" y="16" width="7" height="3" rx="0.8" fill="currentColor" />
    </svg>
  );
}

export function IconAlignCenter({ style, className }: IconProps) {
  return (
    <svg data-icon="align-center" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className}>
      <line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" strokeWidth={ICON_STROKE} />
      <rect x="7" y="6" width="10" height="3" rx="0.8" fill="currentColor" />
      <rect x="5" y="11" width="14" height="3" rx="0.8" fill="currentColor" />
      <rect x="8.5" y="16" width="7" height="3" rx="0.8" fill="currentColor" />
    </svg>
  );
}

export function IconAlignRight({ style, className }: IconProps) {
  return (
    <svg data-icon="align-right" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className}>
      <line x1="20" y1="3" x2="20" y2="21" stroke="currentColor" strokeWidth={ICON_STROKE} />
      <rect x="8" y="6" width="10" height="3" rx="0.8" fill="currentColor" />
      <rect x="4" y="11" width="14" height="3" rx="0.8" fill="currentColor" />
      <rect x="11" y="16" width="7" height="3" rx="0.8" fill="currentColor" />
    </svg>
  );
}

// ── Align (vertical) ─────────────────────────────────────────────────────────
export function IconAlignTop({ style, className }: IconProps) {
  return (
    <svg data-icon="align-top" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className}>
      <line x1="3" y1="4" x2="21" y2="4" stroke="currentColor" strokeWidth={ICON_STROKE} />
      <rect x="6" y="6" width="3" height="10" rx="0.8" fill="currentColor" />
      <rect x="11" y="6" width="3" height="14" rx="0.8" fill="currentColor" />
      <rect x="16" y="6" width="3" height="7" rx="0.8" fill="currentColor" />
    </svg>
  );
}

export function IconAlignMiddle({ style, className }: IconProps) {
  return (
    <svg data-icon="align-middle" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className}>
      <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth={ICON_STROKE} />
      <rect x="6" y="7" width="3" height="10" rx="0.8" fill="currentColor" />
      <rect x="11" y="5" width="3" height="14" rx="0.8" fill="currentColor" />
      <rect x="16" y="8.5" width="3" height="7" rx="0.8" fill="currentColor" />
    </svg>
  );
}

export function IconAlignBottom({ style, className }: IconProps) {
  return (
    <svg data-icon="align-bottom" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className}>
      <line x1="3" y1="20" x2="21" y2="20" stroke="currentColor" strokeWidth={ICON_STROKE} />
      <rect x="6" y="8" width="3" height="10" rx="0.8" fill="currentColor" />
      <rect x="11" y="4" width="3" height="14" rx="0.8" fill="currentColor" />
      <rect x="16" y="11" width="3" height="7" rx="0.8" fill="currentColor" />
    </svg>
  );
}

// ── Distribute ───────────────────────────────────────────────────────────────
export function IconDistributeH({ style, className }: IconProps) {
  return (
    <svg data-icon="distribute-h" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className}>
      <rect x="3" y="5" width="3" height="14" rx="0.8" fill="currentColor" />
      <rect x="10.5" y="5" width="3" height="14" rx="0.8" fill="currentColor" />
      <rect x="18" y="5" width="3" height="14" rx="0.8" fill="currentColor" />
      <path d="M6.3 12h4M13.7 12h4" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeDasharray="1.6 1.6" />
    </svg>
  );
}

export function IconDistributeV({ style, className }: IconProps) {
  return (
    <svg data-icon="distribute-v" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className}>
      <rect x="5" y="3" width="14" height="3" rx="0.8" fill="currentColor" />
      <rect x="5" y="10.5" width="14" height="3" rx="0.8" fill="currentColor" />
      <rect x="5" y="18" width="14" height="3" rx="0.8" fill="currentColor" />
      <path d="M12 6.3v4M12 13.7v4" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeDasharray="1.6 1.6" />
    </svg>
  );
}

// ── Boolean path operations ──────────────────────────────────────────────────
// A proper 4-member Venn-diagram set (two overlapping circles, shaded
// differently per operation) matching Illustrator/Figma Pathfinder
// iconography — resolves the audit's flagged BlockOutlined/CloseCircleOutlined
// collisions, since Intersect/Exclude no longer reuse Layers/Exit's icons.
const CIRCLE_A = { cx: 9, cy: 12, r: 7 };
const CIRCLE_B = { cx: 15, cy: 12, r: 7 };

export function IconBooleanUnion({ style, className }: IconProps) {
  return (
    <svg data-icon="boolean-union" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className}>
      <circle {...CIRCLE_A} fill="currentColor" />
      <circle {...CIRCLE_B} fill="currentColor" />
    </svg>
  );
}

export function IconBooleanSubtract({ style, className }: IconProps) {
  const id = useId();
  return (
    <svg data-icon="boolean-subtract" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className}>
      <defs>
        <mask id={id}>
          <rect x="0" y="0" width="24" height="24" fill="white" />
          <circle {...CIRCLE_B} fill="black" />
        </mask>
      </defs>
      <circle {...CIRCLE_A} fill="currentColor" mask={`url(#${id})`} />
      <circle {...CIRCLE_B} fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.45" />
    </svg>
  );
}

export function IconBooleanIntersect({ style, className }: IconProps) {
  const id = useId();
  return (
    <svg data-icon="boolean-intersect" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className}>
      <defs>
        <mask id={id}>
          <rect x="0" y="0" width="24" height="24" fill="black" />
          <circle {...CIRCLE_B} fill="white" />
        </mask>
      </defs>
      <circle {...CIRCLE_A} fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.45" />
      <circle {...CIRCLE_B} fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.45" />
      <circle {...CIRCLE_A} fill="currentColor" mask={`url(#${id})`} />
    </svg>
  );
}

export function IconBooleanExclude({ style, className }: IconProps) {
  const idA = useId();
  const idB = useId();
  return (
    <svg data-icon="boolean-exclude" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className}>
      <defs>
        <mask id={idA}>
          <rect x="0" y="0" width="24" height="24" fill="white" />
          <circle {...CIRCLE_B} fill="black" />
        </mask>
        <mask id={idB}>
          <rect x="0" y="0" width="24" height="24" fill="white" />
          <circle {...CIRCLE_A} fill="black" />
        </mask>
      </defs>
      <circle {...CIRCLE_A} fill="currentColor" mask={`url(#${idA})`} />
      <circle {...CIRCLE_B} fill="currentColor" mask={`url(#${idB})`} />
    </svg>
  );
}

// ── Table row/column ops ─────────────────────────────────────────────────────
export function IconAddRow({ style, className }: IconProps) {
  return (
    <svg data-icon="add-row" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="10" rx="1" />
      <path d="M3 9h18" />
      <path d="M12 17v5M9.5 19.5h5" />
    </svg>
  );
}

export function IconRemoveRow({ style, className }: IconProps) {
  return (
    <svg data-icon="remove-row" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="10" rx="1" />
      <path d="M3 9h18" />
      <path d="M9.5 19.5h5" />
    </svg>
  );
}

export function IconAddColumn({ style, className }: IconProps) {
  return (
    <svg data-icon="add-column" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="14" height="16" rx="1" />
      <path d="M10 4v16" />
      <path d="M20 9v5M17.5 11.5h5" />
    </svg>
  );
}

export function IconRemoveColumn({ style, className }: IconProps) {
  return (
    <svg data-icon="remove-column" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="14" height="16" rx="1" />
      <path d="M10 4v16" />
      <path d="M17.5 11.5h5" />
    </svg>
  );
}

// ── Group / Ungroup ──────────────────────────────────────────────────────────
// Plain bounding box with corner tick-marks, no fill — "organize only".
// Distinct from IconContainer (toolIcons.tsx), which has a shaded header
// band evoking a real styleable frame.
export function IconGroup({ style, className }: IconProps) {
  return (
    <svg data-icon="group" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
      <rect x="7" y="7" width="10" height="10" rx="1" strokeDasharray="2.5 2" />
    </svg>
  );
}

export function IconUngroup({ style, className }: IconProps) {
  return (
    <svg data-icon="ungroup" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8V4h4M20 8V4h-4" />
      <path d="M3 16v4h4M20 16v4h-4" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}

// ── Front/back, duplicate ────────────────────────────────────────────────────
export function IconBringToFront({ style, className }: IconProps) {
  return (
    <svg data-icon="bring-to-front" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="12" height="12" rx="1" opacity="0.4" />
      <rect x="9" y="9" width="12" height="12" rx="1" fill="currentColor" fillOpacity="0.15" />
    </svg>
  );
}

export function IconSendToBack({ style, className }: IconProps) {
  return (
    <svg data-icon="send-to-back" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="1" opacity="0.4" />
      <rect x="3" y="3" width="12" height="12" rx="1" fill="currentColor" fillOpacity="0.15" />
    </svg>
  );
}

export function IconDuplicate({ style, className }: IconProps) {
  return (
    <svg data-icon="duplicate" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="8" width="12" height="12" rx="1.5" />
      <path d="M5.5 15.5H4.5A1.5 1.5 0 0 1 3 14V4.5A1.5 1.5 0 0 1 4.5 3H14a1.5 1.5 0 0 1 1.5 1.5v1" />
    </svg>
  );
}

// ── Fullscreen / fill-screen / settings ──────────────────────────────────────
export function IconFullscreenEnter({ style, className }: IconProps) {
  return (
    <svg data-icon="fullscreen-enter" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}

export function IconFullscreenExit({ style, className }: IconProps) {
  return (
    <svg data-icon="fullscreen-exit" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </svg>
  );
}

// "Fill screen" (skip device frame) — outward arrows touching a frame edge,
// deliberately distinct from IconContainer's shaded-box look.
export function IconFillScreen({ style, className }: IconProps) {
  return (
    <svg data-icon="fill-screen" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="2.5 2" />
      <path d="M9 12h6M9 12l2-2M9 12l2 2M15 12l-2-2M15 12l-2 2" />
    </svg>
  );
}

export function IconSettingsGear({ style, className }: IconProps) {
  return (
    <svg data-icon="settings-gear" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M21 12h-2.5M5.5 12H3M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4L5.6 5.6" />
    </svg>
  );
}

// ── Page-nav chevrons / tree disclosure ──────────────────────────────────────
export function IconChevronLeft({ style, className }: IconProps) {
  return (
    <svg data-icon="chevron-left" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function IconChevronRight({ style, className }: IconProps) {
  return (
    <svg data-icon="chevron-right" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function IconChevronDown({ style, className }: IconProps) {
  return (
    <svg data-icon="chevron-down" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 9l7 7 7-7" />
    </svg>
  );
}

// Tiny inline tree-row disclosure triangle — deliberately its own small
// component, separate from IconPlay's transport-control weight, resolving
// the CaretRightOutlined collision found in the audit.
export function IconDisclosureTriangle({ style, className }: IconProps) {
  return (
    <svg data-icon="disclosure-triangle" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className}>
      <path d="M9 6l7 6-7 6z" fill="currentColor" />
    </svg>
  );
}

// ── Reorder (shared: LayersPanel rows + AnimationPanel sequence items) ───────
export function IconMoveUp({ style, className }: IconProps) {
  return (
    <svg data-icon="move-up" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V6M6 11l6-6 6 6" />
    </svg>
  );
}

export function IconMoveDown({ style, className }: IconProps) {
  return (
    <svg data-icon="move-down" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v13M6 13l6 6 6-6" />
    </svg>
  );
}

// ── Indent / Outdent (LayersPanel) ───────────────────────────────────────────
// Directionally-correct pair (the antd MenuFold/Unfold pairing used before
// this was backwards vs. conventional meaning — see audit finding #5).
export function IconIndent({ style, className }: IconProps) {
  return (
    <svg data-icon="indent" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16M4 19h16M4 12h9" />
      <path d="M10 9l3 3-3 3" />
    </svg>
  );
}

export function IconOutdent({ style, className }: IconProps) {
  return (
    <svg data-icon="outdent" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16M4 19h16M7 12h9" />
      <path d="M13 9l-3 3 3 3" />
    </svg>
  );
}

// ── Animation-panel transport controls ───────────────────────────────────────
export function IconStepBack({ style, className }: IconProps) {
  return (
    <svg data-icon="step-back" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className}>
      <rect x="4" y="5" width="2" height="14" rx="0.5" fill="currentColor" />
      <path d="M18 5.5v13L8 12z" fill="currentColor" />
    </svg>
  );
}

export function IconStepForward({ style, className }: IconProps) {
  return (
    <svg data-icon="step-forward" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className}>
      <rect x="18" y="5" width="2" height="14" rx="0.5" fill="currentColor" />
      <path d="M6 5.5v13l10-6.5z" fill="currentColor" />
    </svg>
  );
}

// Primary "Play next step" transport button — a solid triangle in a rounded
// square, distinct from the tiny inline IconDisclosureTriangle.
export function IconPlay({ style, className }: IconProps) {
  return (
    <svg data-icon="play" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className}>
      <rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} />
      <path d="M9.5 7.5l8 4.5-8 4.5z" fill="currentColor" />
    </svg>
  );
}

// "Present" primary button — larger-weight solid play-in-circle, distinct
// from the Animation panel's rounded-square IconPlay.
export function IconPlayCircle({ style, className }: IconProps) {
  return (
    <svg data-icon="play-circle" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} />
      <path d="M10 8l7 4-7 4z" fill="currentColor" />
    </svg>
  );
}
