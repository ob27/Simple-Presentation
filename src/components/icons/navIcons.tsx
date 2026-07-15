import type { IconProps } from './iconBase';
import { ICON_STROKE, ICON_VIEWBOX } from './iconBase';

// Back-to-dashboard — a plain back arrow (distinct context from the
// transport-style IconChevronLeft used for page-stepping).
export function IconArrowLeft({ style, className }: IconProps) {
  return (
    <svg data-icon="arrow-left" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

// Presenter View button — a notes card with lines + a small speech-tail,
// replacing the poorly-fitting bell (NotificationOutlined).
export function IconPresenterNotes({ style, className }: IconProps) {
  return (
    <svg data-icon="presenter-notes" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="4" width="17" height="12" rx="1.5" />
      <path d="M7 8h10M7 11.5h6" />
      <path d="M9 16l-1.5 4 4-4" />
    </svg>
  );
}

export function IconLogout({ style, className }: IconProps) {
  return (
    <svg data-icon="logout" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4" />
      <path d="M15 8l4 4-4 4M19 12H9" />
    </svg>
  );
}

export function IconShare({ style, className }: IconProps) {
  return (
    <svg data-icon="share" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="12" r="2.4" />
      <circle cx="18" cy="5.5" r="2.4" />
      <circle cx="18" cy="18.5" r="2.4" />
      <path d="M8.1 10.7l7.8-4.4M8.1 13.3l7.8 4.4" />
    </svg>
  );
}

export function IconFolder({ style, className }: IconProps) {
  return (
    <svg data-icon="folder" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6.5a1 1 0 0 1 1-1h5l2 2.5h9a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6.5z" />
    </svg>
  );
}

export function IconFolderOpen({ style, className }: IconProps) {
  return (
    <svg data-icon="folder-open" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7.5a1 1 0 0 1 1-1h5l2 2.5h8a1 1 0 0 1 1 1v.5H5.5a1 1 0 0 0-1 .8L3 18V7.5z" />
      <path d="M3 18l1.6-6.8a1 1 0 0 1 1-.8H21l-1.8 6.9a1 1 0 0 1-1 .7H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

export function IconFolderAdd({ style, className }: IconProps) {
  return (
    <svg data-icon="folder-add" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6.5a1 1 0 0 1 1-1h5l2 2.5h9a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6.5z" />
      <path d="M12 12v5M9.5 14.5h5" />
    </svg>
  );
}

export function IconTeam({ style, className }: IconProps) {
  return (
    <svg data-icon="team" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <circle cx="17.5" cy="9" r="2.3" />
      <path d="M15.5 14.2c2.4.3 4 2.2 4 5.3" />
    </svg>
  );
}

export function IconMore({ style, className }: IconProps) {
  return (
    <svg data-icon="more" viewBox={ICON_VIEWBOX} width="1em" height="1em" style={style} className={className}>
      <circle cx="5" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="19" cy="12" r="1.8" fill="currentColor" />
    </svg>
  );
}
