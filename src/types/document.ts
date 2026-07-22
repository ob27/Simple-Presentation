// A preset id from FRAME_PRESETS (src/utils/paperSizes.ts), e.g. 'a4', 'iphone-15', 'custom'.
// Kept as a plain string (not a closed union) so new presets can be added without a migration.
export type PaperSize = string;
export type Orientation = 'portrait' | 'landscape';

// 'plain' -> "3", 'page-prefix' -> "Page 3", 'of-total' -> "3 of 12".
export type PageNumberStyle = 'plain' | 'page-prefix' | 'of-total';
export type PageNumberPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface DiagramPage {
  id: string;
  name: string;
  order: number;
  paperSize: PaperSize;
  orientation: Orientation;
  customWidth?: number;
  customHeight?: number;
  backgroundColor?: string;
  // All in mm, shown as dashed guides on the page — purely visual, nothing
  // clips or snaps to them. 0/undefined means no guide on that edge.
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  // Rendered at the top/bottom of the page; `{page}` and `{pages}` are
  // substituted with this page's 1-based index and the document's total
  // page count at render time, so the same text works across every page.
  headerText?: string;
  footerText?: string;
  // Independent of header/footer text — those already support a manually
  // typed {page}/{pages} token, but this is the dedicated "just show me a
  // page number" toggle: a formatted, positioned number with no text of its
  // own to type or maintain. Not inherited from a master page (unlike
  // background/header/footer) since a page number is inherently specific to
  // the page it's on, not a shared "look".
  pageNumberEnabled?: boolean;
  pageNumberStyle?: PageNumberStyle;
  pageNumberPosition?: PageNumberPosition;
  // Presenter-only text, shown in Presenter View (never rendered on the
  // page itself, and never shown to the audience) — same "plain optional
  // string" convention as header/footer.
  notes?: string;
  // A master page is a normal DiagramPage that's never itself presented,
  // exported, or counted in {page}/{pages} — it exists only to be pointed
  // at by other pages' `masterPageId`. Kept as "just another page in the
  // same subcollection" rather than a new collection/schema so it reuses
  // every bit of existing page CRUD/UI (addPage/updatePage/subscribePages,
  // the settings-form pattern) unchanged.
  isMaster?: boolean;
  // When set, this page inherits backgroundColor/headerText/footerText from
  // the referenced master page for whichever of those it leaves unset
  // itself — same "undefined means fall through" convention already used
  // for this page's own optional fields. It ALSO live-inherits the master's
  // real shape content (Canvas.tsx renders the master's current shapes,
  // translated onto this page, as a locked background layer) — see
  // overriddenMasterShapeIds below for the per-shape opt-out.
  masterPageId?: string;
  // Master-derived shapes render live/locked on this page by default.
  // "Detach from master" clones one specific inherited shape into this
  // page's own `shapes` subcollection and records the ORIGINAL master
  // shape's id here, so that one shape stops being inherited-rendered on
  // THIS page specifically — every other page still using the same master
  // is unaffected, matching Affinity Publisher's per-page master-item
  // override behavior.
  overriddenMasterShapeIds?: string[];
}

export interface PresentationSettings {
  // 'auto' picks a device bezel/monitor/slide treatment per page based on
  // its paper-size category (see utils/presentationFrame.ts); 'none' always
  // presents full-bleed regardless of page size or aspect ratio.
  frameMode: 'auto' | 'none';
  roundedCorners: boolean;
  frameColor: string;
  // Deck-wide, applies to plain next/prev page advance (distinct from a
  // per-hotspot/shape-link's own `transition` in ShapeLink). 'none' (default)
  // keeps the pre-existing behavior exactly: a smooth animated camera pan,
  // except when crossing into/out of a device bezel, which already forces an
  // instant cut + screen-rect flash so the bezel doesn't visibly slide.
  // 'fade' makes every page advance use that same flash+instant-cut
  // treatment, not just bezel changes — true cross-fade "wipe"/"push" style
  // transitions aren't feasible here (all pages share one continuous
  // pannable canvas, not separate mountable frames to slide past each
  // other), so fade is the one deck-wide transition offered.
  pageTransition?: 'none' | 'fade';
}

// A true OS-level dual-monitor "send audience view to screen 2, keep
// presenter view on my laptop" isn't something a web app can drive — no API
// lets JS choose which physical monitor a window lands on. The real
// deliverable is: open a second browser tab/window in presenter mode (the
// user drags it to their second monitor themselves) that stays in sync with
// whichever page/step the main audience-facing window is on, via this one
// small synced field on the diagram doc. Either window can write it
// (advancing from the presenter view's controls moves the audience window
// too, and vice versa); both subscribe to the same diagram doc already.
export interface PresentState {
  pageId: string;
  step: number;
}

export interface DiagramDocument {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail?: string;
  coOwnerIds?: string[];
  memberIds: string[];
  memberEmails?: Record<string, string>;
  viewerIds?: string[];
  inviteToken: string;
  publicShareToken?: string | null;
  publicShareRole?: 'viewer' | 'commenter';
  pageOrder: string[];
  createdAt: number;
  updatedAt: number;
  presentationSettings?: PresentationSettings;
  presentState?: PresentState;
  isTemplate?: boolean;
  templateCategory?: string;
  templateDescription?: string;
  templateIsBuiltIn?: boolean;
  // A rough SVG mini-preview of the template's first page, captured once
  // when the template is saved (templates are never edited again after
  // creation, so this can never go stale). Absent on older templates saved
  // before this field existed — TemplateGalleryModal falls back to a
  // text-only card in that case.
  templateThumbnailUrl?: string;
}

export type FolderRole = 'owner' | 'editor' | 'viewer';

// Mirrors Simple AIM Kanban's Folder type exactly (substituting diagramIds
// for kanbanIds) for UX/sharing-model consistency across the two sibling
// apps — see src/store.ts's folder functions for the full port.
export interface DiagramFolder {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail?: string;
  memberIds: string[];
  editorIds: string[];
  memberEmails: Record<string, string>;
  diagramIds: string[];
  inviteToken: string;
  editorInviteToken?: string;
  createdAt: number;
  folderLogoUrl?: string | null;
}

export interface DiagramFolderInviteInfo {
  folderId: string;
  folderName: string;
  ownerEmail: string;
  diagramIds: string[];
  role: FolderRole;
}
