import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ReactFlow, Background, Controls, addEdge, applyNodeChanges, applyEdgeChanges,
  MarkerType, ConnectionMode, useReactFlow, useUpdateNodeInternals, type Node, type Edge, type NodeTypes, type EdgeTypes,
  type OnConnect, type NodeChange, type EdgeChange, type OnReconnect,
} from '@xyflow/react';
import { Button, Tooltip, Select, Popover, Switch, ColorPicker, Modal, Progress } from 'antd';
import {
  IconDelete, IconAlignTop, IconAlignBottom, IconAlignMiddle,
  IconAlignLeft, IconAlignCenter, IconAlignRight, IconDistributeH, IconDistributeV,
  IconBringToFront, IconSendToBack, IconDuplicate, IconMoveUp, IconMoveDown,
  IconBooleanUnion, IconBooleanSubtract, IconBooleanIntersect, IconBooleanExclude,
  IconGroup, IconUngroup, IconContainer,
  IconExit, IconChevronLeft, IconChevronRight,
  IconFullscreenEnter, IconFullscreenExit, IconSettingsGear, IconFillScreen,
  IconAddRow, IconRemoveRow, IconAddColumn, IconRemoveColumn,
  IconComment,
} from '../icons';
import type { DiagramPage, PresentationSettings, PresentState } from '../../types/document';
import type { ToolId } from '../../types/tools';
import type { ShapeKind, DiagramNode, ShapeNodeData, PathAnchor, BrushPoint } from '../../types/shapes';
import type { DiagramEdge, SmartEdgeData, ArrowStyle } from '../../types/edges';
import { getPageDimensions } from '../../utils/paperSizes';
import { PAGE_GAP, PAGE_X } from '../../constants';
import { PageFrameNode } from './nodes/PageFrameNode';
import { ShapeNode } from './nodes/ShapeNode';
import { GroupNode } from './nodes/GroupNode';
import { PathNode } from './nodes/PathNode';
import { CommentPinNode } from './nodes/CommentPinNode';
import { MultiSelectOverlayNode } from './nodes/MultiSelectOverlayNode';
import { CommentThreadPanel } from '../panels/CommentThreadPanel';
import { SmartEdge } from './edges/SmartEdge';
import { PageNavigatorRail } from './PageNavigatorRail';
import { RulerOverlay } from './Ruler';
import { Toolbar } from './Toolbar';
import { ToolSettingsPanel } from '../panels/ToolSettingsPanel';
import { FavoriteShapesPanel } from './FavoriteShapesPanel';
import { useFavoriteShapes, MAX_FAVORITE_SHAPES } from '../../hooks/useFavoriteShapes';
import { useToolDefaults } from '../../hooks/useToolDefaults';
import { useUxPreferences } from '../../hooks/useUxPreferences';
import { ShapeStampCursor } from './ShapeStampCursor';
import { useActivePageId } from './useActivePageId';
import { AlignmentGuidesOverlay } from './AlignmentGuidesOverlay';
import { PenDrawingOverlay } from './PenDrawingOverlay';
import { BrushDrawingOverlay } from './BrushDrawingOverlay';
import { ConnectorDrawingOverlay } from './ConnectorDrawingOverlay';
import { AnchorEditOverlay, type AnchorPart } from './AnchorEditOverlay';
import {
  computePathViewBox, absoluteToAnchorLocal, anchorToAbsolute, normalizePathAnchors,
  subdivideBezierAt, synthesizeSmoothHandles,
} from '../../utils/pathAnchorGeometry';
import { computeAlignmentGuides, computeSnapOffset, type GuideLines } from './alignmentGuides';
import { applyBooleanOp, groupContoursByContainment, ellipseToAnchors, roundedRectToAnchors, type BooleanOp, type PathContour } from '../../utils/pathBoolean';
import { ShapePropertiesPanel } from '../panels/ShapePropertiesPanel';
import { DataPanel } from '../panels/DataPanel';
import { ValidationPanel } from '../panels/ValidationPanel';
import { computeValidationIssues } from '../../utils/diagramValidation';
import { AnimationPanel, type SequenceItem } from '../panels/AnimationPanel';
import { LayersPanel } from '../panels/LayersPanel';
import { PageSettingsPanel } from '../panels/PageSettingsPanel';
import { ExportModal } from '../ExportModal';
import { ShortcutsHelpModal } from '../ShortcutsHelpModal';
import { UxPreferencesDrawer } from '../UxPreferencesDrawer';
import { ShapeContextMenu } from './ShapeContextMenu';
import { getFloatingEdgeParams } from './edges/edgeRouting';
import { RemoteCursorsLayer } from './RemoteCursorsLayer';
import { PresentationFrame } from './PresentationFrame';
import { usePresence } from '../../hooks/usePresence';
import { resolveStyle } from '../../utils/shapeStyleResolver';
import { computeDownstream } from '../../utils/graphTraversal';
import { computePresentationLayout, DEFAULT_PRESENTATION_SETTINGS } from '../../utils/presentationFrame';
import { uploadDiagramImage, uploadDiagramMedia, getImageDimensions, getVideoDimensions, uploadThumbnail } from '../../utils/imageUpload';
import { downsampleImageFile, formatBytes } from '../../utils/imageDownsample';
import { exportPageAsImage } from '../../utils/exportImage';
import { THUMB_MAX_WIDTH, THUMB_MAX_HEIGHT } from './PageNavigatorRail';
import type { DiagramVariable } from '../../types/variables';
import {
  subscribeShapes, subscribeConnectors, saveShape, saveShapes, deleteShape, saveConnector, deleteConnector,
  subscribeVariables, upsertVariable, deleteVariable, updatePage, duplicatePage, detachMasterShape,
  subscribeComments, saveComment, deleteComment, setCoverPage, deletePage,
} from '../../store';
import type { DiagramComment } from '../../types/comments';
import { useAuth } from '../../AuthContext';

// Exported so VersionPreview.tsx's read-only snapshot renderer can reuse the
// exact same type-registration map rather than keeping a second, driftable
// copy in sync by hand.
export const nodeTypes: NodeTypes = {
  pageFrame: PageFrameNode,
  shape: ShapeNode,
  group: GroupNode,
  path: PathNode,
  comment: CommentPinNode,
  multiSelectOverlay: MultiSelectOverlayNode,
};
export const edgeTypes: EdgeTypes = {
  smart: SmartEdge,
};

const GROUP_PADDING = 24;

// Shared by every global keydown effect (WASD-pan, direct-select shortcut,
// anchor nudge, clipboard) so none of them fire while the user is typing in
// a shape label, a page-rename field, or any other text input.
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

interface Props {
  diagramId: string;
  pages: DiagramPage[];
  diagramName?: string;
  // 'comment' is a third, narrower tier between the two: editing stays
  // blocked exactly like 'present' (every existing `isPresent`-gated check
  // below applies to it too), but comment pins stay placeable/visible,
  // unlike a pure 'present' viewer — see `commentsEnabled` below.
  mode?: 'edit' | 'present' | 'comment';
  onExitPresent?: () => void;
  presentationSettings?: PresentationSettings;
  onUpdatePresentationSettings?: (patch: Partial<PresentationSettings>) => void;
  // Two-way sync for Presenter View: whichever presentation window (main
  // audience view or a separate presenter-mode tab) navigates writes here,
  // and both adopt whatever the other last wrote — see PresentState's own
  // doc comment for why this (not true OS-level dual-monitor control) is
  // the actual deliverable.
  presentState?: PresentState;
  onPresentStateChange?: (state: PresentState) => void;
  toolbarSlot?: HTMLElement | null;
  onInsertPageAt?: (afterOrder: number) => void;
  onInsertMasterAt?: (afterOrder: number) => void;
  onCreateMasterForFormat?: (paperSize: string, orientation: 'portrait' | 'landscape', customWidth?: number, customHeight?: number) => void;
  onReorderPages?: (pages: DiagramPage[]) => void;
  // Diagram members, for @mention autocomplete in comment threads.
  members?: { uid: string; email: string }[];
  // 'masters' swaps the entire canvas/rail to show ONLY master pages (full
  // editing tools, same as any regular page) instead of the regular page
  // stack — Affinity Publisher's Pages/Master Pages toggle. Kept as a
  // single prop rather than a separate component so every existing piece of
  // page machinery (thumbnails, drag-reorder, PageSettingsPanel, fit-to-
  // page, shape/connector subscriptions) stays master-aware for free.
  viewMode?: 'pages' | 'masters';
}

// React Flow requires a parent node to appear before its children in the
// array. Same topological-depth approach rebuildShapes uses for the main
// shape subscription (Firestore's onSnapshot delivery order isn't
// guaranteed to respect parent/child order), extracted here so the master-
// shape inheritance layer can apply the identical rule without depending on
// rebuildShapes' own closures.
function sortByParentDepth<T extends { id: string; parentId?: string }>(nodes: T[]): T[] {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const depthCache = new Map<string, number>();
  function computeDepth(id: string, guard: Set<string>): number {
    if (depthCache.has(id)) return depthCache.get(id)!;
    if (guard.has(id)) return 0;
    guard.add(id);
    const node = byId.get(id);
    const parentId = node?.parentId;
    const depth = parentId && byId.has(parentId) ? computeDepth(parentId, guard) + 1 : 0;
    depthCache.set(id, depth);
    return depth;
  }
  return [...nodes].sort((a, b) => computeDepth(a.id, new Set()) - computeDepth(b.id, new Set()));
}

// A connector's arrowhead is chosen per-end (start/end independently) after
// it's drawn, stored in `data.startArrow`/`endArrow` and materialized into
// React Flow's own `markerStart`/`markerEnd` edge fields here — `undefined`
// falls back to each end's pre-existing default (no start arrow, filled
// arrow at the end) so every connector created before this field existed
// keeps looking exactly the same.
// React Flow's own MarkerType enum only covers a plain open/filled arrow —
// UML (aggregation/composition/generalization) and DFD/ER (circle) end
// styles need custom SVG <marker> defs instead, referenced by url() the same
// way `markerStart`/`markerEnd` already accept a raw string. See
// ARROW_MARKER_DEFS below for where these ids are actually defined.
const CUSTOM_ARROW_MARKER_IDS: Partial<Record<ArrowStyle, string>> = {
  diamond: 'arrow-diamond',
  diamondFilled: 'arrow-diamondFilled',
  triangleOpen: 'arrow-triangleOpen',
  circle: 'arrow-circle',
  circleFilled: 'arrow-circleFilled',
};

const ARROW_MARKER_OPTIONS: { value: ArrowStyle; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'arrow', label: 'Arrow' },
  { value: 'arrowClosed', label: 'Filled arrow' },
  { value: 'triangleOpen', label: 'Open triangle (UML generalization)' },
  { value: 'diamond', label: 'Diamond (UML aggregation)' },
  { value: 'diamondFilled', label: 'Filled diamond (UML composition)' },
  { value: 'circle', label: 'Circle (DFD/ER)' },
  { value: 'circleFilled', label: 'Filled circle (DFD/ER)' },
];

// A connector's arrowhead is chosen per-end (start/end independently) after
// it's drawn, stored in `data.startArrow`/`endArrow` and materialized into
// React Flow's own `markerStart`/`markerEnd` edge fields here — `undefined`
// falls back to each end's pre-existing default (no start arrow, filled
// arrow at the end) so every connector created before this field existed
// keeps looking exactly the same.
function arrowMarker(style: ArrowStyle | undefined, fallback: ArrowStyle) {
  const resolved = style ?? fallback;
  if (resolved === 'none') return undefined;
  const customId = CUSTOM_ARROW_MARKER_IDS[resolved];
  // React Flow's own EdgeMarkerType is `string | EdgeMarker` — for a plain
  // string it treats the value AS the raw marker id and wraps it in
  // url(#...) itself downstream (see @xyflow/system's getMarkerId: a
  // string marker is returned verbatim, then wrapped once by the edge
  // renderer). Passing an ALREADY-wrapped "url(#id)" string here — as this
  // used to — got wrapped a second time into the nonsensical
  // "url('#url(#id)')", which never resolves to the real <marker> element,
  // so no custom arrowhead (diamond/triangle/circle) ever rendered at all.
  if (customId) return customId;
  return { type: resolved === 'arrow' ? MarkerType.Arrow : MarkerType.ArrowClosed, color: '#8a93a6' };
}

// Standard 2D line-segment (not infinite-line) intersection — used by the
// `edges` memo below to find where two straight connectors visually cross.
// The 0.02-0.98 margin on t/u excludes intersections right at either
// segment's own endpoints, which happens routinely for two connectors that
// share a source/target node and fan out at similar angles — that shared
// point isn't a genuine mid-line crossing and shouldn't get a bump.
function segmentIntersection(
  p1: { x: number; y: number }, p2: { x: number; y: number },
  p3: { x: number; y: number }, p4: { x: number; y: number },
): { x: number; y: number } | null {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-6) return null;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  if (t <= 0.02 || t >= 0.98 || u <= 0.02 || u >= 0.98) return null;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}

// Mounted once at the ReactFlow SVG root (see the <svg><defs> render below,
// alongside ReactFlow's own children) — always rendered regardless of
// onlyRenderVisibleElements culling, since these are definitions, not
// visible marks, and a culled-out edge referencing one by id would just
// silently fail to resolve it if the defs themselves were culled too.
function ArrowMarkerDefs() {
  const color = '#8a93a6';
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }}>
      <defs>
        <marker id="arrow-diamond" viewBox="0 0 20 20" refX="18" refY="10" markerWidth="14" markerHeight="14" orient="auto-start-reverse">
          <polygon points="0,10 10,3 20,10 10,17" fill="#fff" stroke={color} strokeWidth="1.5" />
        </marker>
        <marker id="arrow-diamondFilled" viewBox="0 0 20 20" refX="18" refY="10" markerWidth="14" markerHeight="14" orient="auto-start-reverse">
          <polygon points="0,10 10,3 20,10 10,17" fill={color} stroke={color} strokeWidth="1.5" />
        </marker>
        <marker id="arrow-triangleOpen" viewBox="0 0 20 20" refX="18" refY="10" markerWidth="12" markerHeight="12" orient="auto-start-reverse">
          <polygon points="1,2 19,10 1,18" fill="#fff" stroke={color} strokeWidth="1.5" />
        </marker>
        <marker id="arrow-circle" viewBox="0 0 20 20" refX="17" refY="10" markerWidth="10" markerHeight="10" orient="auto-start-reverse">
          <circle cx="10" cy="10" r="7" fill="#fff" stroke={color} strokeWidth="1.5" />
        </marker>
        <marker id="arrow-circleFilled" viewBox="0 0 20 20" refX="17" refY="10" markerWidth="10" markerHeight="10" orient="auto-start-reverse">
          <circle cx="10" cy="10" r="7" fill={color} stroke={color} strokeWidth="1.5" />
        </marker>
      </defs>
    </svg>
  );
}

// Fields the Style Paint tool copies from a source shape onto a target —
// deliberately just the "look" (fill/stroke/effects + text styling), never
// content, geometry, links, data-bindings, or animation config. Matches
// exactly the fields ShapePropertiesPanel's Style + Text tabs expose.
const STYLE_PAINT_FIELDS = [
  'fillColor', 'strokeColor', 'strokeWidth', 'strokeStyle', 'cornerRadius',
  'effect', 'opacity', 'blur', 'fillGradient', 'containerTheme', 'containerAccentColor',
  'fontSize', 'fontColor', 'fontWeight', 'fontFamily', 'textAlign',
  'fontStyle', 'textDecoration', 'letterSpacing', 'lineHeight', 'verticalAlign',
] as const satisfies readonly (keyof ShapeNodeData)[];

export function Canvas({
  diagramId, pages: pagesProp, diagramName = 'diagram', mode = 'edit', onExitPresent,
  presentationSettings, onUpdatePresentationSettings, presentState, onPresentStateChange,
  toolbarSlot, onInsertPageAt, onInsertMasterAt, onCreateMasterForFormat, onReorderPages, members = [], viewMode = 'pages',
}: Props) {
  // Master pages (isMaster: true) live in the same pages subcollection as
  // everything else — reusing all of addPage/updatePage/subscribePages
  // unchanged. `masterPages` is always every isMaster page, regardless of
  // viewMode (needed for the master-inheritance lookups below and for
  // PageSettingsPanel's master-select dropdown). `regularPages` is always
  // every non-master page, also viewMode-independent (needed anywhere that
  // must keep meaning "the real content pages" even while editing masters,
  // e.g. PageSettingsPanel's delete/usedByCount logic). `pages` is the
  // ACTIVE, viewMode-dependent set — every other piece of page machinery
  // below (thumbnails, shape/connector subscriptions, pageOrigins,
  // drag-reorder, fit-to-page, useActivePageId) reads from this one, so
  // swapping it here is the single thing that makes "Master Pages mode"
  // fall out of the entire rest of this file for free.
  const masterPages = useMemo(() => pagesProp.filter(p => p.isMaster), [pagesProp]);
  const regularPages = useMemo(() => pagesProp.filter(p => !p.isMaster), [pagesProp]);
  const pages = viewMode === 'masters' ? masterPages : regularPages;

  const { user } = useAuth();
  const { screenToFlowPosition, setCenter, getZoom, getInternalNode, fitBounds, getViewport, setViewport, updateNodeData } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const isPresent = mode !== 'edit';
  // Only comment pins carve an exception out of the blanket isPresent gate
  // above — see the 'comment' mode doc comment on the Props type.
  const commentsEnabled = mode !== 'present';
  const { peers, updateCursor, updateDragPreview } = usePresence(diagramId, user, mode === 'edit' ? 'edit' : 'present');
  // Measures the actual on-screen container size so fitToPage can reserve
  // space for the properties drawer (an absolutely-positioned overlay that
  // doesn't shrink this element's own measured size) — fitBounds's own
  // padding option is a single percentage with no way to reserve an
  // asymmetric region for it.
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [shapeNodes, setShapeNodes] = useState<Node[]>([]);
  const [connectorEdges, setConnectorEdges] = useState<Edge[]>([]);
  const [comments, setComments] = useState<DiagramComment[]>([]);

  // Selection normally clears itself the instant you click anywhere else on
  // the canvas (React Flow's own pane-click deselection) — but the Pages/
  // Master Pages toggle lives in the header, outside the ReactFlow pane
  // entirely, so clicking it never triggers that. A shape or connector
  // selected right before toggling stayed marked `selected: true` in this
  // still-shared shapeNodes/connectorEdges state even though its own page is
  // no longer the active one, which is what made a shape's properties panel
  // pop up "for no reason" after switching views — it was never re-selected,
  // just never actually deselected in the first place.
  //
  // Separately (and this was the actual cause of the connector routing/
  // arrow-style bar specifically, not selection at all): activeToolId isn't
  // scoped to a view either. Leaving the connector/pen/etc. tool armed while
  // editing a master, then toggling to Pages, kept that tool active and its
  // ToolSettingsPanel showing on the new page too, with nothing selected.
  // selectTool('select') is this file's own canonical "reset every mode/
  // panel flag" call (see its own doc comment below) — reusing it here
  // covers this and any future tool/panel flag the same way, rather than
  // hand-listing just the one flag that happened to reproduce this time.
  useEffect(() => {
    setShapeNodes(prev => prev.map(n => n.selected ? { ...n, selected: false } : n));
    setConnectorEdges(prev => prev.map(e => e.selected ? { ...e, selected: false } : e));
    selectTool('select');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  const shapesSlices = useRef<Map<string, Map<string, DiagramNode>>>(new Map());
  const connectorsSlices = useRef<Map<string, Map<string, DiagramEdge>>>(new Map());
  const commentsSlices = useRef<Map<string, Map<string, DiagramComment>>>(new Map());

  // Track pending updateNodeInternals timeout IDs so rapid rebuilds can cancel
  // earlier timeouts. Without this, when moves happen rapidly, each rebuild schedules
  // new timeouts while old ones are still pending. The old timeouts fire and try to
  // update nodes that were replaced by newer rebuilds, causing connectors to vanish.
  const pendingUpdateNodeInternalsTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Helper: cancel all pending updateNodeInternals timeouts and schedule new ones.
  // This prevents race conditions when rebuildShapes() is called rapidly - only the
  // LAST rebuild's timeouts will actually fire, ensuring we update the current nodes.
  function scheduleUpdateNodeInternals(nodeIds: string[]) {
    // Cancel all pending timeouts from previous rebuilds
    for (const timeoutId of pendingUpdateNodeInternalsTimeouts.current) {
      clearTimeout(timeoutId);
    }
    pendingUpdateNodeInternalsTimeouts.current = [];
    // Schedule new timeouts and track their IDs
    for (const delay of [0, 50, 150]) {
      const timeoutId = setTimeout(() => updateNodeInternals(nodeIds), delay);
      pendingUpdateNodeInternalsTimeouts.current.push(timeoutId);
    }
  }

  // "Latest" refs — functions embedded into node.data (onCommit, onNavigateLink)
  // get baked in inside a Firestore onSnapshot callback whose closure is pinned
  // to whichever render was active when the subscription's useEffect last ran,
  // not the render where the function is eventually invoked. Reading through a
  // ref that's reassigned every render means any "stale" copy of the function
  // still sees current data instead of a frozen snapshot from subscribe-time.
  const shapeNodesRef = useRef<Node[]>([]);
  shapeNodesRef.current = shapeNodes;
  // frameNodes' own useMemo only recomputes on page-geometry changes, so a
  // plain function reference baked into its data would freeze whichever
  // `deselectAll` closure existed at that render — stale forever after,
  // since selecting/deselecting shapes doesn't touch pages/pageOrigins/
  // pageDimensions. Routing through a ref that's refreshed every render
  // keeps the call always current without forcing frameNodes to recompute.
  const deselectAllRef = useRef<() => void>(() => {});

  // ── Undo/redo ────────────────────────────────────────────────────────────
  // A per-tab, this-user-only local command stack — NOT a document-wide
  // history. It only ever knows how to reverse/reapply actions taken from
  // this editing session, so undoing never touches whatever a collaborator
  // is doing concurrently on their own client; it also never even sees their
  // edits, since Firestore itself (not this stack) remains the only shared
  // source of truth. Scope for this pass covers the everyday "oops" moments
  // (restyle, resize, move/nudge, align/distribute, reorder, delete) — NOT
  // paste/duplicate creation, group/ungroup, connectors, path-anchor edits,
  // comments, pages, or variables, which would each need their own careful
  // (and considerably more involved) undo modeling.
  const undoStackRef = useRef<{ undo: () => void; redo: () => void }[]>([]);
  const redoStackRef = useRef<{ undo: () => void; redo: () => void }[]>([]);
  const MAX_HISTORY = 100;
  function pushHistory(entry: { undo: () => void; redo: () => void }) {
    undoStackRef.current.push(entry);
    if (undoStackRef.current.length > MAX_HISTORY) undoStackRef.current.shift();
    redoStackRef.current = [];
  }
  function undo() {
    const entry = undoStackRef.current.pop();
    if (!entry) return;
    entry.undo();
    redoStackRef.current.push(entry);
  }
  function redo() {
    const entry = redoStackRef.current.pop();
    if (!entry) return;
    entry.redo();
    undoStackRef.current.push(entry);
  }
  // Coalesces a burst of rapid same-field edits (holding an arrow key,
  // dragging a slider, typing into a text field) into ONE history entry
  // covering the whole burst — `before` is captured only once, from the
  // first call in the burst, so undo reverts all the way back to the state
  // before the burst started rather than one keystroke at a time.
  const historyDebounceRef = useRef<Map<string, { timer: ReturnType<typeof setTimeout>; before: unknown }>>(new Map());
  function pushDebouncedHistory<T>(key: string, before: T, after: T, apply: (value: T) => void, delay = 500) {
    const pending = historyDebounceRef.current.get(key);
    const trueBefore = (pending ? pending.before : before) as T;
    if (pending) clearTimeout(pending.timer);
    const timer = setTimeout(() => {
      historyDebounceRef.current.delete(key);
      pushHistory({ undo: () => apply(trueBefore), redo: () => apply(after) });
    }, delay);
    historyDebounceRef.current.set(key, { timer, before: trueBefore });
  }

  // Keyed on just the fields that actually affect stacking/size, not the
  // whole `pages` array reference — `pages` comes from a live Firestore
  // listener that hands back a brand-new array on ANY field write to ANY
  // page, including ones with nothing to do with geometry (e.g. the page-
  // thumbnail effect below writes `thumbnailUrl`/`thumbnailUpdatedAt` on
  // every regenerate). Depending on `pages` directly meant THIS memo
  // recomputed (new Map references) on every such write too, and since the
  // thumbnail effect itself depends on these Maps, its own write fed right
  // back into retriggering itself — a real, confirmed self-sustaining loop
  // (regenerate → write thumbnailUrl → pages ref changes → this memo
  // recomputes → thumbnail effect's deps change → regenerate again),
  // visible as its corner spinner cycling every second or so with nothing
  // actually changing on the page. This key only changes when a page's own
  // size-relevant fields do.
  const pageGeometryKey = pages.map(p => `${p.id}:${p.paperSize}:${p.orientation}:${p.customWidth ?? ''}:${p.customHeight ?? ''}`).join('|');
  const { pageOrigins, pageDimensions } = useMemo(() => {
    const origins = new Map<string, number>();
    const dims = new Map<string, { width: number; height: number }>();
    let cursorY = 0;
    for (const page of pages) {
      const { width, height } = getPageDimensions(page.paperSize, page.orientation, page.customWidth, page.customHeight);
      origins.set(page.id, cursorY);
      dims.set(page.id, { width, height });
      cursorY += height + PAGE_GAP;
    }
    return { pageOrigins: origins, pageDimensions: dims };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageGeometryKey]);
  const pageGeomRef = useRef({ pageOrigins, pageDimensions, pages });
  pageGeomRef.current = { pageOrigins, pageDimensions, pages };

  // Every master's own origin in the SAME PAGE_GAP-stacked coordinate scheme
  // regular pages use, computed unconditionally from masterPages (never
  // gated on viewMode) — a master's shapes carry absolute positions relative
  // to wherever it sits in the master stack while it's being edited in
  // Master Pages mode, and translating them onto a child page (below) needs
  // to know that offset regardless of which mode is currently active.
  const masterOrigins = useMemo(() => {
    const origins = new Map<string, number>();
    let cursorY = 0;
    for (const master of masterPages) {
      const { height } = getPageDimensions(master.paperSize, master.orientation, master.customWidth, master.customHeight);
      origins.set(master.id, cursorY);
      cursorY += height + PAGE_GAP;
    }
    return origins;
  }, [masterPages]);

  // Moved up from further down in this file so selection-driven floating UI
  // (selectedShapeIds/selectedEdges below) can scope itself to "is this
  // actually on the page I'm looking at" — see their own comments for why
  // that scoping exists.
  const activePageId = useActivePageId(pages, pageOrigins, pageDimensions);

  // Fit-to-page zoom — used both for the initial view and for page-switching,
  // replacing the old "whole document" fitView and "keep whatever zoom was
  // already active" goToPage. fitBounds already contains RF's own
  // fit-and-clamp-to-min/maxZoom math, so there's no need to hand-roll it.
  function fitToPage(pageId: string, opts: { duration: number }, reservedRightPx = 0) {
    const { pageOrigins: origins, pageDimensions: dims } = pageGeomRef.current;
    const origin = origins.get(pageId) ?? 0;
    const dims_ = dims.get(pageId) ?? { width: 794, height: 1123 };
    const rect = { x: PAGE_X, y: origin, width: dims_.width, height: dims_.height };
    const container = wrapperRef.current?.getBoundingClientRect();
    if (!container || reservedRightPx <= 0) {
      fitBounds(rect, { padding: 0.1, duration: opts.duration });
      return;
    }
    // A properties drawer is currently covering the right side of the
    // container — fit against the narrowed available width/height instead
    // of the full container, and center within that available region (not
    // the full container), so the page lands fully visible beside the
    // drawer rather than partly hidden underneath it.
    const availableWidth = Math.max(100, container.width - reservedRightPx);
    const availableHeight = container.height;
    const PADDING_FRACTION = 0.1;
    const zoom = Math.min(
      (availableWidth * (1 - PADDING_FRACTION)) / rect.width,
      (availableHeight * (1 - PADDING_FRACTION)) / rect.height,
    );
    const rectCenterX = rect.x + rect.width / 2;
    const rectCenterY = rect.y + rect.height / 2;
    setViewport(
      { x: availableWidth / 2 - rectCenterX * zoom, y: availableHeight / 2 - rectCenterY * zoom, zoom },
      { duration: opts.duration },
    );
  }

  // Gated on BOTH pages having loaded AND React Flow's own onInit — calling
  // fitBounds before RF has measured its container's real pixel size (which
  // can easily happen if this only waited on `pages`, since that arrives
  // from an independent Firestore subscription) computes zoom against a
  // stale/default container size and lands on the wrong value.
  const [flowReady, setFlowReady] = useState(false);
  const didInitialFitRef = useRef(false);
  useEffect(() => {
    if (isPresent || didInitialFitRef.current || pages.length === 0 || !flowReady) return;
    didInitialFitRef.current = true;
    fitToPage(pages[0].id, { duration: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent, pages, flowReady]);

  // Presentation frame sizing needs the live window size (not just an
  // initial read) so resizing the presenting window re-fits the frame.
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    function onResize() { setWindowSize({ width: window.innerWidth, height: window.innerHeight }); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const windowSizeRef = useRef(windowSize);
  windowSizeRef.current = windowSize;

  function handleRenamePage(pageId: string, name: string) {
    updatePage(diagramId, pageId, { name });
  }

  // The page frame is a non-selectable node that visually sits in front of
  // React Flow's own pane — clicking anywhere inside it (i.e. "the page,"
  // off any shape) never reaches the pane's own click handler, so RF's
  // usual "click empty space to deselect" behavior silently doesn't fire
  // there. Deselecting explicitly on click closes that gap.
  // Same reasoning as pageGeometryKey above, one level higher: frameNodes
  // reads several more per-page fields (name, margins, background, header/
  // footer, page-number settings) plus each page's master (for fallback
  // values), but explicitly EXCLUDES thumbnailUrl/thumbnailUpdatedAt — the
  // one field this app itself repeatedly writes back (see the page-
  // thumbnail effect below) that has nothing to do with how a frame
  // renders. Without this, frameNodes recomputed brand-new node objects on
  // every thumbnail write (since `pages` itself is a fresh array from the
  // live listener), which React Flow's own ResizeObserver treated as
  // needing remeasurement — confirmed live as a `dimensions` NodeChange
  // event for the page frame firing every ~1.5s indefinitely, which
  // onNodesChange unconditionally applied to shapeNodes, which in turn
  // retriggered the thumbnail effect's own timer. A closed, self-
  // sustaining loop, entirely from an object reference nothing downstream
  // actually needed to react to.
  const pageContentKey = pages.map(p => JSON.stringify({
    id: p.id, name: p.name, masterPageId: p.masterPageId,
    marginTop: p.marginTop, marginRight: p.marginRight, marginBottom: p.marginBottom, marginLeft: p.marginLeft,
    backgroundColor: p.backgroundColor, headerText: p.headerText, footerText: p.footerText,
    headerConfig: p.headerConfig, footerConfig: p.footerConfig,
    pageNumberEnabled: p.pageNumberEnabled, pageNumberStyle: p.pageNumberStyle, pageNumberPosition: p.pageNumberPosition,
  })).join('|');
  const masterContentKey = masterPages.map(m => JSON.stringify({
    id: m.id, backgroundColor: m.backgroundColor, headerText: m.headerText, footerText: m.footerText,
    headerConfig: m.headerConfig, footerConfig: m.footerConfig,
  })).join('|');
  const frameNodes = useMemo<Node[]>(() => pages.map((page, i) => {
    const master = page.masterPageId ? masterPages.find(m => m.id === page.masterPageId) : undefined;
    return {
      id: `pageFrame-${page.id}`,
      type: 'pageFrame',
      position: { x: PAGE_X, y: pageOrigins.get(page.id) ?? 0 },
      data: {
        pageName: page.name, pageId: page.id, onRename: handleRenamePage,
        onDeselectAll: () => deselectAllRef.current(),
        marginTop: page.marginTop, marginRight: page.marginRight, marginBottom: page.marginBottom, marginLeft: page.marginLeft,
        // Master-inherited fields fall through only when this page leaves
        // its own copy unset — same convention as every other optional page field.
        backgroundColor: page.backgroundColor ?? master?.backgroundColor,
        headerText: page.headerText ?? master?.headerText,
        footerText: page.footerText ?? master?.footerText,
        headerConfig: page.headerConfig ?? master?.headerConfig,
        footerConfig: page.footerConfig ?? master?.footerConfig,
        pageNumberEnabled: page.pageNumberEnabled, pageNumberStyle: page.pageNumberStyle, pageNumberPosition: page.pageNumberPosition,
        pageIndex: i + 1, pageCount: pages.length,
        ...(pageDimensions.get(page.id) ?? { width: 794, height: 1123 }),
      },
      draggable: false,
      selectable: false,
      // A large negative sentinel, not -1 — leaves the whole small
      // negative-integer range (-1 down to -zCount) free for
      // inheritedMasterNodes' own per-shape ranking below, comfortably far
      // from any realistic master shape count.
      zIndex: -1_000_000,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [pageContentKey, masterContentKey, pageOrigins, pageDimensions, diagramId]);

  const [variables, setVariables] = useState<DiagramVariable[]>([]);
  useEffect(() => subscribeVariables(diagramId, setVariables), [diagramId]);

  // ── Subscriptions: merge shapes/connectors across every page of this document ──
  useEffect(() => {
    // Prune slice entries for pages no longer in the current set BEFORE
    // resubscribing — critical now that `pages` can swap wholesale between
    // regular content pages and master pages (viewMode toggle). Without
    // this, a page's slice (e.g. a master's shapes, loaded while editing it
    // in Master Pages mode) would linger in shapesSlices.current forever
    // after switching away, since unsubscribing only stops FUTURE updates —
    // it doesn't remove the already-cached Map entry rebuildShapes/
    // rebuildConnectors/rebuildComments keep iterating every render.
    const currentIds = new Set(pages.map(p => p.id));
    for (const key of shapesSlices.current.keys()) if (!currentIds.has(key)) shapesSlices.current.delete(key);
    for (const key of connectorsSlices.current.keys()) if (!currentIds.has(key)) connectorsSlices.current.delete(key);
    for (const key of commentsSlices.current.keys()) if (!currentIds.has(key)) commentsSlices.current.delete(key);
    rebuildShapes();
    rebuildConnectors();
    rebuildComments();
    // Force React Flow to re-measure ALL nodes after rebuildShapes creates new references.
    // Same fix as applyPosition/applyPositionBatch/commitShapeUpdates - adoptUserNodes resets handleBounds/measured
    // for all nodes when receiving new object references, causing connectors to vanish.
    const allIds: string[] = [];
    for (const s of shapesSlices.current.values()) {
      for (const node of s.values()) {
        allIds.push(node.id);
      }
    }
    scheduleUpdateNodeInternals(allIds);

    const shapeUnsubs = pages.map(page => subscribeShapes(diagramId, page.id, nodes => {
      shapesSlices.current.set(page.id, new Map(nodes.map(n => [n.id, n])));
      rebuildShapes();
      // Force React Flow to re-measure ALL nodes after rebuildShapes creates new references.
      // Firestore listener fires on every echo of our own writes, and without re-measuring,
      // connectors vanish when handleBounds/measured reset to undefined.
      const allIds: string[] = [];
      for (const s of shapesSlices.current.values()) {
        for (const node of s.values()) {
          allIds.push(node.id);
        }
      }
      scheduleUpdateNodeInternals(allIds);
    }));
    const connectorUnsubs = pages.map(page => subscribeConnectors(diagramId, page.id, edges => {
      connectorsSlices.current.set(page.id, new Map(edges.map(e => [e.id, e])));
      rebuildConnectors();
    }));
    const commentUnsubs = pages.map(page => subscribeComments(diagramId, page.id, list => {
      commentsSlices.current.set(page.id, new Map(list.map(c => [c.id, c])));
      rebuildComments();
    }));
    return () => {
      shapeUnsubs.forEach(u => u());
      connectorUnsubs.forEach(u => u());
      commentUnsubs.forEach(u => u());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagramId, pages.map(p => p.id).join(',')]);

  // inheritedMasterNodes (below) is freshly re-derived every render from
  // master shape data, with no memory of its own — React Flow's own
  // internal click handling can't persist a `selected` flag onto it the
  // way applyNodeChanges does for real shapes in shapeNodes state (there's
  // no matching entry there for a synthetic `inherited-*` id to attach to).
  // This tracks it explicitly so the memo can set `selected` itself.
  const [selectedInheritedId, setSelectedInheritedId] = useState<string | null>(null);

  // ── Live master-shape inheritance: subscribe once per unique referenced
  // master, not once per referencing page — many pages can share one master.
  // Only active in 'pages' mode; a master never inherits from another master.
  const referencedMasterIds = useMemo(
    () => (viewMode === 'masters' ? [] : Array.from(new Set(pages.map(p => p.masterPageId).filter((id): id is string => !!id)))),
    [pages, viewMode],
  );
  const masterShapesSlices = useRef<Map<string, Map<string, DiagramNode>>>(new Map());
  const [masterShapeNodesByMaster, setMasterShapeNodesByMaster] = useState<Map<string, DiagramNode[]>>(new Map());
  // Same dedup-by-unique-master subscription as the shapes above, but for
  // connectors BETWEEN master shapes — previously only master shapes
  // themselves were inherited onto a referencing page, never the connectors
  // linking them (a real gap in the original master-pages design, not just
  // an unreported bug).
  const masterConnectorsSlices = useRef<Map<string, Map<string, DiagramEdge>>>(new Map());
  const [masterConnectorsByMaster, setMasterConnectorsByMaster] = useState<Map<string, DiagramEdge[]>>(new Map());
  useEffect(() => {
    const unsubs = referencedMasterIds.map(masterId => subscribeShapes(diagramId, masterId, nodes => {
      masterShapesSlices.current.set(masterId, new Map(nodes.map(n => [n.id, n])));
      setMasterShapeNodesByMaster(new Map(
        referencedMasterIds.map(mid => [mid, Array.from(masterShapesSlices.current.get(mid)?.values() ?? [])]),
      ));
    }));
    const connectorUnsubs = referencedMasterIds.map(masterId => subscribeConnectors(diagramId, masterId, edges => {
      masterConnectorsSlices.current.set(masterId, new Map(edges.map(e => [e.id, e])));
      setMasterConnectorsByMaster(new Map(
        referencedMasterIds.map(mid => [mid, Array.from(masterConnectorsSlices.current.get(mid)?.values() ?? [])]),
      ));
    }));
    return () => {
      unsubs.forEach(u => u());
      connectorUnsubs.forEach(u => u());
      // Drop cached slices for masters no longer referenced by anything
      // currently rendered, so a stale snapshot can't resurface if the same
      // master id becomes referenced again later with different content.
      for (const id of masterShapesSlices.current.keys()) {
        if (!referencedMasterIds.includes(id)) masterShapesSlices.current.delete(id);
      }
      for (const id of masterConnectorsSlices.current.keys()) {
        if (!referencedMasterIds.includes(id)) masterConnectorsSlices.current.delete(id);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagramId, referencedMasterIds.join(',')]);

  // Translates each referencing page's master's CURRENT shapes onto that
  // page's own origin and renders them as a locked, non-interactive layer
  // behind the page's own content — see PAGE_GAP-based translation
  // precedent in handleReorderPagesWithShapes above. Ephemeral only: none of
  // this is ever written back to Firestore, so editing the real master
  // (elsewhere) is what actually changes what every referencing page shows.
  // A "detach from master" clone only ever records the detached shape's OWN
  // id into overriddenMasterShapeIds (see detachMasterShape in store.ts) —
  // not its descendants', since detaching clones the whole subtree at once.
  // A flat `overridden.has(m.id)` check therefore let an un-recorded child
  // of a detached GROUP still pass through here, referencing a `parentId`
  // that got excluded from `out` in the same pass — React Flow silently
  // fails to render a node whose parent isn't in the array. Walking each
  // shape's own ancestor chain (not just changing what detachMasterShape
  // records) fixes this for shapes already detached in production data too,
  // with no migration needed.
  function isOverriddenOrAncestor(shapeId: string, byId: Map<string, DiagramNode>, overridden: Set<string>): boolean {
    let current: string | undefined = shapeId;
    const guard = new Set<string>();
    while (current) {
      if (overridden.has(current)) return true;
      if (guard.has(current)) return false;
      guard.add(current);
      current = byId.get(current)?.parentId;
    }
    return false;
  }

  const inheritedMasterNodes = useMemo<Node[]>(() => {
    if (viewMode === 'masters') return [];
    const out: Node[] = [];
    for (const page of pages) {
      if (!page.masterPageId) continue;
      const masterShapes = masterShapeNodesByMaster.get(page.masterPageId);
      if (!masterShapes) continue;
      const masterById = new Map(masterShapes.map(s => [s.id, s]));
      const overridden = new Set(page.overriddenMasterShapeIds ?? []);
      const dy = (pageOrigins.get(page.id) ?? 0) - (masterOrigins.get(page.masterPageId) ?? 0);
      // Every inherited shape used to collapse to the exact same zIndex
      // (-0.5), then (in a later, still-broken attempt) to a fraction
      // spreading ranks across the (-1, 0) band — CSS z-index only accepts
      // INTEGERS; a browser silently discards a fractional value (e.g.
      // -0.286) instead of applying it, so every inherited shape actually
      // rendered with NO effective z-index at all. Paint order then fell
      // back to array order, which mirrors Firestore's default (alphabetical
      // by doc id) query order — arbitrary, and disconnected from the
      // master's real stacking order. Confirmed live: two shapes stacked
      // correctly on the master itself rendered in the WRONG relative order
      // once inherited on a regular page, purely because their doc ids
      // happened to sort the "wrong" way alphabetically.
      // Fix: rank each master shape by its own zIndex and assign INTEGER
      // ranks counting down from -1 (frontmost among master shapes) to
      // -zCount (backmost) — still strictly behind every real page shape
      // (which start at 0+) and strictly in front of the page frame, whose
      // own zIndex is now a large negative sentinel (see frameNodes below)
      // specifically to leave this whole negative-integer range free.
      const orderedByZ = [...masterShapes].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
      const zRank = new Map(orderedByZ.map((s, i) => [s.id, i]));
      const zCount = orderedByZ.length;
      for (const m of sortByParentDepth(masterShapes)) {
        if (isOverriddenOrAncestor(m.id, masterById, overridden)) continue;
        const inheritedId = `inherited-${page.id}-${m.id}`;
        out.push({
          ...m,
          id: inheritedId,
          parentId: m.parentId ? `inherited-${page.id}-${m.parentId}` : undefined,
          // Only a top-level (parentless) master shape needs translating —
          // a grouped child's position is already local to its parent, same
          // "only top-level shapes carry an absolute position" rule
          // handleReorderPagesWithShapes/handleResizePageContent rely on.
          position: m.parentId ? m.position : { x: m.position.x, y: m.position.y + dy },
          zIndex: zRank.get(m.id)! - zCount,
          draggable: false,
          selectable: true,
          connectable: false,
          selected: inheritedId === selectedInheritedId,
          data: {
            ...m.data, pageId: page.id, locked: true,
            __inheritedFromMaster: true, __masterPageId: page.masterPageId, __masterShapeId: m.id,
          },
        });
      }
    }
    return out;
  }, [pages, masterShapeNodesByMaster, masterOrigins, pageOrigins, viewMode, selectedInheritedId]);

  // Parallel to inheritedMasterNodes above, but for connectors BETWEEN
  // master shapes — a page inheriting a master's shapes previously never
  // inherited the arrows linking them. Endpoint ids are rewritten to match
  // inheritedMasterNodes' `inherited-{page.id}-{shapeId}` convention; an
  // edge is skipped entirely (not rendered dangling) if either endpoint is
  // itself overridden (or a descendant of an overridden ancestor) on this
  // page, since a detached endpoint no longer has a corresponding inherited
  // node for the edge to attach to.
  const inheritedMasterEdges = useMemo<DiagramEdge[]>(() => {
    if (viewMode === 'masters') return [];
    const out: DiagramEdge[] = [];
    for (const page of pages) {
      if (!page.masterPageId) continue;
      const masterShapes = masterShapeNodesByMaster.get(page.masterPageId);
      const masterEdges = masterConnectorsByMaster.get(page.masterPageId);
      if (!masterShapes || !masterEdges) continue;
      const masterById = new Map(masterShapes.map(s => [s.id, s]));
      const overridden = new Set(page.overriddenMasterShapeIds ?? []);
      for (const e of masterEdges) {
        if (isOverriddenOrAncestor(e.source, masterById, overridden)) continue;
        if (isOverriddenOrAncestor(e.target, masterById, overridden)) continue;
        out.push({
          ...e,
          id: `inherited-edge-${page.id}-${e.id}`,
          source: `inherited-${page.id}-${e.source}`,
          target: `inherited-${page.id}-${e.target}`,
          selectable: false,
          deletable: false,
          data: { ...e.data, locked: true },
        } as DiagramEdge);
      }
    }
    return out;
  }, [pages, masterShapeNodesByMaster, masterConnectorsByMaster, viewMode]);

  function navigateToLink(shapeId: string) {
    const shape = shapeNodesRef.current.find(n => n.id === shapeId);
    const link = (shape?.data as ShapeNodeData | undefined)?.link;
    if (!link) return;
    if (link.type === 'url' && link.url) { window.open(link.url, '_blank'); return; }
    // 'smartAnimate' (default) is the original always-on pan; 'instant' skips
    // the pan duration; 'dissolve' layers a brief full-canvas fade over the
    // (still-animated) camera move for a crossfade feel.
    const transition = link.transition ?? 'smartAnimate';
    const duration = transition === 'instant' ? 0 : 500;
    if (transition === 'dissolve') triggerDissolve();
    if (link.type === 'shape' && link.targetNodeId) {
      const target = shapeNodesRef.current.find(n => n.id === link.targetNodeId);
      if (target) {
        const w = target.width ?? target.measured?.width ?? 100;
        const h = target.height ?? target.measured?.height ?? 70;
        setCenter(target.position.x + w / 2, target.position.y + h / 2, { zoom: 1.2, duration });
        return;
      }
    }
    if (link.targetPageId) {
      const { pageOrigins: origins, pageDimensions: dims, pages: allPages } = pageGeomRef.current;
      const origin = origins.get(link.targetPageId) ?? 0;
      const pageDims = dims.get(link.targetPageId) ?? { width: 794, height: 1123 };
      // In present mode the target page may be framed differently than the
      // page we're jumping FROM (a different device size, say) — recompute
      // fresh for the target rather than reusing the current page's zoom.
      let zoom = getZoom();
      if (isPresent) {
        const targetPage = allPages.find(p => p.id === link.targetPageId);
        zoom = computePresentationLayout(pageDims, targetPage?.paperSize ?? 'A4', windowSizeRef.current, effectiveSettingsRef.current).zoom;
        // Keep the page counter/Next-Prev state in sync with a link-driven
        // jump — without this, presentPageIndex goes stale after following a
        // hotspot/shape link to a different page, and the next arrow-key
        // press then advances relative to the wrong page.
        const targetIndex = allPages.findIndex(p => p.id === link.targetPageId);
        if (targetIndex >= 0) setPresentPageIndex(targetIndex);
      }
      setCenter(pageDims.width / 2, origin + pageDims.height / 2, { zoom, duration });
    }
  }

  const [dissolveActive, setDissolveActive] = useState(false);
  function triggerDissolve() {
    setDissolveActive(true);
    window.setTimeout(() => setDissolveActive(false), 500);
  }

  // A full-window flash (triggerDissolve above) is the wrong tool for
  // crossing into/out of a device bezel: the bezel/mask itself is fine to
  // just snap to its new shape, but the flash doesn't stop the *canvas*
  // underneath from visibly sliding past the (unmoving) screen window during
  // the pan — you'd catch the old page's content dragging across the phone
  // screen before the flash's opacity peaked enough to hide it. This flash
  // is scoped to exactly the screen rect instead, paired with an instant
  // (duration: 0) camera cut so there's never any motion to catch a glimpse
  // of in the first place — the flash then only has to smooth over a swap,
  // not mask a drag.
  const [screenFlash, setScreenFlash] = useState<{ x: number; y: number; width: number; height: number; radius: number } | null>(null);
  function triggerScreenFlash(rect: { x: number; y: number; width: number; height: number }, radius: number) {
    setScreenFlash({ ...rect, radius });
    window.setTimeout(() => setScreenFlash(null), 500);
  }

  // Firestore's onSnapshot has been observed to re-fire (with an identical
  // document set) for reasons that have nothing to do with this app's own
  // edits — confirmed live: on a completely untouched, empty page, this
  // fired every ~1.5s indefinitely, each time producing a brand-new (if
  // logically empty/identical) array via setShapeNodes, which in turn kept
  // retriggering anything depending on shapeNodes' reference — most
  // visibly the page-thumbnail effect's corner spinner, cycling with
  // nothing actually changing. Skipping the setShapeNodes call entirely
  // when the underlying raw doc data hasn't actually changed (compared via
  // a cheap signature, BEFORE the always-fresh onCommit/readOnly etc.
  // injection below) fixes this regardless of why the snapshot re-fired.
  const lastShapesSignatureRef = useRef('');
  function rebuildShapes() {
    const rawMerged: DiagramNode[] = [];
    for (const slice of shapesSlices.current.values()) {
      for (const n of slice.values()) rawMerged.push(n);
    }
    const signature = `${isPresent}|${JSON.stringify(rawMerged.map(n => ({
      id: n.id, position: n.position, width: n.width, height: n.height, zIndex: n.zIndex, parentId: n.parentId, type: n.type, data: n.data,
    })))}`;
    if (signature === lastShapesSignatureRef.current) return;
    lastShapesSignatureRef.current = signature;
    const merged: Node[] = rawMerged.map(n => ({ ...n, data: { ...n.data, onCommit, onNavigateLink: navigateToLink, onResizeGroup: handleResizeGroup, readOnly: isPresent } }));
    // React Flow requires a parent node to appear before its children in the
    // array. Firestore's onSnapshot delivery order is unspecified, so sort by
    // parent-chain depth (a real topological order, not just a two-way
    // parentless/has-parent partition) so this holds at arbitrary nesting
    // depth, not only depth 1. A guard against cycles (which shouldn't occur
    // through the UI, but could from a bad manual edit) treats a cycle member
    // as depth 0 rather than infinite-looping.
    const byId = new Map(merged.map(n => [n.id, n]));
    const depthCache = new Map<string, number>();
    function computeDepth(id: string, guard: Set<string>): number {
      if (depthCache.has(id)) return depthCache.get(id)!;
      if (guard.has(id)) return 0;
      guard.add(id);
      const node = byId.get(id);
      const parentId = node?.parentId;
      const depth = parentId && byId.has(parentId) ? computeDepth(parentId, guard) + 1 : 0;
      depthCache.set(id, depth);
      return depth;
    }
    merged.sort((a, b) => computeDepth(a.id, new Set()) - computeDepth(b.id, new Set()));
    // Firestore documents never carry ephemeral UI state like `selected` —
    // every rebuild (including the echo of our own writes) would otherwise
    // silently clear selection, which yanks the properties panel closed the
    // instant a field is edited. Re-apply selection from the previous state.
    setShapeNodes(prev => {
      const prevSelected = new Set(prev.filter(n => n.selected).map(n => n.id));
      return merged.map(n => prevSelected.has(n.id) ? { ...n, selected: true } : n);
    });
  }

  // Shared by any bulk shape-geometry mutation (page reorder, group/page
  // resize) that computes new positions/sizes from a `shapesSlices`
  // snapshot for potentially many shapes at once. Writing the result back
  // into `shapesSlices.current` here — not just `setShapeNodes` — matters:
  // the per-page Firestore listener calls `rebuildShapes()` on every echo,
  // including the echo of the `saveShape` calls below, and if the slice
  // still held the stale pre-mutation snapshot when that echo lands, the
  // rebuild would revert (or, mid-drag, duplicate) the shapes this just
  // moved. Every single-shape mutation path (applyDataPatch/applySize/
  // applyPosition) already follows this write-slice-then-rebuild order;
  // this is the same pattern generalized to many shapes at once.
  function commitShapeUpdates(updates: { id: string; pageId: string; node: DiagramNode }[]) {
    for (const { id, pageId, node } of updates) {
      let slice = shapesSlices.current.get(pageId);
      if (!slice) { slice = new Map(); shapesSlices.current.set(pageId, slice); }
      slice.set(id, node);
      saveShape(diagramId, pageId, toPersistableShape(node));
    }
    rebuildShapes();
    
    // Force React Flow to re-measure ALL nodes after rebuildShapes creates new references.
    // rebuildShapes calls setShapeNodes with new objects for every node, which triggers
    // React Flow's adoptUserNodes to reset handleBounds/measured to undefined for ALL nodes.
    // Without re-measuring ALL of them, connectors touching any node return null from
    // getEdgePosition and vanish until tab refresh. This is especially critical for
    // multi-node drags (groups, multi-select) where children's connectors also break.
    const allIds: string[] = [];
    for (const slice of shapesSlices.current.values()) {
      for (const node of slice.values()) {
        allIds.push(node.id);
      }
    }
    scheduleUpdateNodeInternals(allIds);
  }

  function rebuildConnectors() {
    const merged: Edge[] = [];
    for (const slice of connectorsSlices.current.values()) {
      for (const e of slice.values()) merged.push(e);
    }
    // Same selection-loss hazard as rebuildShapes — Firestore docs aren't
    // SUPPOSED to carry `selected` (saveConnector strips it before every
    // write), so re-applying local selection state on top of the merged
    // docs is what preserves it across a rebuild. But unlike rebuildShapes
    // (whose merged source is structurally guaranteed selected-free via
    // toPersistableShape), a connector doc written before that strip existed
    // — or by any future write path that forgets to go through
    // saveConnector — could still carry a stale `selected: true`. Explicitly
    // forcing `false` for every id NOT in prevSelected (not just leaving
    // whatever the doc says) means a single tainted doc can't silently
    // resurrect itself as "selected" and get swept up in an unrelated later
    // Delete keypress.
    setConnectorEdges(prev => {
      const prevSelected = new Set(prev.filter(e => e.selected).map(e => e.id));
      return merged.map(e => ({ ...e, selected: prevSelected.has(e.id) }));
    });
  }

  function rebuildComments() {
    const merged: DiagramComment[] = [];
    for (const slice of commentsSlices.current.values()) {
      for (const c of slice.values()) merged.push(c);
    }
    setComments(merged);
  }

  const onEdgeCommit = useCallback((id: string, patch: Partial<SmartEdgeData>) => {
    for (const slice of connectorsSlices.current.values()) {
      const existing = slice.get(id);
      if (existing) {
        const updated: DiagramEdge = { ...existing, data: { ...(existing.data as SmartEdgeData), ...patch } };
        slice.set(id, updated);
        const pageId = findEdgePageId(existing);
        if (pageId) saveConnector(diagramId, pageId, updated);
        rebuildConnectors();
        return;
      }
    }
  }, [diagramId, shapeNodes]);

  function applyDataPatch(id: string, data: ShapeNodeData) {
    for (const slice of shapesSlices.current.values()) {
      const existing = slice.get(id);
      if (existing) {
        const updated: DiagramNode = { ...existing, data };
        slice.set(id, updated);
        saveShape(diagramId, existing.data.pageId, updated);
        rebuildShapes();
        // Force React Flow to re-measure ALL nodes after rebuildShapes creates new references.
        // Same fix as applyPosition/applyPositionBatch/commitShapeUpdates - adoptUserNodes resets handleBounds/measured
        // for all nodes when receiving new object references, causing connectors to vanish.
        const allIds: string[] = [];
        for (const s of shapesSlices.current.values()) {
          for (const node of s.values()) {
            allIds.push(node.id);
          }
        }
        scheduleUpdateNodeInternals(allIds);
        return;
      }
    }
  }
  const onCommit = useCallback((id: string, patch: Partial<ShapeNodeData>) => {
    for (const slice of shapesSlices.current.values()) {
      const existing = slice.get(id);
      if (existing) {
        const prevData = existing.data;
        const nextData = { ...existing.data, ...patch };
        applyDataPatch(id, nextData);
        pushDebouncedHistory(`data:${id}`, prevData, nextData, d => applyDataPatch(id, d));
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagramId]);

  // Tracks whether the currently-selected shape is mid text-edit (typing
  // inside it), reported by ShapeNode via data.onEditingChange — used to
  // hide the floating shape quick-actions toolbar (container/z-order/
  // duplicate/delete) below, since those act on the shape as an object and
  // have no meaning while the user is just typing text into it, and the
  // toolbar's fixed top-of-canvas position otherwise overlaps whatever
  // shape happens to be selected near the top of the viewport.
  const [editingShapeId, setEditingShapeId] = useState<string | null>(null);
  const handleShapeEditingChange = useCallback((id: string, editing: boolean) => {
    setEditingShapeId(prev => (editing ? id : (prev === id ? null : prev)));
  }, []);

  function applySize(id: string, size: { width: number; height: number }) {
    for (const slice of shapesSlices.current.values()) {
      const existing = slice.get(id);
      if (existing) {
        const updated: DiagramNode = { ...existing, width: size.width, height: size.height };
        slice.set(id, updated);
        saveShape(diagramId, existing.data.pageId, updated);
        rebuildShapes();
        // Force React Flow to re-measure ALL nodes after rebuildShapes creates new references.
        // Same fix as applyPosition/applyPositionBatch/commitShapeUpdates - adoptUserNodes resets handleBounds/measured
        // for all nodes when receiving new object references, causing connectors to vanish.
        const allIds: string[] = [];
        for (const s of shapesSlices.current.values()) {
          for (const node of s.values()) {
            allIds.push(node.id);
          }
        }
        scheduleUpdateNodeInternals(allIds);
        return;
      }
    }
  }
  // Precise numeric resize (e.g. the properties panel's mm-based width/
  // height inputs) — width/height live on the node itself, not `.data`, so
  // this can't go through onCommit above.
  const handleResizeShape = useCallback((id: string, width: number, height: number) => {
    for (const slice of shapesSlices.current.values()) {
      const existing = slice.get(id);
      if (existing) {
        const prevSize = { width: existing.width ?? 100, height: existing.height ?? 70 };
        const nextSize = { width, height };
        applySize(id, nextSize);
        pushDebouncedHistory(`size:${id}`, prevSize, nextSize, s => applySize(id, s));
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagramId]);

  function applyPosition(id: string, position: { x: number; y: number }) {
    for (const slice of shapesSlices.current.values()) {
      const existing = slice.get(id);
      if (existing) {
        const updated: DiagramNode = { ...existing, position };
        slice.set(id, updated);
        saveShape(diagramId, existing.data.pageId, updated);
        rebuildShapes();
        // Force React Flow to re-measure ALL nodes after rebuildShapes creates new references.
        // Same fix as applyPositionBatch/commitShapeUpdates - adoptUserNodes resets handleBounds/measured
        // for all nodes when receiving new object references, causing connectors to vanish.
        const allIds: string[] = [];
        for (const s of shapesSlices.current.values()) {
          for (const node of s.values()) {
            allIds.push(node.id);
          }
        }
        scheduleUpdateNodeInternals(allIds);
        return;
      }
    }
  }
  // Batched version for multi-shape undo/redo (align/distribute/nudge) —
  // one call covering every id, not applyPosition called per-id in a loop —
  // so it commits as one atomic write. See saveShapes' own comment in
  // store.ts for why an unbatched per-shape write here let subscribeShapes'
  // listener rebuild this app's shape state from a partial mix of updated/
  // stale docs mid-flight.
  function applyPositionBatch(entries: Map<string, { x: number; y: number }>) {
    const updates: { pageId: string; node: DiagramNode }[] = [];
    for (const [id, position] of entries) {
      for (const slice of shapesSlices.current.values()) {
        const existing = slice.get(id);
        if (existing) {
          const updated: DiagramNode = { ...existing, position };
          slice.set(id, updated);
          updates.push({ pageId: existing.data.pageId, node: updated });
          break;
        }
      }
    }
    rebuildShapes();
    if (updates.length > 0) saveShapes(diagramId, updates);
    
    // Force React Flow to re-measure ALL nodes after rebuildShapes creates new references.
    // Same fix as commitShapeUpdates - adoptUserNodes resets handleBounds/measured for all
    // nodes when receiving new object references, causing connectors to vanish.
    const allIds: string[] = [];
    for (const slice of shapesSlices.current.values()) {
      for (const node of slice.values()) {
        allIds.push(node.id);
      }
    }
    scheduleUpdateNodeInternals(allIds);
  }
  // Precise numeric move (the properties panel's mm-based X/Y inputs) —
  // same "lives on the node, not `.data`" reasoning as handleResizeShape.
  const handleMoveShape = useCallback((id: string, x: number, y: number) => {
    for (const slice of shapesSlices.current.values()) {
      const existing = slice.get(id);
      if (existing) {
        const prevPos = existing.position;
        const nextPos = { x, y };
        applyPosition(id, nextPos);
        pushDebouncedHistory(`pos:${id}`, prevPos, nextPos, p => applyPosition(id, p));
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagramId]);

  // Resizing a group's own frame proportionally rescales every descendant
  // (any nesting depth) rather than leaving them at their old absolute
  // pixel geometry inside a now differently-sized frame, which would just
  // look broken (content overflowing or not filling the new bounds). Reads
  // the Firestore-committed snapshot directly (via shapesSlices, not the
  // `shapeNodes` React state) so this stays correct no matter when this
  // callback's closure was captured — same reasoning as onCommit above.
  const handleResizeGroup = useCallback((groupId: string, newWidth: number, newHeight: number, newX: number, newY: number) => {
    const oldGroup = getCommittedShape(groupId);
    if (!oldGroup) return;
    const oldWidth = oldGroup.width ?? 100;
    const oldHeight = oldGroup.height ?? 100;
    const scaleX = oldWidth > 0 ? newWidth / oldWidth : 1;
    const scaleY = oldHeight > 0 ? newHeight / oldHeight : 1;

    const allCommitted: DiagramNode[] = [];
    for (const slice of shapesSlices.current.values()) for (const n of slice.values()) allCommitted.push(n);
    const byId = new Map(allCommitted.map(n => [n.id, n]));
    const descendantIds = new Set<string>();
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of allCommitted) {
        if (n.parentId && (n.parentId === groupId || descendantIds.has(n.parentId)) && !descendantIds.has(n.id)) {
          descendantIds.add(n.id);
          grew = true;
        }
      }
    }

    type GeomSnapshot = { id: string; position: { x: number; y: number }; width?: number; height?: number; pageId: string };
    const before: GeomSnapshot[] = [{ id: groupId, position: oldGroup.position, width: oldGroup.width, height: oldGroup.height, pageId: oldGroup.data.pageId }];
    const after: GeomSnapshot[] = [{ id: groupId, position: { x: newX, y: newY }, width: newWidth, height: newHeight, pageId: oldGroup.data.pageId }];
    for (const id of descendantIds) {
      const n = byId.get(id);
      if (!n) continue;
      before.push({ id, position: n.position, width: n.width, height: n.height, pageId: n.data.pageId });
      after.push({
        id,
        position: { x: n.position.x * scaleX, y: n.position.y * scaleY },
        width: n.width !== undefined ? n.width * scaleX : undefined,
        height: n.height !== undefined ? n.height * scaleY : undefined,
        pageId: n.data.pageId,
      });
    }

    function applySnapshots(snaps: GeomSnapshot[]) {
      commitShapeUpdates(snaps.map(s => {
        const existing = byId.get(s.id)!;
        const updated = { ...existing, position: s.position, ...(s.width !== undefined ? { width: s.width } : {}), ...(s.height !== undefined ? { height: s.height } : {}) };
        return { id: s.id, pageId: s.pageId, node: updated };
      }));
    }

    applySnapshots(after);
    pushHistory({ undo: () => applySnapshots(before), redo: () => applySnapshots(after) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagramId]);

  // "Magic Resize" — when a page's paper size/orientation changes, every
  // shape belonging to that page (any nesting depth) is rescaled by the
  // same factor rather than left at its old absolute pixel geometry inside
  // a differently-sized page. Applying the SAME scaleX/scaleY uniformly at
  // every depth (not just top-level shapes) correctly reproduces a uniform
  // scale of the whole page's content, same reasoning as handleResizeGroup
  // above — only top-level shapes need the extra page-origin math, since a
  // nested shape's position is already relative to its own parent, not the
  // page.
  const handleResizePageContent = useCallback((pageId: string, scaleX: number, scaleY: number, pageOrigin: number) => {
    const allCommitted: DiagramNode[] = [];
    for (const slice of shapesSlices.current.values()) for (const n of slice.values()) allCommitted.push(n);
    const pageShapes = allCommitted.filter(n => n.data.pageId === pageId);
    if (pageShapes.length === 0) return;
    const byId = new Map(pageShapes.map(n => [n.id, n]));

    type GeomSnapshot = { id: string; position: { x: number; y: number }; width?: number; height?: number };
    const before: GeomSnapshot[] = [];
    const after: GeomSnapshot[] = [];
    for (const n of pageShapes) {
      before.push({ id: n.id, position: n.position, width: n.width, height: n.height });
      const isTopLevel = !n.parentId;
      const newPosition = isTopLevel
        ? { x: n.position.x * scaleX, y: pageOrigin + (n.position.y - pageOrigin) * scaleY }
        : { x: n.position.x * scaleX, y: n.position.y * scaleY };
      after.push({
        id: n.id, position: newPosition,
        width: n.width !== undefined ? n.width * scaleX : undefined,
        height: n.height !== undefined ? n.height * scaleY : undefined,
      });
    }

    function applySnapshots(snaps: GeomSnapshot[]) {
      commitShapeUpdates(snaps.map(s => {
        const existing = byId.get(s.id)!;
        const updated = { ...existing, position: s.position, ...(s.width !== undefined ? { width: s.width } : {}), ...(s.height !== undefined ? { height: s.height } : {}) };
        return { id: s.id, pageId, node: updated };
      }));
    }

    applySnapshots(after);
    pushHistory({ undo: () => applySnapshots(before), redo: () => applySnapshots(after) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagramId]);

  // Reordering pages changes each page's cumulative Y origin in the stacked
  // canvas (see the pageOrigins useMemo above), but every shape stores an
  // ABSOLUTE canvas Y position — without this, a page's frame moves to its
  // new slot while every shape on it stays exactly where it was, visually
  // leaving the whole page's content behind. Mirrors handleResizePageContent's
  // "read every committed shape, shift top-level ones, persist" shape.
  const handleReorderPagesWithShapes = useCallback((reordered: DiagramPage[]) => {
    const newOrigins = new Map<string, number>();
    let cursorY = 0;
    for (const page of reordered) {
      newOrigins.set(page.id, cursorY);
      const { height } = getPageDimensions(page.paperSize, page.orientation, page.customWidth, page.customHeight);
      cursorY += height + PAGE_GAP;
    }

    const allCommitted: DiagramNode[] = [];
    for (const slice of shapesSlices.current.values()) for (const n of slice.values()) allCommitted.push(n);
    const byId = new Map(allCommitted.map(n => [n.id, n]));

    const updates = new Map<string, { pageId: string; position: { x: number; y: number } }>();
    for (const page of reordered) {
      const deltaY = (newOrigins.get(page.id) ?? 0) - (pageOrigins.get(page.id) ?? 0);
      if (deltaY === 0) continue;
      for (const n of allCommitted) {
        // Only top-level shapes carry an absolute, page-relative Y — a
        // grouped/contained child's position is already local to its parent.
        if ((n.data as ShapeNodeData).pageId !== page.id || n.parentId) continue;
        updates.set(n.id, { pageId: page.id, position: { x: n.position.x, y: n.position.y + deltaY } });
      }
    }

    if (updates.size > 0) {
      commitShapeUpdates(
        Array.from(updates.entries()).map(([id, u]) => ({
          id,
          pageId: u.pageId,
          node: { ...byId.get(id)!, position: u.position },
        }))
      );
    }

    onReorderPages?.(reordered);
  }, [diagramId, pageOrigins, onReorderPages]);

  const [penMode, setPenMode] = useState(false);
  const [draftAnchors, setDraftAnchors] = useState<PathAnchor[]>([]);
  const [penDrag, setPenDrag] = useState<{ start: { x: number; y: number }; current: { x: number; y: number } } | null>(null);
  const lastPenClickRef = useRef<{ time: number; x: number; y: number } | null>(null);

  // Freehand brush tool. Style/color are chosen from the properties panel
  // AFTER a stroke is placed (like every other shape) — while drawing, only
  // raw geometry (points + simulated/real pressure) is captured, since the
  // stamp-rendering function that turns points into a look is shared and
  // style-agnostic, so nothing about the captured data depends on which
  // brush look gets picked.
  const [brushMode, setBrushMode] = useState(false);
  const [brushDraft, setBrushDraft] = useState<BrushPoint[] | null>(null);

  // Style Paint ("format painter"): click a source shape to pick up its
  // look, then click any number of target shapes to apply it — stays armed
  // across multiple targets until the tool is toggled off or Escape'd,
  // matching PowerPoint/Illustrator's own format-painter convention.
  const [stylePaintMode, setStylePaintMode] = useState(false);
  const [stylePaintSource, setStylePaintSource] = useState<Partial<ShapeNodeData> | null>(null);

  // Click-to-place: picking a shape (from the gallery or the quick Hotspot
  // button) no longer creates it immediately — it arms this, and the next
  // canvas click places it exactly there instead of always at the viewport
  // center. Single-use: placing one shape disarms it again. The gallery
  // panel itself (unlike the old modal) never needs to reopen after a
  // placement — it's a non-modal panel, so it simply never closed in the
  // first place; see beginPlacingShape's `keepGalleryOpen` option.
  const [shapeGalleryOpen, setShapeGalleryOpen] = useState(false);
  const { favorites, isFavorite, toggleFavorite } = useFavoriteShapes();
  const { defaults: toolDefaults, updatePenDefaults, updateBrushDefaults, updateConnectorDefaults } = useToolDefaults();
  const { prefs: uxPrefs, updatePrefs: updateUxPrefs } = useUxPreferences();
  // Align-to-key-object: which shape (if any) is the alignment anchor,
  // promoted by clicking an already-selected shape again while 2+ are
  // selected — see onNodesChange's own comment for the exact click pattern
  // this recognizes. Cleared on any other selection-changing action.
  const [keyObjectId, setKeyObjectId] = useState<string | null>(null);
  const [placingShapeKind, setPlacingShapeKind] = useState<ShapeKind | null>(null);
  const [pendingMediaPlacement, setPendingMediaPlacement] = useState<{
    kind: 'image' | 'video'; url: string; width: number; height: number; fileSizeBytes?: number; downsampled?: boolean;
  } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ fileName: string; percent: number } | null>(null);
  // Carries per-placement data the gallery can't express via `kind` alone —
  // e.g. which icon glyph or ArchiMate element type was picked.
  const [pendingShapeExtraData, setPendingShapeExtraData] = useState<Partial<ShapeNodeData> | null>(null);
  // Raw screen coordinates (not flow-space) for the ShapeStampCursor overlay —
  // only tracked while a shape is armed, so normal mousemoves outside
  // placing mode don't pay for an extra re-render.
  const [stampScreenPos, setStampScreenPos] = useState<{ x: number; y: number } | null>(null);

  // Comment placement + thread panel state. A comment pin is only ever
  // persisted once its first message is actually posted — clicking to place
  // one just opens the panel in "compose" mode against a not-yet-saved
  // {pageId,x,y}, so closing the panel without typing anything leaves no
  // orphan pin behind.
  const [placingComment, setPlacingComment] = useState(false);
  const [draftComment, setDraftComment] = useState<{ pageId: string; x: number; y: number } | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  // Screen-space rect for the drag-select marquee overlay, while active.
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Arrow/connector tool — click-drag from anywhere on a shape's body to
  // another shape, rather than needing to grab the tiny edge handle. Stays
  // active for multiple connectors until toggled off or Escape.
  const [connectMode, setConnectMode] = useState(false);
  const [connectDrag, setConnectDrag] = useState<{ sourceId: string; sourceAnchorIndex?: number; sourceX: number; sourceY: number; current: { x: number; y: number } } | null>(null);

  // Post-creation anchor editing for a path shape — derived directly from
  // selection (not a separate mode you have to switch into) so selecting a
  // path immediately shows its editable points, matching how every other
  // vector tool works. Only when exactly one path is selected, matching
  // singleSelectedShape's own single-selection semantics.
  const editingPathId = (() => {
    const selectedPaths = shapeNodes.filter(n => n.selected && n.type === 'path');
    return selectedPaths.length === 1 ? selectedPaths[0].id : null;
  })();

  // Direct Selection — a real, explicit tool (Illustrator's "A" key) layered
  // on top of the always-visible anchor overlay above. Selecting a path
  // still passively shows its points (editingPathId, unchanged); this mode
  // gates whether those points are actually INTERACTIVE (draggable,
  // insertable, deletable, nudgeable) vs. the shape's body/NodeResizer being
  // the thing that responds to clicks. Without this split, a click could
  // ambiguously mean "move the whole shape" or "move this one point."
  const [directSelectMode, setDirectSelectMode] = useState(false);
  const [activeAnchorIndex, setActiveAnchorIndex] = useState<number | null>(null);

  const [highlightMode, setHighlightMode] = useState(false);
  const [highlighted, setHighlighted] = useState<{ nodeIds: Set<string>; edgeIds: Set<string> } | null>(null);

  // Hand tool (Affinity/Photoshop-style) — an explicit, sticky "pan only"
  // mode you switch into via the toolbar, distinct from Space (a held-key
  // TEMPORARY override of whatever tool is active, see isSpaceDown below).
  // Folded into toolActive below so every existing toolActive-gated
  // behavior (nodes not draggable/selectable/connectable while some
  // exclusive interaction mode owns the canvas) applies here for free —
  // Hand mode should behave exactly like "some other tool is active" for
  // all of those, on top of its own additional panOnDrag/selectionOnDrag
  // handling near the <ReactFlow> element itself.
  const [handMode, setHandMode] = useState(false);

  const toolActive = penMode || connectMode || directSelectMode || brushMode || stylePaintMode || highlightMode || handMode || !!placingShapeKind;

  // Holding Spacebar grab-pans the camera — including over shapes, not just
  // empty canvas — by temporarily disabling node dragging/selection and
  // switching React Flow's left-drag behavior to pan instead. A held key
  // (not a toggle) so it can't be left on by accident; released the moment
  // focus moves to a text input so it never fights normal typing/space bar
  // use there.
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [isSpaceDragging, setIsSpaceDragging] = useState(false);
  useEffect(() => {
    if (isPresent) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== 'Space' || isTypingTarget(e.target) || e.repeat) return;
      e.preventDefault(); // stops the page from scrolling on Space
      setIsSpaceDown(true);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') setIsSpaceDown(false);
    }
    function onBlur() { setIsSpaceDown(false); }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [isPresent]);

  // The one shared reset+activate function behind every toolbar button
  // (drawing modes AND right-side panels alike) — replaces what used to be
  // clearOtherTools() (mode flags only) plus five separate hand-written
  // per-panel reset lists. Unconditionally resets EVERY mode/panel flag,
  // then activates exactly the one requested. Two real bugs this fixes for
  // free just by existing: Branch Highlight used to skip clearOtherTools()
  // entirely (so it could stack with any drawing tool); Data/Animation's
  // own hand-written reset lists each independently forgot to close
  // Validation. With one shared reset list, neither can happen again.
  function selectTool(toolId: ToolId) {
    // Finalize (not discard) an in-progress pen path when switching tools —
    // matches the pen tool's own Escape/toggle-off behavior.
    if (penMode) {
      if (draftAnchors.length >= 2) finalizePath(draftAnchors, false);
      else setDraftAnchors([]);
    }
    setPenMode(false); lastPenClickRef.current = null;
    setConnectMode(false); setConnectDrag(null);
    setPlacingShapeKind(null); setPendingMediaPlacement(null);
    setPendingShapeExtraData(null);
    setHighlightMode(false); setHighlighted(null);
    setDirectSelectMode(false); setActiveAnchorIndex(null);
    setPlacingComment(false);
    setBrushMode(false);
    setStylePaintMode(false); setStylePaintSource(null);
    setHandMode(false);
    setLayersPanelOpen(false);
    setAnimationPanelOpen(false); setRevealStep(-1);
    setDataPanelOpen(false);
    setValidationPanelOpen(false);
    setPageSettingsPanelOpen(false);
    setGridRulersPanelOpen(false);
    setTagsPanelOpen(false);
    setShapeGalleryOpen(false);

    switch (toolId) {
      case 'select': break;
      case 'hand': setHandMode(true); break;
      case 'directSelect': setDirectSelectMode(true); break;
      case 'pen': setPenMode(true); break;
      case 'brush': setBrushMode(true); break;
      case 'stylePaint': setStylePaintMode(true); break;
      case 'connect': setConnectMode(true); break;
      case 'comment': setPlacingComment(true); break;
      case 'highlight': setHighlightMode(true); break;
      case 'layers': setLayersPanelOpen(true); break;
      case 'animation': setAnimationPanelOpen(true); break;
      case 'data': setDataPanelOpen(true); break;
      case 'validation': setValidationPanelOpen(true); break;
      case 'pageSettings': setPageSettingsPanelOpen(true); break;
      case 'gridRulers': setGridRulersPanelOpen(true); break;
      case 'tags': setTagsPanelOpen(true); break;
      case 'shapeGallery': setShapeGalleryOpen(true); break;
      // 'shapes'/'hotspot'/'media' are armed via beginPlacingShape(kind) /
      // handleUploadMedia(file), not reachable through this switch directly —
      // both call selectTool('select') first for the same blanket reset,
      // then set placingShapeKind themselves.
    }
  }

  // Reset anchor focus whenever the edited path changes (including becoming
  // null) so a stale index never survives onto a different path's anchors.
  useEffect(() => {
    setActiveAnchorIndex(null);
  }, [editingPathId]);

  const [animationPanelOpen, setAnimationPanelOpen] = useState(false);
  const [revealStep, setRevealStep] = useState(-1);
  const [presentPageIndex, setPresentPageIndex] = useState(0);
  const [presentStep, setPresentStep] = useState(-1);
  const presentPage = pages[presentPageIndex];

  // Session-only "just for now" override — the persisted default (frame
  // style/corners/color) lives on the diagram doc via presentationSettings,
  // but a presenter may want to punch a single landscape/desktop page to
  // full-bleed for emphasis without changing that saved default for anyone
  // else. Toggling this never writes to Firestore.
  const [fullscreenOverride, setFullscreenOverride] = useState(false);
  const [presentSettingsOpen, setPresentSettingsOpen] = useState(false);

  // Real OS-level fullscreen (Fullscreen API) — distinct from fullscreenOverride
  // above, which only skips the device-frame decoration inside the browser
  // window. This actually hides the browser's own tab bar/address bar, like
  // PowerPoint's presentation mode taking over the whole monitor. Browsers
  // require a direct user gesture to grant this — PresentationView's
  // best-effort auto-request on mount is silently blocked by that policy in
  // practice, so a real button click is the only reliable way in.
  const [osFullscreen, setOsFullscreen] = useState(!!document.fullscreenElement);
  useEffect(() => {
    if (!isPresent) return;
    function onChange() { setOsFullscreen(!!document.fullscreenElement); }
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [isPresent]);
  function toggleOsFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }
  const effectivePresentationSettings: PresentationSettings = useMemo(() => {
    const base = { ...DEFAULT_PRESENTATION_SETTINGS, ...presentationSettings };
    return fullscreenOverride ? { ...base, frameMode: 'none' } : base;
  }, [presentationSettings, fullscreenOverride]);

  // How the current presentation page is framed on screen — a device bezel
  // (phone/tablet/watch), a monitor mockup, a floating slide, or true
  // full-bleed fullscreen when the page's own aspect ratio already matches
  // the window closely (or the presenter forced it via fullscreenOverride).
  // Read through a ref so navigateToLink (baked into node data at
  // Firestore-subscription time, per the "latest ref" pattern used
  // throughout this file) always sees the current layout, not a stale one
  // from whichever render its closure was created in.
  const presentLayout = useMemo(
    () => presentPage
      ? computePresentationLayout(pageDimensions.get(presentPage.id) ?? { width: 794, height: 1123 }, presentPage.paperSize, windowSize, effectivePresentationSettings)
      : null,
    [presentPage, pageDimensions, windowSize, effectivePresentationSettings],
  );
  const presentLayoutRef = useRef(presentLayout);
  presentLayoutRef.current = presentLayout;
  const effectiveSettingsRef = useRef(effectivePresentationSettings);
  effectiveSettingsRef.current = effectivePresentationSettings;

  const sequenceItems = useMemo<SequenceItem[]>(() => [
    ...shapeNodes.filter(n => n.type === 'shape').map(n => ({
      id: n.id, kind: 'shape' as const,
      label: (n.data as ShapeNodeData).label || (n.data as ShapeNodeData).kind,
      revealOrder: (n.data as ShapeNodeData).revealOrder,
      pageId: (n.data as ShapeNodeData).pageId,
      animationType: (n.data as ShapeNodeData).animationType,
      animationDuration: (n.data as ShapeNodeData).animationDuration,
    })),
    ...connectorEdges.map(e => ({
      id: e.id, kind: 'connector' as const,
      label: (e.data as SmartEdgeData | undefined)?.label || 'Connector',
      revealOrder: (e.data as SmartEdgeData | undefined)?.revealOrder,
      pageId: findPageIdFor(shapeNodes.find(n => n.id === e.source)),
    })),
  ], [shapeNodes, connectorEdges]);

  // Reveal order is assigned as one contiguous sequence across the whole
  // document (renumberSequence below), so filtering to one page's items
  // yields a non-contiguous subset of order values. Presentation mode must
  // therefore compare against the *value* at presentStep's position in the
  // page-scoped list, not against presentStep as if it were that value.
  const presentSequence = useMemo(
    () => isPresent && presentPage
      ? sequenceItems.filter(i => i.pageId === presentPage.id && i.revealOrder !== undefined)
        .sort((a, b) => (a.revealOrder ?? 0) - (b.revealOrder ?? 0))
      : [],
    [isPresent, presentPage, sequenceItems],
  );
  const presentThresholdOrder = presentStep >= 0 ? presentSequence[presentStep]?.revealOrder ?? -Infinity : -Infinity;

  // Tags currently toggled off via the Tags panel — a local view filter
  // (never persisted), read by isTagHidden below. Declared here, ahead of
  // the `nodes` useMemo a few lines down, since that memo's callback runs
  // synchronously during render (unlike an event-handler closure), so
  // referencing a not-yet-declared `const` at that point would throw.
  const [hiddenTags, setHiddenTags] = useState<Set<string>>(new Set());
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of shapeNodes) {
      for (const t of (n.data as ShapeNodeData).tags ?? []) set.add(t);
    }
    return Array.from(set).sort();
  }, [shapeNodes]);
  function toggleTagVisibility(tag: string) {
    setHiddenTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
  }

  // Persisted layer-visibility (data.hidden, set via the Layers panel) is
  // distinct from the ephemeral __hidden reveal-order overlay computed below
  // — a shape can be mid-reveal-sequence AND author-hidden at once, so these
  // must compose rather than merge into one flag. Persisted-hidden is mapped
  // to React Flow's own top-level `hidden` field (real interaction-blocking,
  // not just opacity) and must cascade down through parentId chains, since RF
  // doesn't automatically hide children of a hidden parent group.
  function isPersistedHidden(id: string, byId: Map<string, Node>, guard: Set<string> = new Set()): boolean {
    if (guard.has(id)) return false;
    guard.add(id);
    const node = byId.get(id);
    if (!node) return false;
    if ((node.data as ShapeNodeData).hidden) return true;
    return node.parentId ? isPersistedHidden(node.parentId, byId, guard) : false;
  }

  // A shape (or an ancestor) carrying any currently-toggled-off tag is
  // hidden too — this is a purely local viewer filter (hiddenTags is
  // client-side React state, never written to Firestore), unlike
  // isPersistedHidden's data.hidden, which every collaborator shares.
  function isTagHidden(id: string, byId: Map<string, Node>, guard: Set<string> = new Set()): boolean {
    if (guard.has(id)) return false;
    guard.add(id);
    const node = byId.get(id);
    if (!node) return false;
    const tags = (node.data as ShapeNodeData).tags;
    if (tags?.some(t => hiddenTags.has(t))) return true;
    return node.parentId ? isTagHidden(node.parentId, byId, guard) : false;
  }

  // Combined-bounding-box resize handles for a multi-selection — previously
  // each shape in a multi-select only exposed its OWN resize handles, so
  // dragging any one of them resized just that shape rather than "the
  // selection" as a whole (unlike a real group, whose GroupNode frame
  // already does this). Computed straight from shapeNodes' own `.selected`
  // flag rather than the derived `selectedShapeIds` below (which itself
  // derives from `nodes` — using it here would be a circular dependency).
  // Only top-level, unlocked shapes participate: a selected group's child
  // has a parent-relative position, not the absolute one this math assumes.
  const multiSelectTargets = useMemo(
    () => shapeNodes.filter(n => n.selected && !n.parentId && !(n.data as ShapeNodeData).locked),
    [shapeNodes],
  );
  const multiSelectOverlayNode = useMemo<Node[]>(() => {
    if (multiSelectTargets.length < 2) return [];
    const boxes = multiSelectTargets.map(getBBox);
    const minX = Math.min(...boxes.map(b => b.x));
    const minY = Math.min(...boxes.map(b => b.y));
    const maxX = Math.max(...boxes.map(b => b.x + b.w));
    const maxY = Math.max(...boxes.map(b => b.y + b.h));
    // This overlay must render above every shape it wraps, or a fixed
    // zIndex here loses the corner-handle hit-test to whichever selected
    // shape's own corner happens to coincide with the overlay's (virtually
    // always true — a bbox corner IS one of the selected shapes' own
    // corners), so dragging a corner only ever resized that one shape.
    // Computed relative to the highest selected shape's own real zIndex
    // (elevateNodesOnSelect is off — see the main <ReactFlow> element's own
    // comment — so that's exactly what actually renders, no automatic RF
    // boost to account for) plus a generous margin, so this can't regress
    // if a shape's own zIndex is ever pushed unusually high by repeated
    // "bring to front" use.
    const maxSelectedZ = Math.max(0, ...multiSelectTargets.map(n => (n.zIndex ?? 0) + 1000));
    return [{
      id: '__multiselect__',
      type: 'multiSelectOverlay',
      position: { x: minX, y: minY },
      width: maxX - minX,
      height: maxY - minY,
      selectable: false,
      draggable: false,
      zIndex: maxSelectedZ + 1,
      // `selectable`/`draggable` above only stop REACT FLOW's own node
      // logic from treating this node as interactive — they don't touch
      // the wrapper DIV React Flow itself renders for every node, which
      // defaults to pointer-events:auto regardless. Sitting a full pointer-
      // events:auto box directly on top of every selected shape (by
      // definition — this node's bbox is exactly their union) swallowed
      // every ordinary click-and-drag on the group before it ever reached
      // a real shape underneath: the drag never started, so nothing moved.
      // MultiSelectOverlayNode's own root div already sets pointer-
      // events:none and re-enables it only on the actual resize handles
      // (NodeResizer/EdgeResizeHandles' lineStyle/handleStyle) — this does
      // the same for the outer wrapper the component itself has no control
      // over, via the one thing that CAN reach it: the node's own `style`.
      style: { pointerEvents: 'none' },
      data: {
        onResizeStart: handleMultiSelectResizeStart, onResizeEnd: handleMultiSelectResizeEnd,
        onRotateStart: uxPrefs.multiSelectRotateEnabled ? handleGroupRotateStart : undefined,
      },
    }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiSelectTargets, uxPrefs.multiSelectRotateEnabled]);

  const nodes = useMemo(() => {
    const byId = new Map(shapeNodes.map(n => [n.id, n]));
    const styled = shapeNodes.map(n => {
      const shapeData = n.data as ShapeNodeData;
      // connectMode/onStartConnect are always injected (unlike the other
      // conditional `extra` fields below) so every shape's ConnectionHandles
      // picks up live tool state and can report a connect-drag start.
      // directSelectMode is injected the same way so PathNode can hide its
      // NodeResizer while anchor points are the interactive thing instead.
      const extra: Record<string, unknown> = {
        connectMode, onStartConnect: handleStartConnect, directSelectMode, onEditingChange: handleShapeEditingChange,
        shiftRotateConstrainEnabled: uxPrefs.shiftRotateConstrainEnabled,
        altResizeFromCenterEnabled: uxPrefs.altResizeFromCenterEnabled,
        onResizeAltStart: handleResizeAltStart,
      };
      if (shapeData.dataBinding) {
        const resolved = resolveStyle(shapeData.dataBinding, variables);
        if (resolved) extra.__resolvedStyle = resolved;
      }
      if (uxPrefs.alignToKeyObjectEnabled && keyObjectId === n.id) extra.isKeyObject = true;
      if (highlighted) extra.__dimmed = !highlighted.nodeIds.has(n.id);
      if (isPresent && shapeData.pageId === presentPage?.id && shapeData.revealOrder !== undefined) {
        extra.__hidden = shapeData.revealOrder > presentThresholdOrder;
      } else if (!isPresent && animationPanelOpen && shapeData.revealOrder !== undefined) {
        extra.__hidden = shapeData.revealOrder > revealStep;
      }
      const locked = !!shapeData.locked;
      return {
        ...n, data: { ...n.data, ...extra },
        hidden: isPersistedHidden(n.id, byId) || isTagHidden(n.id, byId),
        // An explicit per-node `draggable` always overrides RF's global
        // nodesDraggable prop, so it must repeat the same toolActive/isPresent
        // gates — otherwise clicking a shape's body while the Arrow/Pen tool
        // is active drags the shape instead of starting a connector/path, and
        // shapes stay movable while presenting since the global prop alone
        // isn't enough to block it. Also gated on isSpaceDown so holding
        // Space grab-pans the camera even when the cursor starts a drag over
        // a shape, instead of moving that shape.
        draggable: !locked && !toolActive && !isPresent && !isSpaceDown,
        connectable: !locked && !isPresent,
        // Explicit per-node override of the (now edge-inclusive) global
        // elementsSelectable prop below — a shape shouldn't be selectable
        // while a tool (e.g. the connector/pen tool) is active, since
        // clicking one is meant to draw/connect, not select it. Edges have
        // no such per-node override, so they stay selectable even during
        // connect-mode — see the toolActive comment on elementsSelectable.
        selectable: !isPresent && !toolActive,
      };
    });
    // Comment pins are an authoring/collaboration affordance, not part of
    // the diagram's actual content — hidden while presenting, same as the
    // page navigator rail and other editor-only chrome. Stay visible in
    // 'comment' mode specifically, unlike every other isPresent-gated bit
    // of editor chrome.
    const commentNodes: Node[] = !commentsEnabled ? [] : comments.map(c => ({
      id: c.id,
      type: 'comment',
      position: { x: c.x - 13, y: c.y - 13 },
      width: 26,
      height: 26,
      draggable: false,
      selectable: false,
      zIndex: 20,
      data: {
        resolved: c.resolved, replyCount: c.replies.length, active: c.id === activeCommentId, x: c.x, y: c.y,
        onOpen: (id: string) => { setDraftComment(null); setActiveCommentId(id); },
        onMove: handleMoveComment,
      },
    }));
    // A not-yet-saved draft still gets a visible marker at its drop point —
    // otherwise clicking with the comment tool would open the compose panel
    // with no on-canvas indication of where the pin is actually landing.
    if (commentsEnabled && draftComment) {
      commentNodes.push({
        id: '__draft-comment__',
        type: 'comment',
        position: { x: draftComment.x - 13, y: draftComment.y - 13 },
        width: 26,
        height: 26,
        draggable: false,
        selectable: false,
        zIndex: 20,
        data: { resolved: false, replyCount: 0, active: true, onOpen: () => {} },
      });
    }
    return [...frameNodes, ...inheritedMasterNodes, ...styled, ...commentNodes, ...multiSelectOverlayNode];
  }, [frameNodes, inheritedMasterNodes, shapeNodes, variables, highlighted, animationPanelOpen, revealStep, isPresent, commentsEnabled, presentPage, presentThresholdOrder, connectMode, toolActive, isSpaceDown, directSelectMode, handleShapeEditingChange, comments, activeCommentId, draftComment, hiddenTags, multiSelectOverlayNode, uxPrefs.shiftRotateConstrainEnabled, uxPrefs.altResizeFromCenterEnabled, uxPrefs.alignToKeyObjectEnabled, keyObjectId]);

  const baseEdges = useMemo(() => [...connectorEdges, ...inheritedMasterEdges].map(e => {
    const edgeData = e.data as SmartEdgeData | undefined;
    const edgePageId = findPageIdFor(shapeNodes.find(n => n.id === e.source));
    let hidden = false;
    if (isPresent && edgePageId === presentPage?.id && edgeData?.revealOrder !== undefined) {
      hidden = edgeData.revealOrder > presentThresholdOrder;
    } else if (!isPresent && animationPanelOpen && edgeData?.revealOrder !== undefined) {
      hidden = edgeData.revealOrder > revealStep;
    }
    return {
      ...e,
      markerStart: arrowMarker(edgeData?.startArrow, 'none'),
      markerEnd: arrowMarker(edgeData?.endArrow, 'arrowClosed'),
      data: { ...e.data, __dimmed: highlighted ? !highlighted.edgeIds.has(e.id) : false, __hidden: hidden },
    };
  }), [connectorEdges, inheritedMasterEdges, shapeNodes, highlighted, animationPanelOpen, revealStep, isPresent, presentPage, presentThresholdOrder]);

  // G24: give overlapping straight connectors a small bump where they
  // visually cross (v1 — orthogonal/curved routing untouched; an
  // anchor-docked edge is excluded too, since an interior anchor point isn't
  // worth the extra intersection-math case for this first cut). Endpoints
  // are computed via getInternalNode/getFloatingEdgeParams — the same
  // per-edge intersection math SmartEdge itself already uses — rather than
  // reading `shapeNodes` positions directly, since a page-frame/group-child
  // shape's position there is parent-relative, not absolute. `shapeNodes` is
  // still a dependency purely to force a recompute on every drag frame (see
  // onNodesChange's continuous applyNodeChanges calls during a live drag),
  // not to read from directly.
  const edges = useMemo(() => {
    const straightEndpoints = baseEdges
      .map((e, index) => {
        const data = e.data as unknown as SmartEdgeData | undefined;
        if (data?.routing !== 'straight' || data?.sourceAnchorIndex !== undefined || data?.targetAnchorIndex !== undefined) return null;
        const sourceNode = getInternalNode(e.source);
        const targetNode = getInternalNode(e.target);
        if (!sourceNode || !targetNode) return null;
        const { sx, sy, tx, ty } = getFloatingEdgeParams(sourceNode, targetNode);
        return { index, id: e.id, p1: { x: sx, y: sy }, p2: { x: tx, y: ty } };
      })
      .filter((e): e is { index: number; id: string; p1: { x: number; y: number }; p2: { x: number; y: number } } => e !== null);

    const crossingPoints = new Map<string, { x: number; y: number }[]>();
    for (let i = 0; i < straightEndpoints.length; i++) {
      for (let j = i + 1; j < straightEndpoints.length; j++) {
        const a = straightEndpoints[i];
        const b = straightEndpoints[j];
        const point = segmentIntersection(a.p1, a.p2, b.p1, b.p2);
        if (!point) continue;
        // Stable tiebreak: whichever edge appears later in array order gets
        // the bump — arbitrary but deterministic, and matches the intuitive
        // "the earlier connector stays visually on top" convention.
        const later = b.index > a.index ? b : a;
        const list = crossingPoints.get(later.id) ?? [];
        list.push(point);
        crossingPoints.set(later.id, list);
      }
    }
    if (crossingPoints.size === 0) return baseEdges;
    return baseEdges.map(e => {
      const points = crossingPoints.get(e.id);
      return points ? { ...e, data: { ...e.data, __crossingPoints: points } } : e;
    });
  }, [baseEdges, getInternalNode]);

  function renumberSequence(items: SequenceItem[]) {
    const sequenced = items.filter(i => i.revealOrder !== undefined).sort((a, b) => (a.revealOrder ?? 0) - (b.revealOrder ?? 0));
    sequenced.forEach((item, i) => {
      if (item.kind === 'shape') onCommit(item.id, { revealOrder: i });
      else onEdgeCommit(item.id, { revealOrder: i });
    });
  }

  function handleToggleSequenced(id: string, kind: 'shape' | 'connector') {
    const item = sequenceItems.find(i => i.id === id);
    if (!item) return;
    if (item.revealOrder !== undefined) {
      if (kind === 'shape') onCommit(id, { revealOrder: undefined });
      else onEdgeCommit(id, { revealOrder: undefined });
    } else {
      const maxOrder = Math.max(-1, ...sequenceItems.filter(i => i.revealOrder !== undefined).map(i => i.revealOrder ?? -1));
      if (kind === 'shape') onCommit(id, { revealOrder: maxOrder + 1 });
      else onEdgeCommit(id, { revealOrder: maxOrder + 1 });
    }
  }

  function handleReorderSequence(id: string, _kind: 'shape' | 'connector', direction: -1 | 1) {
    const sequenced = sequenceItems.filter(i => i.revealOrder !== undefined).sort((a, b) => (a.revealOrder ?? 0) - (b.revealOrder ?? 0));
    const index = sequenced.findIndex(i => i.id === id);
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= sequenced.length) return;
    [sequenced[index], sequenced[swapWith]] = [sequenced[swapWith], sequenced[index]];
    renumberSequence(sequenced);
  }

  // Entrance-animation type/duration only meaningfully apply to shapes —
  // connectors' reveal is still opacity-only, unchanged.
  function handleChangeAnimation(id: string, patch: { animationType?: 'fade' | 'flyIn' | 'zoom'; animationDuration?: number }) {
    onCommit(id, patch);
  }

  function handleNodeClick(_event: unknown, node: Node) {
    if (node.type !== 'shape') return;
    const link = (node.data as ShapeNodeData).link;
    if (isPresent && link) { navigateToLink(node.id); return; }
    if (!isPresent && stylePaintMode) {
      if (!stylePaintSource) {
        const data = node.data as ShapeNodeData;
        // Copy every field unconditionally (including ones the source never
        // explicitly set, as `undefined`) rather than only ones present on
        // source — a freshly-placed, never-customized shape has NONE of
        // these keys set at all (ShapeNode.tsx falls back to defaults at
        // render time), so skipping absent keys would silently pick up an
        // empty style and make "apply" a no-op. Explicitly carrying
        // `undefined` through means applying to a customized target
        // correctly resets it back to the same default look, matching a
        // real format-painter's "make this look exactly like that" contract.
        const picked: Partial<ShapeNodeData> = {};
        for (const key of STYLE_PAINT_FIELDS) (picked as Record<string, unknown>)[key] = data[key];
        setStylePaintSource(picked);
      } else {
        onCommit(node.id, stylePaintSource);
      }
      return;
    }
    // Previously bypassed the highlightMode check entirely while presenting
    // (`!isPresent && !highlightMode`), so branch highlight silently fired on
    // every shape click in Present mode even with the toggle off — and since
    // the toolbar (and its toggle) isn't shown while presenting, there was no
    // way to turn it off from there either. Gating on highlightMode alone
    // means it only ever fires in Present mode if it was already turned on
    // before presenting started.
    if (!highlightMode) return;
    if (highlighted && highlighted.nodeIds.has(node.id) && highlighted.nodeIds.size > 0) {
      // Clicking the currently-highlighted root again clears it.
      const isRoot = Array.from(highlighted.nodeIds)[0] === node.id;
      if (isRoot) { setHighlighted(null); return; }
    }
    setHighlighted(computeDownstream(node.id, connectorEdges as { id: string; source: string; target: string }[]));
  }

  // Whether the page currently on screen sits inside a genuine device bezel
  // (phone/tablet/watch — a real drawn ring, bezel > 0). That ring is a
  // fixed screen-space overlay that doesn't track the camera, so panning
  // into or out of one visibly slides the page content underneath a static
  // frame that belongs to the OTHER page — looks broken. The bezel-less
  // "slide" treatment (plain paper/custom pages, just a soft drop shadow)
  // doesn't have that conflict, so it's excluded and still pans smoothly,
  // same as fullscreen-to-fullscreen transitions.
  const pageHadBezelRef = useRef(false);

  // Frame the current presentation page whenever it changes, fit it exactly
  // inside the current device/monitor frame (or full-bleed), and reset the
  // reveal step so a fresh page always starts fully unrevealed. Reads the
  // layout through the ref rather than depending on it directly, so a window
  // resize alone (handled separately below) doesn't also restart the reveal
  // sequence.
  useEffect(() => {
    if (!isPresent || !presentPage) return;
    const origin = pageGeomRef.current.pageOrigins.get(presentPage.id) ?? 0;
    const dims = pageGeomRef.current.pageDimensions.get(presentPage.id) ?? { width: 794, height: 1123 };
    const targetHasBezel = (presentLayoutRef.current?.bezel ?? 0) > 0;
    const shouldDissolve = effectiveSettingsRef.current.pageTransition === 'fade' || pageHadBezelRef.current || targetHasBezel;
    // An instant cut, not an animated pan — any nonzero duration here is a
    // real spatial drag of canvas content across the fixed screen window,
    // which is exactly what looks broken. The flash (scoped to the screen
    // rect, not the whole window) is what supplies the "dissolve" feel.
    if (shouldDissolve && presentLayoutRef.current) {
      triggerScreenFlash(presentLayoutRef.current.screenRect, presentLayoutRef.current.outerRadius);
    }
    setCenter(dims.width / 2, origin + dims.height / 2, { zoom: presentLayoutRef.current?.zoom ?? 1, duration: shouldDissolve ? 0 : 400 });
    setPresentStep(-1);
    pageHadBezelRef.current = targetHasBezel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent, presentPageIndex, presentPage?.id]);

  // Broadcasts this window's current page/step to any other presentation
  // window (e.g. a Presenter View tab) watching the same diagram. Harmless
  // if nothing's listening (onPresentStateChange is a no-op then).
  useEffect(() => {
    if (!isPresent || !presentPage) return;
    onPresentStateChange?.({ pageId: presentPage.id, step: presentStep });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent, presentPage?.id, presentStep]);

  // Adopts a page/step change that came from ANOTHER window (e.g. Presenter
  // View's own prev/next controls) — only acts when it actually differs
  // from local state, so this never fights with the write-effect above.
  useEffect(() => {
    if (!isPresent || !presentState) return;
    if (presentState.pageId !== presentPage?.id) {
      const idx = pages.findIndex(p => p.id === presentState.pageId);
      if (idx >= 0) setPresentPageIndex(idx);
    }
    if (presentState.step !== presentStep) setPresentStep(presentState.step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent, presentState]);

  // Resizing the presenting window re-fits the same page/step in place —
  // deliberately a separate effect from page-change above so it never
  // restarts the reveal sequence.
  useEffect(() => {
    if (!isPresent || !presentPage || !presentLayout) return;
    const origin = pageGeomRef.current.pageOrigins.get(presentPage.id) ?? 0;
    const dims = pageGeomRef.current.pageDimensions.get(presentPage.id) ?? { width: 794, height: 1123 };
    setCenter(dims.width / 2, origin + dims.height / 2, { zoom: presentLayout.zoom, duration: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowSize.width, windowSize.height]);

  useEffect(() => {
    if (!isPresent) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        if (presentStep < presentSequence.length - 1) setPresentStep(s => s + 1);
        else if (presentPageIndex < pages.length - 1) setPresentPageIndex(i => i + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (presentStep > -1) setPresentStep(s => s - 1);
        else if (presentPageIndex > 0) setPresentPageIndex(i => i - 1);
      } else if (e.key === 'Escape') {
        onExitPresent?.();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPresent, presentStep, presentSequence.length, presentPageIndex, pages.length, onExitPresent]);

  // Same immediate-local-update + debounced-persist pattern as the path-
  // anchor nudge further down — holding an arrow key to nudge a shape
  // shouldn't write-storm Firestore on every frame, and shouldn't push one
  // undo entry per keystroke either — `shapeNudgeOriginalRef` remembers each
  // shape's position from BEFORE the whole nudge burst started (only ever
  // set once per burst; cleared when the debounce settles) so undo jumps
  // back to before the burst, not one nudge-tick at a time.
  const shapeNudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shapeNudgePendingRef = useRef<Map<string, Node>>(new Map());
  const shapeNudgeOriginalRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  function nudgeSelection(targets: Node[], dx: number, dy: number) {
    const ids = new Set(targets.map(n => n.id));
    setShapeNodes(prev => prev.map(n => {
      if (!ids.has(n.id)) return n;
      if (!shapeNudgeOriginalRef.current.has(n.id)) shapeNudgeOriginalRef.current.set(n.id, n.position);
      const next = { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } };
      shapeNudgePendingRef.current.set(n.id, next);
      return next;
    }));
    if (shapeNudgeTimerRef.current) clearTimeout(shapeNudgeTimerRef.current);
    shapeNudgeTimerRef.current = setTimeout(() => {
      const originals = new Map(shapeNudgeOriginalRef.current);
      const finals = new Map<string, { x: number; y: number }>();
      const nudgeUpdates: { pageId: string; node: DiagramNode }[] = [];
      for (const n of shapeNudgePendingRef.current.values()) {
        const pageId = (n.data as ShapeNodeData | undefined)?.pageId;
        if (pageId) nudgeUpdates.push({ pageId, node: toPersistableShape(n) });
        finals.set(n.id, n.position);
      }
      if (nudgeUpdates.length > 0) saveShapes(diagramId, nudgeUpdates);
      pushHistory({
        undo: () => applyPositionBatch(originals),
        redo: () => applyPositionBatch(finals),
      });
      shapeNudgePendingRef.current.clear();
      shapeNudgeOriginalRef.current.clear();
    }, 400);
  }

  // WASD + arrow-key viewport panning (edit mode only — presentation mode
  // already owns Space/Arrow for step navigation above). viewport.x/y are
  // already screen-space, so a constant pixel delta pans a constant on-screen
  // distance regardless of zoom — no zoom-based conversion needed here.
  // Arrow keys (not WASD) nudge the current shape/path/group selection
  // instead of panning, when there is one — 1px per press, 10px with Shift,
  // matching the anchor-nudge convention below.
  //
  // The Direct Selection shortcut ('A', no modifiers) is folded into this
  // SAME handler rather than a second window listener — WASD-pan's own KeyA
  // already means "pan left," so a separate listener would double-fire on
  // every 'A' press (both listeners see the same native event; only
  // stopImmediatePropagation prevents a later-registered listener from
  // running, and that's a fragile ordering dependency to rely on). Deciding
  // both in one place avoids the conflict outright: 'A' toggles Direct
  // Selection only when there's a path to edit, otherwise it still pans. The
  // new arrow-key nudge follows the same reasoning to avoid double-firing
  // against the anchor-nudge effect further down.
  useEffect(() => {
    if (isPresent) return;
    const PAN_STEP_SCREEN_PX = 60;
    const PAN_KEYS: Record<string, { x: number; y: number }> = {
      ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
      KeyW: { x: 0, y: -1 }, KeyS: { x: 0, y: 1 }, KeyA: { x: -1, y: 0 }, KeyD: { x: 1, y: 0 },
    };
    const ARROW_CODES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'KeyA' && !e.shiftKey && (editingPathId || directSelectMode)) {
        e.preventDefault();
        handleSelectTool('directSelect');
        return;
      }
      if (toolActive) return; // don't fight an in-progress path/connector/shape-placement drag
      const dir = PAN_KEYS[e.code];
      if (!dir) return;
      // Direct Selection's own anchor-nudge effect already owns arrow keys
      // while a path anchor is focused — defer to it instead of also moving
      // the whole shape underneath the focused anchor.
      const anchorFocused = directSelectMode && !!editingPathId && activeAnchorIndex !== null;
      if (ARROW_CODES.has(e.code) && !anchorFocused) {
        const targets = nodes.filter(n => n.selected && (n.type === 'shape' || n.type === 'path' || n.type === 'group') && !isLocked(n.id));
        if (targets.length > 0) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          nudgeSelection(targets, dir.x * step, dir.y * step);
          return;
        }
      }
      e.preventDefault();
      const { x, y, zoom } = getViewport();
      setViewport({ x: x - dir.x * PAN_STEP_SCREEN_PX, y: y - dir.y * PAN_STEP_SCREEN_PX, zoom }, { duration: 0 });
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent, toolActive, editingPathId, directSelectMode, activeAnchorIndex, nodes]);

  // Accepts undefined so callers deriving `node` from a `.find()` (e.g. an
  // edge's source/target shape) don't need an unsafe cast — an edge left
  // pointing at a since-deleted shape must degrade to "no page" rather than
  // throw and take down every memo that iterates connectorEdges.
  function findPageIdFor(node: Node | undefined): string | undefined {
    return (node?.data as ShapeNodeData | undefined)?.pageId;
  }

  // Every brand-new shape defaults to zIndex 0 unless explicitly given one,
  // which ties every shape ever placed on a page at the same stacking value.
  // CSS resolves that tie by DOM/array order — but new shapes are PREPENDED
  // to shapeNodes (so the newest is array index 0), meaning a freshly placed
  // shape actually paints BEHIND everything placed before it: the opposite
  // of the "newest shape lands on top" convention every drawing tool follows
  // (and the same convention this app's own Layers panel/bring-to-front
  // already assume). Stamping a strictly-higher zIndex at creation time
  // makes stacking order explicit and independent of DOM order.
  function nextZIndexForPage(pageId: string): number {
    const zIndices = shapeNodesRef.current
      .filter(n => (n.data as ShapeNodeData | undefined)?.pageId === pageId)
      .map(n => n.zIndex ?? 0);
    return (zIndices.length > 0 ? Math.max(...zIndices) : 0) + 1;
  }

  // Build the Firestore payload from an explicit allowlist of BOTH the node's
  // top-level fields and its data fields — never spread-and-exclude. React
  // Flow node objects, and this app's own rendering layer, keep piling on
  // ephemeral/runtime-only fields (selected, dragging, resizing, measured,
  // onCommit, onNavigateLink, __resolvedStyle, __dimmed, __hidden, ...) and a
  // spread-then-strip approach silently lets every NEW one leak into Firestore
  // (a function value makes setDoc throw) until it's individually named here.
  // Picking only the known-good keys is immune to that by construction.
  function toPersistableShape(node: Node): DiagramNode {
    const d = node.data as ShapeNodeData;
    const cleanData: ShapeNodeData = {
      kind: d.kind,
      pageId: d.pageId,
      label: d.label,
      richText: d.richText,
      fillColor: d.fillColor,
      strokeColor: d.strokeColor,
      strokeWidth: d.strokeWidth,
      rotation: d.rotation,
      zIndex: d.zIndex,
      revealOrder: d.revealOrder,
      animationType: d.animationType,
      animationDuration: d.animationDuration,
      highlightGroup: d.highlightGroup,
      dataBinding: d.dataBinding,
      customFields: d.customFields,
      tags: d.tags,
      link: d.link,
      imageUrl: d.imageUrl,
      locked: d.locked,
      hidden: d.hidden,
      pathAnchors: d.pathAnchors,
      pathClosed: d.pathClosed,
      pathHoles: d.pathHoles,
      cornerRadius: d.cornerRadius,
      fontSize: d.fontSize,
      fontColor: d.fontColor,
      fontWeight: d.fontWeight,
      fontFamily: d.fontFamily,
      textAlign: d.textAlign,
      fontStyle: d.fontStyle,
      textDecoration: d.textDecoration,
      letterSpacing: d.letterSpacing,
      lineHeight: d.lineHeight,
      verticalAlign: d.verticalAlign,
      strokeStyle: d.strokeStyle,
      effect: d.effect,
      opacity: d.opacity,
      blur: d.blur,
      fillGradient: d.fillGradient,
      containerTheme: d.containerTheme,
      containerAccentColor: d.containerAccentColor,
      laneCount: d.laneCount,
      laneOrientation: d.laneOrientation,
      laneLabels: d.laneLabels,
      videoUrl: d.videoUrl,
      posterUrl: d.posterUrl,
      videoAutoplay: d.videoAutoplay,
      videoLoop: d.videoLoop,
      videoMuted: d.videoMuted,
      videoControls: d.videoControls,
      iconName: d.iconName,
      archimateLayer: d.archimateLayer,
      archimateType: d.archimateType,
      starPoints: d.starPoints,
      starInnerRadius: d.starInnerRadius,
      pieSegments: d.pieSegments,
      pieInnerRadius: d.pieInnerRadius,
      brushPoints: d.brushPoints,
      brushStyle: d.brushStyle,
      brushBaseWidth: d.brushBaseWidth,
      brushViewBoxWidth: d.brushViewBoxWidth,
      brushViewBoxHeight: d.brushViewBoxHeight,
      tableRows: d.tableRows,
      tableCols: d.tableCols,
      tableCells: d.tableCells,
      chartType: d.chartType,
      chartData: d.chartData,
    };
    return {
      id: node.id,
      type: node.type ?? 'shape',
      position: node.position,
      width: node.width,
      height: node.height,
      zIndex: node.zIndex,
      parentId: node.parentId,
      extent: node.extent,
      data: cleanData,
    } as DiagramNode;
  }

  // A pasted shape's `data` starts as a shallow spread of the copied
  // shape's `data` (see handlePaste) — every nested array/object field
  // below would otherwise still be the exact same reference as the source
  // shape's. Every current editor happens to clone-before-mutate today, so
  // this stays invisible until some future edit path mutates one of these
  // in place — at which point it'd silently corrupt both the original and
  // every paste descended from it. Clone here, once, at the one place data
  // actually fans out (copy → N pastes), rather than in toPersistableShape
  // (called on every self-save with no aliasing risk, so cloning there
  // would be pure overhead).
  function cloneShapeData(data: ShapeNodeData): ShapeNodeData {
    return {
      ...data,
      richText: data.richText?.map(p => ({ ...p, runs: p.runs.map(r => ({ ...r })) })),
      tableCells: data.tableCells?.map(row => ({ cells: [...row.cells] })),
      dataBinding: data.dataBinding ? {
        ...data.dataBinding,
        rules: data.dataBinding.rules.map(r => ({ ...r, style: { ...r.style } })),
        fallbackStyle: data.dataBinding.fallbackStyle ? { ...data.dataBinding.fallbackStyle } : undefined,
      } : undefined,
      pieSegments: data.pieSegments?.map(s => ({ ...s })),
      chartData: data.chartData?.map(s => ({ ...s })),
      customFields: data.customFields?.map(f => ({ ...f })),
      pathAnchors: data.pathAnchors?.map(a => ({
        ...a,
        handleIn: a.handleIn ? { ...a.handleIn } : undefined,
        handleOut: a.handleOut ? { ...a.handleOut } : undefined,
      })),
      pathHoles: data.pathHoles?.map(hole => ({
        closed: hole.closed,
        anchors: hole.anchors.map(a => ({
          ...a,
          handleIn: a.handleIn ? { ...a.handleIn } : undefined,
          handleOut: a.handleOut ? { ...a.handleOut } : undefined,
        })),
      })),
      tags: data.tags ? [...data.tags] : undefined,
      laneLabels: data.laneLabels ? [...data.laneLabels] : undefined,
      brushPoints: data.brushPoints?.map(p => ({ ...p })),
    };
  }

  // Keeps a dragged shape (or a dragged multi-selection, as one rigid unit)
  // inside the page it was drawn on. Runs on every drag frame, not just
  // drag-stop, since RF calls onNodesChange continuously while dragging and
  // renders straight from whatever position we hand back — clamping here is
  // what makes the shape visually stop at the edge instead of snapping back
  // only once the drag ends. Group children are skipped: their position is
  // already relative to the parent group (extent:'parent'), so only the
  // group node itself gets boundary-clamped.
  function clampDragChanges(changes: NodeChange[]): NodeChange[] {
    type PosChange = NodeChange & { type: 'position'; position: { x: number; y: number } };
    const posChanges = changes.filter((c): c is PosChange => c.type === 'position' && !!c.position);
    if (posChanges.length === 0) { setGuides(null); return changes; }

    const byPage = new Map<string, PosChange[]>();
    for (const c of posChanges) {
      const node = shapeNodes.find(n => n.id === c.id);
      if (!node || node.parentId) continue;
      const pageId = findPageIdFor(node);
      if (!pageId) continue;
      const list = byPage.get(pageId) ?? [];
      list.push(c);
      byPage.set(pageId, list);
    }
    if (byPage.size === 0) { setGuides(null); return changes; }

    const corrections = new Map<string, { dx: number; dy: number }>();
    const { pageOrigins: origins, pageDimensions: dims } = pageGeomRef.current;
    for (const [pageId, list] of byPage) {
      const origin = origins.get(pageId);
      const pageDims = dims.get(pageId);
      if (origin === undefined || !pageDims) continue;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const c of list) {
        const node = shapeNodes.find(n => n.id === c.id)!;
        const w = node.width ?? 100, h = node.height ?? 100;
        minX = Math.min(minX, c.position.x);
        minY = Math.min(minY, c.position.y);
        maxX = Math.max(maxX, c.position.x + w);
        maxY = Math.max(maxY, c.position.y + h);
      }
      const bboxW = maxX - minX, bboxH = maxY - minY;
      const clampedMinX = bboxW >= pageDims.width ? PAGE_X : Math.min(Math.max(minX, PAGE_X), PAGE_X + pageDims.width - bboxW);
      const clampedMinY = bboxH >= pageDims.height ? origin : Math.min(Math.max(minY, origin), origin + pageDims.height - bboxH);
      const dx = clampedMinX - minX, dy = clampedMinY - minY;
      if (dx !== 0 || dy !== 0) {
        for (const c of list) corrections.set(c.id, { dx, dy });
      }
    }

    // Smart guide snapping — single-shape drags only (a combined bbox-vs-bbox
    // comparison across a multi-shape drag is a materially different, out-of-
    // scope computation for v1). Applied AFTER page-boundary clamping, as a
    // further correction on top of whatever position that already settled
    // on — so a shape already hard-clamped to the page edge doesn't also get
    // pulled off it by an in-range guide. When both grid-snap (RF's own
    // snapToGrid, applied upstream of this function, opaque to it) and
    // object-snap are enabled: object-snap wins whenever a guide is in
    // range (this correction runs regardless of what grid-snap already did),
    // otherwise grid-snap's result stands untouched.
    let guideResult: GuideLines | null = null;
    if (uxPrefs.smartGuideSnapEnabled && posChanges.length === 1) {
      const c = posChanges[0];
      const node = shapeNodes.find(n => n.id === c.id);
      const pageId = node && findPageIdFor(node);
      if (node && !node.parentId && pageId) {
        const boundaryCorr = corrections.get(c.id) ?? { dx: 0, dy: 0 };
        const w = node.width ?? node.measured?.width ?? 100;
        const h = node.height ?? node.measured?.height ?? 100;
        const draggedX = c.position.x + boundaryCorr.dx;
        const draggedY = c.position.y + boundaryCorr.dy;
        const siblings = shapeNodes.filter(n =>
          n.id !== c.id && !n.parentId && (n.type === 'shape' || n.type === 'path') && findPageIdFor(n) === pageId,
        );
        guideResult = computeAlignmentGuides({ x: draggedX, y: draggedY, width: w, height: h }, siblings);
        const snap = computeSnapOffset({ x: draggedX, y: draggedY, width: w, height: h }, guideResult);
        if (snap.dx !== 0 || snap.dy !== 0) {
          corrections.set(c.id, { dx: boundaryCorr.dx + snap.dx, dy: boundaryCorr.dy + snap.dy });
        }
      }
    }
    setGuides(guideResult && (guideResult.vertical.length > 0 || guideResult.horizontal.length > 0) ? guideResult : null);

    if (corrections.size === 0) return changes;
    return changes.map(c => {
      if (c.type !== 'position' || !c.position) return c;
      const corr = corrections.get(c.id);
      return corr ? { ...c, position: { x: c.position.x + corr.dx, y: c.position.y + corr.dy } } : c;
    });
  }

  function getCommittedShape(id: string): DiagramNode | undefined {
    for (const slice of shapesSlices.current.values()) {
      const existing = slice.get(id);
      if (existing) return existing;
    }
    return undefined;
  }

  // A top-level (unparented) shape dropped so its center lands inside a
  // top-level Container's bounds gets adopted by it — the topmost (highest
  // zIndex) overlapping container wins if several overlap. Deliberately
  // narrow in scope: only ever top-level shape into top-level container (no
  // groups/containers as the dragged subject, no already-nested shapes,
  // and no auto-release when dragged back out) — a reshuffle of existing
  // nesting is a bigger, riskier feature than "drop a shape in, it joins."
  function findCapturingContainer(node: Node, nextPosition: { x: number; y: number }, pageId: string): Node | undefined {
    if (node.parentId) return undefined;
    const kind = (node.data as ShapeNodeData | undefined)?.kind;
    if (kind === 'container' || kind === 'group') return undefined;
    const w = node.width ?? node.measured?.width ?? 100;
    const h = node.height ?? node.measured?.height ?? 70;
    const centerX = nextPosition.x + w / 2;
    const centerY = nextPosition.y + h / 2;
    const candidates = shapeNodes.filter(n =>
      n.id !== node.id && !n.parentId && (n.data as ShapeNodeData | undefined)?.kind === 'container' && findPageIdFor(n) === pageId
    );
    const matches = candidates.filter(c => {
      const cw = c.width ?? 100, ch = c.height ?? 70;
      return centerX >= c.position.x && centerX <= c.position.x + cw && centerY >= c.position.y && centerY <= c.position.y + ch;
    });
    if (matches.length === 0) return undefined;
    return matches.reduce((best, c) => (c.zIndex ?? 0) > (best.zIndex ?? 0) ? c : best);
  }

  function applyReparent(id: string, patch: { parentId?: string; extent?: 'parent'; position: { x: number; y: number } }) {
    for (const slice of shapesSlices.current.values()) {
      const existing = slice.get(id);
      if (existing) {
        const updated: DiagramNode = { ...existing, parentId: patch.parentId, extent: patch.extent, position: patch.position };
        slice.set(id, updated);
        saveShape(diagramId, existing.data.pageId, updated);
        rebuildShapes();
        // Force React Flow to re-measure ALL nodes after rebuildShapes creates new references.
        // Same fix as applyPosition/applyPositionBatch/commitShapeUpdates - adoptUserNodes resets handleBounds/measured
        // for all nodes when receiving new object references, causing connectors to vanish.
        const allIds: string[] = [];
        for (const s of shapesSlices.current.values()) {
          for (const node of s.values()) {
            allIds.push(node.id);
          }
        }
        scheduleUpdateNodeInternals(allIds);
        return;
      }
    }
  }

  const onNodesChange = useCallback((rawChanges: NodeChange[]) => {
    let changes = clampDragChanges(rawChanges);

    // Align-to-key-object: clicking an ALREADY-selected shape again, while
    // 2+ shapes are selected, normally collapses the selection down to just
    // that one shape (RF's default plain-click behavior) — that batch is
    // selection-only (no accompanying position/dimensions change, which
    // would mean an actual drag/resize instead of a plain click) and has the
    // specific shape "one id going true (already selected), the rest of the
    // CURRENT selection going false". Recognizing that exact pattern lets
    // this be reinterpreted as "promote this shape to the key object" instead
    // of a real reselect: drop the deselecting changes so the whole
    // multi-selection stays intact, and record which shape is now the
    // alignment anchor. Any OTHER selection-changing batch (shift-click
    // toggle, a fresh click on a never-selected shape, marquee reselect —
    // none of which match this narrow shape) clears the key object instead,
    // since the selection is genuinely changing to something else.
    if (uxPrefs.alignToKeyObjectEnabled) {
      const selectChanges = changes.filter((c): c is NodeChange & { type: 'select'; selected: boolean } => c.type === 'select');
      if (selectChanges.length > 0) {
        const currentSelectedIds = new Set(shapeNodesRef.current.filter(n => n.selected).map(n => n.id));
        const trueChanges = selectChanges.filter(c => c.selected);
        const falseChanges = selectChanges.filter(c => !c.selected);
        const isPromotionPattern =
          changes.length === selectChanges.length &&
          trueChanges.length === 1 &&
          currentSelectedIds.size >= 2 &&
          currentSelectedIds.has(trueChanges[0].id) &&
          falseChanges.length === currentSelectedIds.size - 1 &&
          falseChanges.every(c => currentSelectedIds.has(c.id) && c.id !== trueChanges[0].id);
        if (isPromotionPattern) {
          changes = trueChanges;
          setKeyObjectId(trueChanges[0].id);
        } else {
          setKeyObjectId(null);
        }
      }
    }

    // Position/dimension commits from every change in THIS batch are
    // collected here and written to shapesSlices.current in one
    // commitShapeUpdates() call after the loop, not one call per shape. Two
    // reasons: (1) it's the exact multi-shape-drag case the single-call
    // form would otherwise re-render N times for (drag/resize a
    // multi-selection and every change above arrives in one `changes`
    // array), and (2) more importantly, calling rebuildShapes() partway
    // through this loop — while some of THIS SAME drag's shapes are still
    // only reflected in `shapeNodes`, not yet in the slice — reintroduces
    // the exact stale-slice rebuild this fix exists to close, just with a
    // narrower window (see the comment on commitShapeUpdates itself for
    // the full "why").
    // CRITICAL: We must update the slices BEFORE calling setShapeNodes below.
    // If a Firestore echo arrives between setShapeNodes and commitShapeUpdates,
    // rebuildShapes() will read stale slice data and create nodes with old
    // positions, causing brief misplacement during group moves.
    const shapeUpdates: { id: string; pageId: string; node: DiagramNode }[] = [];
    for (const change of changes) {
      if (change.type === 'position' && change.dragging === false && change.position) {
        const node = shapeNodes.find(n => n.id === change.id);
        const pageId = node && findPageIdFor(node);
        if (node && pageId) {
          const nextPosition = change.position;
          const prevPosition = getCommittedShape(change.id)?.position;
          const container = findCapturingContainer(node, nextPosition, pageId);
          if (container) {
            const relativePosition = { x: nextPosition.x - container.position.x, y: nextPosition.y - container.position.y };
            applyReparent(change.id, { parentId: container.id, extent: 'parent', position: relativePosition });
            pushHistory({
              undo: () => applyReparent(change.id, { parentId: undefined, extent: undefined, position: prevPosition ?? nextPosition }),
              redo: () => applyReparent(change.id, { parentId: container.id, extent: 'parent', position: relativePosition }),
            });
          } else {
            // Was a bare saveShape() with no write into shapesSlices.current
            // and no rebuildShapes() — every OTHER mutation path in this file
            // (applyPosition, applySize, applyReparent, commitShapeUpdates)
            // writes the slice before saving specifically because the
            // per-page Firestore listener calls rebuildShapes() on every
            // echo, including the echo of the write this is about to issue.
            // Skipping that write left a window, between "drag released"
            // and "our own echo comes back", where the slice still held the
            // PRE-drag position. Any OTHER shape's echo on the same page
            // landing in that window (near-instant locally, but common
            // under real network latency, and more likely the longer a drag
            // itself lags) called rebuildShapes() off the stale slice and
            // reverted this shape's on-screen position back to pre-drag —
            // then the real echo landed a moment later and corrected it
            // again, reading as a shape briefly duplicating/tearing away
            // from a multi-shape drag rather than moving as one unit.
            shapeUpdates.push({ id: change.id, pageId, node: toPersistableShape({ ...node, position: nextPosition }) });
            if (prevPosition && (prevPosition.x !== nextPosition.x || prevPosition.y !== nextPosition.y)) {
              pushHistory({ undo: () => applyPosition(change.id, prevPosition), redo: () => applyPosition(change.id, nextPosition) });
            }
          }
        }
      }
      if (change.type === 'dimensions' && change.resizing === false && change.dimensions) {
        const node = shapeNodes.find(n => n.id === change.id);
        const pageId = node && findPageIdFor(node);
        if (node && pageId) {
          const nextSize = change.dimensions;
          const committed = getCommittedShape(change.id);
          const prevSize = committed ? { width: committed.width ?? 100, height: committed.height ?? 70 } : undefined;
          // NodeResizer has no live center-anchor hook (its own onChange is
          // built from corner-anchored math before our code ever runs), so
          // Alt-resize-from-center is corrected here, post-hoc, at the one
          // place a resize actually commits — not live during the drag. The
          // on-screen preview still visually anchors to the grabbed corner
          // while dragging; it snaps to the true center-anchored geometry
          // only on release. `committed` (the PRE-resize-start geometry) is
          // the anchor point growth/shrink is corrected to be symmetric around.
          const altCenter = resizeAltCenterIdsRef.current.has(change.id);
          resizeAltCenterIdsRef.current.delete(change.id);
          let nextPosition = node.position;
          if (altCenter && committed) {
            const startW = committed.width ?? 100, startH = committed.height ?? 70;
            nextPosition = {
              x: committed.position.x - (nextSize.width - startW) / 2,
              y: committed.position.y - (nextSize.height - startH) / 2,
            };
          }
          // Same stale-slice race as the position commit above.
          shapeUpdates.push({ id: change.id, pageId, node: toPersistableShape({ ...node, position: nextPosition, width: nextSize.width, height: nextSize.height }) });
          const positionChanged = altCenter && committed && (nextPosition.x !== committed.position.x || nextPosition.y !== committed.position.y);
          if ((prevSize && (prevSize.width !== nextSize.width || prevSize.height !== nextSize.height)) || positionChanged) {
            const prevPosition = committed?.position;
            pushHistory({
              undo: () => { if (prevSize) applySize(change.id, prevSize); if (positionChanged && prevPosition) applyPosition(change.id, prevPosition); },
              redo: () => { applySize(change.id, nextSize); if (positionChanged) applyPosition(change.id, nextPosition); },
            });
          }
        }
      }
      if (change.type === 'remove') {
        const node = shapeNodes.find(n => n.id === change.id);
        const pageId = node && findPageIdFor(node);
        const removedShape = getCommittedShape(change.id);
        if (pageId) deleteShape(diagramId, pageId, change.id);
        // A connector left pointing at a deleted shape becomes an orphan:
        // shapeNodes.find() for its source/target returns undefined forever
        // after this, which crashes every memo that resolves an edge's page
        // (sequenceItems, the edges render memo) on next render. Cascade the
        // deletion so no connector can outlive both of the shapes it joins.
        const orphaned = connectorEdges.filter(e => e.source === change.id || e.target === change.id);
        // Captured now (while `shapeNodes` still resolves the about-to-be-removed
        // shape) rather than re-resolved at undo/redo time, which could run long
        // after this closure's `shapeNodes` snapshot has gone stale.
        const removedEdges: { edge: Edge; pageId: string }[] = [];
        if (orphaned.length > 0) {
          setConnectorEdges(prev => prev.filter(e => !orphaned.some(o => o.id === e.id)));
          for (const edge of orphaned) {
            const edgePageId = findEdgePageId(edge);
            if (edgePageId) {
              deleteConnector(diagramId, edgePageId, edge.id);
              removedEdges.push({ edge, pageId: edgePageId });
            }
          }
        }
        if (removedShape && pageId) {
          pushHistory({
            undo: () => {
              saveShape(diagramId, pageId, removedShape);
              for (const { edge, pageId: edgePageId } of removedEdges) saveConnector(diagramId, edgePageId, edge as DiagramEdge);
            },
            redo: () => {
              deleteShape(diagramId, pageId, change.id);
              for (const { edge, pageId: edgePageId } of removedEdges) deleteConnector(diagramId, edgePageId, edge.id);
            },
          });
        }
      }
    }

    // Update slices BEFORE calling setShapeNodes to prevent stale slice data
    // from being read by rebuildShapes() if a Firestore echo arrives during
    // the window between setShapeNodes and commitShapeUpdates.
    if (shapeUpdates.length > 0) {
      // Write to slices first (without calling rebuildShapes yet)
      for (const { id, pageId, node } of shapeUpdates) {
        let slice = shapesSlices.current.get(pageId);
        if (!slice) { slice = new Map(); shapesSlices.current.set(pageId, slice); }
        slice.set(id, node);
        saveShape(diagramId, pageId, toPersistableShape(node));
      }
    }

    // Update React Flow's internal state
    setShapeNodes(prev => applyNodeChanges(changes, [...frameNodes, ...prev]).filter(n => n.type !== 'pageFrame'));

    // Handle selection changes
    for (const change of changes) {
      if (change.type === 'select') {
        if (change.id.startsWith('inherited-')) {
          setSelectedInheritedId(change.selected ? change.id : null);
        } else if (change.selected) {
          setSelectedInheritedId(null);
        }
      }
    }

    // Now call rebuildShapes and schedule updateNodeInternals
    if (shapeUpdates.length > 0) {
      rebuildShapes();
      const allIds: string[] = [];
      for (const slice of shapesSlices.current.values()) {
        for (const node of slice.values()) {
          allIds.push(node.id);
        }
      }
      scheduleUpdateNodeInternals(allIds);
    }
  }, [frameNodes, shapeNodes, connectorEdges, diagramId, uxPrefs.alignToKeyObjectEnabled]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setConnectorEdges(prev => applyEdgeChanges(changes, prev));
    for (const change of changes) {
      if (change.type === 'remove') {
        const edge = connectorEdges.find(e => e.id === change.id);
        const pageId = (edge?.data as SmartEdgeData | undefined) ? findEdgePageId(edge!) : undefined;
        if (pageId) deleteConnector(diagramId, pageId, change.id);
      }
    }
  }, [connectorEdges, diagramId, shapeNodes]);

  function findEdgePageId(edge: Edge): string | undefined {
    const sourceNode = shapeNodes.find(n => n.id === edge.source);
    return sourceNode ? findPageIdFor(sourceNode) : undefined;
  }

  // Lets an EXISTING connector's ends be dragged to a different shape —
  // previously there was no reconnection affordance at all, so "copy/paste
  // an arrow then link it up by dragging its ends" had no path even for an
  // arrow that was never copied in the first place. React Flow's own
  // reconnect gesture (drag a connected edge's endpoint handle) needs only
  // `edgesReconnectable` + this handler; the new endpoint's page is assumed
  // to match the edge's existing page (reconnecting to a shape on a
  // different page isn't a supported case — connectors are page-scoped).
  const onReconnect: OnReconnect = useCallback((oldEdge, newConnection) => {
    const pageId = findEdgePageId(oldEdge as DiagramEdge);
    if (!pageId || !newConnection.source || !newConnection.target) return;
    const updated: DiagramEdge = {
      ...(oldEdge as DiagramEdge),
      source: newConnection.source,
      target: newConnection.target,
      sourceHandle: newConnection.sourceHandle ?? undefined,
      targetHandle: newConnection.targetHandle ?? undefined,
    };
    setConnectorEdges(prev => prev.map(e => e.id === oldEdge.id ? updated : e));
    saveConnector(diagramId, pageId, updated);
  }, [diagramId]);

  const onConnect: OnConnect = useCallback((params) => {
    const sourceNode = shapeNodes.find(n => n.id === params.source);
    const pageId = sourceNode ? findPageIdFor(sourceNode) : undefined;
    if (!pageId) return;
    const edge: DiagramEdge = {
      id: crypto.randomUUID(),
      source: params.source!,
      target: params.target!,
      sourceHandle: params.sourceHandle,
      targetHandle: params.targetHandle,
      type: 'smart',
      markerEnd: { type: MarkerType.ArrowClosed, color: '#8a93a6' },
      data: {
        routing: toolDefaults.connector.routing,
        flowAnimation: toolDefaults.connector.flowAnimation,
        startArrow: toolDefaults.connector.startArrow,
        endArrow: toolDefaults.connector.endArrow,
      },
    };
    setConnectorEdges(prev => addEdge(edge, prev));
    saveConnector(diagramId, pageId, edge);
    // Connector creation was one of the explicitly-out-of-scope gaps noted
    // when undo/redo was first built (see the scope comment near
    // undoStackRef) — a user whose recent actions included drawing an arrow
    // would find undo did nothing at that point, reading as "undo only
    // remembers one step" whenever a connector edit was interleaved with
    // tracked actions like move/resize.
    pushHistory({
      undo: () => { setConnectorEdges(prev => prev.filter(e => e.id !== edge.id)); deleteConnector(diagramId, pageId, edge.id); },
      redo: () => { setConnectorEdges(prev => addEdge(edge, prev)); saveConnector(diagramId, pageId, edge); },
    });
  }, [shapeNodes, diagramId, toolDefaults.connector]);

  function getPageIdForFlowPoint(flowPoint: { x: number; y: number }): string | undefined {
    for (const page of pages) {
      const origin = pageOrigins.get(page.id) ?? 0;
      const dims = pageDimensions.get(page.id) ?? { width: 794, height: 1123 };
      if (flowPoint.y >= origin && flowPoint.y <= origin + dims.height) return page.id;
    }
    return pages[0]?.id;
  }

  // Arms click-to-place: the next canvas click (handleShapePlaceMouseDown,
  // composed into the wrapper's onMouseDown below) creates the shape exactly
  // there, instead of always at the viewport center. Mutually exclusive with
  // the other tool modes.
  // `keepGalleryOpen` is only ever passed by the Shape Gallery panel's own
  // onSelect — picking a shape there arms placement without also closing the
  // panel that's browsing them, unlike every other caller (Hotspot button,
  // Favorites strip), which should close it same as any other tool switch.
  function beginPlacingShape(kind: ShapeKind, extraData?: Partial<ShapeNodeData>, opts?: { keepGalleryOpen?: boolean }) {
    const keepGalleryOpen = !!opts?.keepGalleryOpen;
    selectTool('select');
    if (keepGalleryOpen) setShapeGalleryOpen(true);
    setPlacingShapeKind(kind);
    setPendingShapeExtraData(extraData ?? null);
  }

  function handleCommentPlaceMouseDown(e: React.MouseEvent) {
    if (!placingComment) return;
    e.preventDefault();
    const flowPoint = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const pageId = getPageIdForFlowPoint(flowPoint);
    if (!pageId) return;
    setActiveCommentId(null);
    setDraftComment({ pageId, x: flowPoint.x, y: flowPoint.y });
    setPlacingComment(false);
  }

  function handlePostComment(text: string) {
    if (!draftComment || !user) return;
    const comment: DiagramComment = {
      id: crypto.randomUUID(),
      pageId: draftComment.pageId,
      x: draftComment.x,
      y: draftComment.y,
      authorId: user.uid,
      authorName: user.displayName ?? user.email ?? 'Anonymous',
      text,
      createdAt: Date.now(),
      resolved: false,
      replies: [],
    };
    saveComment(diagramId, draftComment.pageId, comment);
    setDraftComment(null);
    setActiveCommentId(comment.id);
  }

  function findComment(id: string): DiagramComment | undefined {
    return comments.find(c => c.id === id);
  }

  function handleReplyToComment(text: string) {
    if (!activeCommentId || !user) return;
    const comment = findComment(activeCommentId);
    if (!comment) return;
    const reply = { id: crypto.randomUUID(), authorId: user.uid, authorName: user.displayName ?? user.email ?? 'Anonymous', text, createdAt: Date.now() };
    saveComment(diagramId, comment.pageId, { ...comment, replies: [...comment.replies, reply] });
  }

  function handleEditActiveComment(text: string) {
    if (!activeCommentId) return;
    const comment = findComment(activeCommentId);
    if (!comment) return;
    saveComment(diagramId, comment.pageId, { ...comment, text });
  }

  function handleEditActiveReply(replyId: string, text: string) {
    if (!activeCommentId) return;
    const comment = findComment(activeCommentId);
    if (!comment) return;
    saveComment(diagramId, comment.pageId, { ...comment, replies: comment.replies.map(r => r.id === replyId ? { ...r, text } : r) });
  }

  function handleDeleteActiveReply(replyId: string) {
    if (!activeCommentId) return;
    const comment = findComment(activeCommentId);
    if (!comment) return;
    saveComment(diagramId, comment.pageId, { ...comment, replies: comment.replies.filter(r => r.id !== replyId) });
  }

  function handleToggleActiveResolved() {
    if (!activeCommentId) return;
    const comment = findComment(activeCommentId);
    if (!comment) return;
    saveComment(diagramId, comment.pageId, { ...comment, resolved: !comment.resolved });
  }

  // id is 'root' for the comment itself or a reply's id — mirrors the id
  // convention CommentThreadPanel's renderBubble already uses.
  function handleToggleReaction(id: string, emoji: string) {
    if (!activeCommentId || !user) return;
    const comment = findComment(activeCommentId);
    if (!comment) return;
    const uid = user.uid;
    function toggled(reactions: Record<string, string[]> | undefined): Record<string, string[]> {
      const current = reactions?.[emoji] ?? [];
      const nextUsers = current.includes(uid) ? current.filter(u => u !== uid) : [...current, uid];
      const next = { ...reactions };
      if (nextUsers.length === 0) delete next[emoji];
      else next[emoji] = nextUsers;
      return next;
    }
    if (id === 'root') {
      saveComment(diagramId, comment.pageId, { ...comment, reactions: toggled(comment.reactions) });
    } else {
      saveComment(diagramId, comment.pageId, {
        ...comment,
        replies: comment.replies.map(r => r.id === id ? { ...r, reactions: toggled(r.reactions) } : r),
      });
    }
  }

  function handleMoveComment(id: string, x: number, y: number) {
    const comment = findComment(id);
    if (!comment) return;
    saveComment(diagramId, comment.pageId, { ...comment, x, y });
  }

  function handleDeleteActiveThread() {
    if (!activeCommentId) return;
    const comment = findComment(activeCommentId);
    if (!comment) return;
    deleteComment(diagramId, comment.pageId, comment.id);
    setActiveCommentId(null);
  }

  function commitPlaceShape(kind: ShapeKind, flowPoint: { x: number; y: number }) {
    const pageId = getPageIdForFlowPoint(flowPoint);
    if (!pageId) return;
    if (kind === 'image' || kind === 'video') {
      if (!pendingMediaPlacement) return;
      const { url, width, height, fileSizeBytes, downsampled } = pendingMediaPlacement;
      const node: DiagramNode = {
        id: crypto.randomUUID(),
        type: 'shape',
        position: { x: flowPoint.x - width / 2, y: flowPoint.y - height / 2 },
        width, height,
        zIndex: nextZIndexForPage(pageId),
        data: kind === 'image'
          ? { kind: 'image', pageId, imageUrl: url, fileSizeBytes, downsampled }
          : { kind: 'video', pageId, videoUrl: url, videoMuted: true, videoControls: true },
      };
      setShapeNodes(prev => [...prev, { ...node, data: { ...node.data, onCommit, onNavigateLink: navigateToLink } }]);
      saveShape(diagramId, pageId, node);
      // Media placement is single-use — the uploaded file backing
      // pendingMediaPlacement can't be reused for a second copy.
      setPlacingShapeKind(null);
      setPendingMediaPlacement(null);
      setPendingShapeExtraData(null);
      return;
    }
    const isSquareIconLike = kind === 'icon' || kind === 'archimateElement' || kind === 'cross' || kind === 'star';
    const width = kind === 'text' ? 120 : kind === 'hotspot' ? 140 : isSquareIconLike ? 64 : kind === 'pieChart' ? 120 : kind === 'table' ? 300 : kind === 'chart' ? 220 : 100;
    const height = kind === 'text' ? 32 : kind === 'hotspot' ? 90 : isSquareIconLike ? 64 : kind === 'pieChart' ? 120 : kind === 'table' ? 160 : kind === 'chart' ? 150 : 70;
    const node: DiagramNode = {
      id: crypto.randomUUID(),
      type: 'shape',
      position: { x: flowPoint.x - width / 2, y: flowPoint.y - height / 2 },
      width,
      height,
      zIndex: nextZIndexForPage(pageId),
      data: {
        kind, pageId, label: kind === 'text' ? 'Text' : '',
        ...(kind === 'table' ? {
          tableRows: 3, tableCols: 3,
          tableCells: [{ cells: ['', '', ''] }, { cells: ['', '', ''] }, { cells: ['', '', ''] }],
        } : {}),
        ...pendingShapeExtraData,
      },
    };
    setShapeNodes(prev => [...prev, { ...node, data: { ...node.data, onCommit, onNavigateLink: navigateToLink } }]);
    saveShape(diagramId, pageId, node);
    setPlacingShapeKind(null);
    setPendingShapeExtraData(null);
    // The gallery panel (if open) was never closed by this placement —
    // beginPlacingShape's `keepGalleryOpen` kept it open the whole time — so
    // there's nothing to reopen here, unlike the old modal.
  }

  function handleShapePlaceMouseDown(e: React.MouseEvent) {
    if (!placingShapeKind) return;
    // This fires on EVERY mousedown anywhere in the canvas wrapper (it's
    // composed into handleWrapperMouseDown below), with no check on what
    // was actually clicked — so a mousedown landing on an EXISTING shape
    // while placement mode was still armed (e.g. the user picked a shape
    // from the gallery, then changed their mind and went to drag something
    // else instead, without first pressing Escape) placed and PERSISTED a
    // brand-new stray shape at that exact point via commitPlaceShape's own
    // saveShape/crypto.randomUUID() — while React Flow's own independent
    // node-drag machinery, having already armed on that same native
    // mousedown, went on to move the EXISTING shape normally. The result:
    // the shape you meant to drag moves to its new spot as expected, PLUS
    // a genuine second, real, refresh-surviving shape is left behind
    // wherever the drag started. Matches handleMarqueeMouseDown's own
    // established pattern just below — only the page's own background
    // (.react-flow__node-pageFrame) counts as "empty canvas" to place on;
    // anything else means the click was actually meant for a real shape,
    // so cancel placement instead of stamping a copy of it.
    const target = e.target as HTMLElement;
    if (!target.closest('.react-flow__node-pageFrame')) {
      setPlacingShapeKind(null);
      setPendingMediaPlacement(null);
      return;
    }
    e.preventDefault();
    const flowPoint = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    commitPlaceShape(placingShapeKind, flowPoint);
  }

  // Custom drag-to-select marquee. React Flow's own built-in selectionOnDrag
  // only activates when the mousedown target is the pane element itself
  // (see @xyflow/system's Pane: `isSelectionActive = (selectionOnDrag &&
  // eventTargetIsContainer) || selectionKeyPressed`) — a drag starting on
  // ANY node, including the page background (PageFrameNode is a real node
  // spanning the whole page), never counts as "the container" and is
  // silently ignored. Since the page frame covers the entire visible page,
  // that means a plain drag starting anywhere inside a page could never
  // start a selection box at all. This reimplements just enough of that
  // gesture, scoped specifically to drags starting on a page's own
  // background, so RF's native pane-background case (already working) is
  // left untouched.
  //
  // Fires on a plain left-drag (no modifier needed — matches
  // selectionOnDrag's own gating above) as long as the Select tool owns
  // the gesture: not some other tool/Hand mode (toolActive, which folds
  // handMode in), and not Space held (a temporary pan override that isn't
  // one of the toolActive flags). additive below (Shift/Meta/Ctrl) unions
  // the marquee's result into the existing selection instead of replacing
  // it, matching multiSelectionKeyCode's own click-selection semantics —
  // this is a DIFFERENT mechanism from RF's selectionKeyCode (explicitly
  // disabled above), which used to be how this gesture activated at all.
  function handleMarqueeMouseDown(e: React.MouseEvent) {
    if (toolActive || isSpaceDown || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (!target.closest('.react-flow__node-pageFrame')) return;
    const startScreen = { x: e.clientX, y: e.clientY };
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const preSelectedIds = additive ? new Set(selectedShapeIds) : new Set<string>();
    const preSelectedEdgeIds = additive ? new Set(selectedEdges.map(edge => edge.id)) : new Set<string>();
    let dragStarted = false;

    // Selection is only computed and committed on mouseup, not on every
    // mousemove — committing it live would select a shape mid-drag, which
    // opens the properties drawer and triggers its drawer-aware re-fit
    // (below) WHILE the drag is still in progress, animating the viewport
    // out from under the very screen coordinates this drag is tracking.
    let lastRect = { x: 0, y: 0, width: 0, height: 0 };
    function onMove(ev: MouseEvent) {
      const dist = Math.hypot(ev.clientX - startScreen.x, ev.clientY - startScreen.y);
      if (!dragStarted && dist < 4) return;
      dragStarted = true;
      lastRect = {
        x: Math.min(startScreen.x, ev.clientX), y: Math.min(startScreen.y, ev.clientY),
        width: Math.abs(ev.clientX - startScreen.x), height: Math.abs(ev.clientY - startScreen.y),
      };
      setMarqueeRect(lastRect);
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setMarqueeRect(null);
      if (!dragStarted) return;

      const flowA = screenToFlowPosition({ x: lastRect.x, y: lastRect.y });
      const flowB = screenToFlowPosition({ x: lastRect.x + lastRect.width, y: lastRect.y + lastRect.height });
      const minX = Math.min(flowA.x, flowB.x), maxX = Math.max(flowA.x, flowB.x);
      const minY = Math.min(flowA.y, flowB.y), maxY = Math.max(flowA.y, flowB.y);

      const intersecting = new Set<string>();
      for (const n of shapeNodesRef.current) {
        if (n.type !== 'shape' && n.type !== 'path') continue;
        const r = getAbsoluteRect(n.id);
        if (r && r.x < maxX && r.x + r.width > minX && r.y < maxY && r.y + r.height > minY) intersecting.add(n.id);
      }
      const finalSet = new Set([...preSelectedIds, ...intersecting]);
      onNodesChange(
        shapeNodesRef.current
          .filter(n => n.type === 'shape' || n.type === 'path')
          .map(n => ({ type: 'select' as const, id: n.id, selected: finalSet.has(n.id) })),
      );

      // Marquee-selecting edges too — previously a drag-select only ever
      // covered shapes/paths, so there was no way to bulk-select connectors
      // at all. Approximates each edge's bbox as the union of its two
      // endpoint shapes' rects (no cheap access to the actual rendered SVG
      // path's bbox from here) — close enough for "does this edge fall
      // inside the marquee" given connectors are always short relative to
      // the shapes they join.
      const intersectingEdges = new Set<string>();
      for (const edge of connectorEdges) {
        const srcRect = getAbsoluteRect(edge.source);
        const tgtRect = getAbsoluteRect(edge.target);
        if (!srcRect || !tgtRect) continue;
        const ex = Math.min(srcRect.x, tgtRect.x);
        const ey = Math.min(srcRect.y, tgtRect.y);
        const ex2 = Math.max(srcRect.x + srcRect.width, tgtRect.x + tgtRect.width);
        const ey2 = Math.max(srcRect.y + srcRect.height, tgtRect.y + tgtRect.height);
        if (ex < maxX && ex2 > minX && ey < maxY && ey2 > minY) intersectingEdges.add(edge.id);
      }
      const finalEdgeSet = new Set([...preSelectedEdgeIds, ...intersectingEdges]);
      onEdgesChange(
        connectorEdges.map(edge => ({ type: 'select' as const, id: edge.id, selected: finalEdgeSet.has(edge.id) })),
      );
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  useEffect(() => {
    if (!placingShapeKind) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { setPlacingShapeKind(null); setPendingMediaPlacement(null); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [placingShapeKind]);

  async function handleUploadMedia(file: File) {
    const isVideo = file.type.startsWith('video/');
    // SVGs are already vector/tiny — rasterizing one through the downsample
    // canvas would only make it worse, so they're excluded alongside video.
    const isDownsamplable = !isVideo && file.type !== 'image/svg+xml';

    let fileToUpload: File | Blob = file;
    let downsampled = false;
    if (isDownsamplable) {
      // Previously a plain Modal.confirm with only Downsample/Keep original
      // — every dismissal path (including the X/Escape, once closable is
      // enabled) fell through to Modal.confirm's shared onCancel, which
      // meant "keep original" and "actually cancel this upload" were the
      // exact same outcome: there was no way to back out of the paste/drop
      // entirely. A custom footer gives "Cancel upload" its own explicit
      // button (and its own outcome) separate from the built-in
      // onCancel, which is left to mean ONLY "dismissed without an
      // explicit choice" (X, Escape) — mapped to 'cancel' too, since
      // silently falling through to an upload on a stray Escape press is
      // exactly the surprising behavior being fixed here.
      const outcome = await new Promise<'downsample' | 'keep' | 'cancel'>(resolve => {
        let modalInstance: { destroy: () => void } | null = null;
        let resolved = false;
        function settle(result: 'downsample' | 'keep' | 'cancel') {
          if (resolved) return;
          resolved = true;
          resolve(result);
        }
        modalInstance = Modal.confirm({
          title: 'Downsample this image?',
          content: `This image is ${formatBytes(file.size)}. Downsampling can significantly reduce storage use, usually with little visible quality loss. You can also downsample it later from the shape's Settings tab.`,
          closable: true,
          maskClosable: false,
          okText: 'Downsample',
          footer: (_, { OkBtn }) => (
            <>
              <Button onClick={() => { settle('cancel'); modalInstance?.destroy(); }}>Cancel upload</Button>
              <Button onClick={() => { settle('keep'); modalInstance?.destroy(); }}>Keep original</Button>
              <OkBtn />
            </>
          ),
          onOk: () => settle('downsample'),
          onCancel: () => settle('cancel'),
        });
      });
      if (outcome === 'cancel') return;
      downsampled = outcome === 'downsample';
      if (downsampled) fileToUpload = await downsampleImageFile(file);
    }

    setUploadProgress({ fileName: file.name, percent: 0 });
    const [dims, upload] = await Promise.all([
      isVideo ? getVideoDimensions(file) : getImageDimensions(file),
      isVideo
        ? uploadDiagramMedia(diagramId, fileToUpload, 'diagramVideos', percent => setUploadProgress({ fileName: file.name, percent }))
        : uploadDiagramImage(diagramId, fileToUpload, percent => setUploadProgress({ fileName: file.name, percent })),
    ]);
    setUploadProgress(null);

    const maxDim = 320;
    const scale = Math.min(1, maxDim / Math.max(dims.width, dims.height));
    const width = Math.round(dims.width * scale);
    const height = Math.round(dims.height * scale);
    // Don't route through beginPlacingShape here — it calls selectTool('select'),
    // which would also null out the pendingMediaPlacement we're about to set
    // (both setState calls batch together since neither is separated by an
    // await, so the clear would silently win over the set).
    selectTool('select');
    setPendingMediaPlacement({
      kind: isVideo ? 'video' : 'image', url: upload.url, width, height,
      fileSizeBytes: isDownsamplable ? upload.sizeBytes : undefined, downsampled: isDownsamplable ? downsampled : undefined,
    });
    setPlacingShapeKind(isVideo ? 'video' : 'image');
  }

  // Arrow/connector tool — bypasses React Flow's own Handle-based connection
  // system entirely (same "raw mouse events on the wrapper div" approach as
  // the pen tool), so any point on a shape's body is a valid connect target,
  // not just its tiny edge handles. onStartConnect is called from inside
  // ShapeNode.tsx's own onMouseDown, injected via node data below.
  //
  // Every rect here must be in ABSOLUTE flow coordinates (matching
  // screenToFlowPosition's output), not node.position — for a node inside a
  // group, node.position is relative to the parent group, so using it
  // directly here would put the connector's start/end point wherever the
  // group happens to sit instead of on the actual shape.
  function getAbsoluteRect(nodeId: string): { x: number; y: number; width: number; height: number } | undefined {
    const internal = getInternalNode(nodeId);
    if (!internal) return undefined;
    const pos = internal.internals.positionAbsolute;
    const width = internal.width ?? internal.measured?.width ?? 0;
    const height = internal.height ?? internal.measured?.height ?? 0;
    return { x: pos.x, y: pos.y, width, height };
  }

  // Snaps a connector endpoint to a specific anchor of a `path` shape when
  // the drag point lands close to one, instead of always targeting the whole
  // rectangle — same zoom-normalized 10px threshold the pen tool's own
  // path-closing detection uses, for a consistent feel.
  function findNearestAnchor(nodeId: string, flowPoint: { x: number; y: number }, thresholdPx = 10): number | undefined {
    const node = shapeNodesRef.current.find(n => n.id === nodeId);
    const data = node?.data as ShapeNodeData | undefined;
    if (!data || data.kind !== 'path' || !data.pathAnchors?.length) return undefined;
    const rect = getAbsoluteRect(nodeId);
    if (!rect) return undefined;
    const { width: vbW, height: vbH } = computePathViewBox(data.pathAnchors);
    const zoom = getZoom();
    let best: { index: number; dist: number } | undefined;
    data.pathAnchors.forEach((a, i) => {
      const abs = anchorToAbsolute(a, rect, vbW, vbH, data.rotation ?? 0);
      const dist = Math.hypot(abs.x - flowPoint.x, abs.y - flowPoint.y);
      if (dist < thresholdPx / zoom && (!best || dist < best.dist)) best = { index: i, dist };
    });
    return best?.index;
  }

  function handleStartConnect(sourceId: string, e: React.MouseEvent) {
    const rect = getAbsoluteRect(sourceId);
    if (!rect) return;
    const startFlowPoint = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const sourceAnchorIndex = findNearestAnchor(sourceId, startFlowPoint);
    const source = sourceAnchorIndex !== undefined
      ? (() => {
        const node = shapeNodesRef.current.find(n => n.id === sourceId);
        const data = node?.data as ShapeNodeData;
        const { width: vbW, height: vbH } = computePathViewBox(data.pathAnchors ?? []);
        return anchorToAbsolute(data.pathAnchors![sourceAnchorIndex], rect, vbW, vbH, data.rotation ?? 0);
      })()
      : { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    setConnectDrag({ sourceId, sourceAnchorIndex, sourceX: source.x, sourceY: source.y, current: { x: source.x, y: source.y } });
  }

  function handleConnectMouseMoveCapture(e: React.MouseEvent) {
    if (!connectMode || !connectDrag) return;
    setConnectDrag(d => d && { ...d, current: screenToFlowPosition({ x: e.clientX, y: e.clientY }) });
  }

  function findShapeAtFlowPoint(point: { x: number; y: number }, excludeId?: string): Node | undefined {
    return shapeNodesRef.current.find(n => {
      if (n.id === excludeId || n.type === 'group' || n.type === 'pageFrame') return false;
      const rect = getAbsoluteRect(n.id);
      if (!rect) return false;
      return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
    });
  }

  function handleConnectMouseUp(e: React.MouseEvent) {
    if (!connectMode || !connectDrag) return;
    const flowPoint = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const dragInfo = connectDrag;
    setConnectDrag(null);
    const target = findShapeAtFlowPoint(flowPoint, dragInfo.sourceId);
    if (!target) return;
    const sourceNode = shapeNodesRef.current.find(n => n.id === dragInfo.sourceId);
    const pageId = sourceNode ? findPageIdFor(sourceNode) : undefined;
    if (!pageId) return;
    const targetAnchorIndex = findNearestAnchor(target.id, flowPoint);
    const edge: DiagramEdge = {
      id: crypto.randomUUID(),
      source: dragInfo.sourceId,
      target: target.id,
      type: 'smart',
      markerEnd: { type: MarkerType.ArrowClosed, color: '#8a93a6' },
      data: {
        routing: toolDefaults.connector.routing,
        flowAnimation: toolDefaults.connector.flowAnimation,
        startArrow: toolDefaults.connector.startArrow,
        endArrow: toolDefaults.connector.endArrow,
        ...(dragInfo.sourceAnchorIndex !== undefined ? { sourceAnchorIndex: dragInfo.sourceAnchorIndex } : {}),
        ...(targetAnchorIndex !== undefined ? { targetAnchorIndex } : {}),
      },
    };
    setConnectorEdges(prev => addEdge(edge, prev));
    saveConnector(diagramId, pageId, edge);
    pushHistory({
      undo: () => { setConnectorEdges(prev => prev.filter(e => e.id !== edge.id)); deleteConnector(diagramId, pageId, edge.id); },
      redo: () => { setConnectorEdges(prev => addEdge(edge, prev)); saveConnector(diagramId, pageId, edge); },
    });
    // Sticky — stays active for the next connector.
  }

  useEffect(() => {
    if (!connectMode) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { setConnectMode(false); setConnectDrag(null); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [connectMode]);

  function finalizeBrushStroke(points: BrushPoint[]) {
    setBrushDraft(null);
    if (points.length < 2) return;
    const pageId = getPageIdForFlowPoint(points[0]);
    if (!pageId) return;
    const PAD = 12;
    const minX = Math.min(...points.map(p => p.x)) - PAD;
    const minY = Math.min(...points.map(p => p.y)) - PAD;
    const maxX = Math.max(...points.map(p => p.x)) + PAD;
    const maxY = Math.max(...points.map(p => p.y)) + PAD;
    const width = maxX - minX, height = maxY - minY;
    const localPoints: BrushPoint[] = points.map(p => ({ x: p.x - minX, y: p.y - minY, pressure: p.pressure }));
    const node: DiagramNode = {
      id: crypto.randomUUID(),
      type: 'shape',
      position: { x: minX, y: minY },
      width, height,
      zIndex: nextZIndexForPage(pageId),
      data: {
        kind: 'brushStroke', pageId,
        brushPoints: localPoints, brushStyle: toolDefaults.brush.brushStyle, brushBaseWidth: toolDefaults.brush.brushBaseWidth,
        brushViewBoxWidth: width, brushViewBoxHeight: height,
        strokeColor: toolDefaults.brush.strokeColor,
      },
    };
    setShapeNodes(prev => [...prev, { ...node, data: { ...node.data, onCommit, onNavigateLink: navigateToLink } }]);
    saveShape(diagramId, pageId, node);
  }

  // Raw window pointermove/pointerup (not React's onMouseMove) so a real
  // stylus's `.pressure` is available on every sample — React's synthetic
  // mouse events don't carry it. Mouse/touch input (pointerType !== 'pen')
  // has no meaningful pressure signal at all (browsers report a flat 0.5),
  // so its "pressure" is simulated from movement speed instead: drawing
  // fast thins the stroke, slowing down thickens it, which reads as a much
  // more natural brush feel than a constant width ever does with a mouse.
  function handleBrushMouseDown(e: React.MouseEvent) {
    if (!brushMode || e.button !== 0) return;
    e.preventDefault();
    // Explicitly bypass snap-to-grid for every captured point, even when the
    // user has it enabled — snapping is for placing/aligning whole shapes,
    // not for a freehand path, where quantizing each sampled point to the
    // grid turns a smooth stroke into a jagged, staircased one.
    const startFlow = screenToFlowPosition({ x: e.clientX, y: e.clientY }, { snapToGrid: false });
    const native = e.nativeEvent as PointerEvent;
    const isRealPen = native.pointerType === 'pen';
    const points: BrushPoint[] = [{ x: startFlow.x, y: startFlow.y, pressure: isRealPen ? (native.pressure || 0.5) : 0.6 }];
    setBrushDraft([...points]);
    let last = { x: startFlow.x, y: startFlow.y, t: Date.now() };

    function onMove(ev: PointerEvent) {
      const flow = screenToFlowPosition({ x: ev.clientX, y: ev.clientY }, { snapToGrid: false });
      const now = Date.now();
      let pressure: number;
      if (isRealPen) {
        pressure = ev.pressure || 0.5;
      } else {
        const dt = Math.max(1, now - last.t);
        const dist = Math.hypot(flow.x - last.x, flow.y - last.y);
        const speed = dist / dt;
        pressure = Math.max(0.15, Math.min(1, 1 - speed * 4));
      }
      last = { x: flow.x, y: flow.y, t: now };
      points.push({ x: flow.x, y: flow.y, pressure });
      setBrushDraft([...points]);
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      finalizeBrushStroke(points);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // Vector pen tool — a dedicated mutually-exclusive drawing mode (parallel
  // to highlightMode) rather than a click-to-add palette shape, since it
  // needs a multi-click/drag interaction sequence rather than a single click.
  // Nothing is written to Firestore until the path is completed, matching
  // every other "commit on interaction end" pattern already in this file.
  function finalizePath(anchors: PathAnchor[], closed: boolean) {
    if (anchors.length < 2) { setDraftAnchors([]); return; }
    const pageId = getPageIdForFlowPoint(anchors[0]);
    if (!pageId) { setDraftAnchors([]); return; }
    const PAD = 8;
    const minX = Math.min(...anchors.map(a => a.x)) - PAD;
    const minY = Math.min(...anchors.map(a => a.y)) - PAD;
    const maxX = Math.max(...anchors.map(a => a.x)) + PAD;
    const maxY = Math.max(...anchors.map(a => a.y)) + PAD;
    // Handle offsets are vectors relative to their own anchor, so translating
    // into node-local space only shifts anchor x/y, never the handles.
    const localAnchors: PathAnchor[] = anchors.map(a => ({
      x: a.x - minX, y: a.y - minY, handleIn: a.handleIn, handleOut: a.handleOut,
    }));
    const node: DiagramNode = {
      id: crypto.randomUUID(),
      type: 'path',
      position: { x: minX, y: minY },
      width: maxX - minX,
      height: maxY - minY,
      zIndex: nextZIndexForPage(pageId),
      data: {
        kind: 'path', pageId, pathAnchors: localAnchors, pathClosed: closed,
        strokeColor: toolDefaults.pen.strokeColor, strokeWidth: toolDefaults.pen.strokeWidth, strokeStyle: toolDefaults.pen.strokeStyle,
      },
    };
    setShapeNodes(prev => [...prev, { ...node, data: { ...node.data, onCommit, onNavigateLink: navigateToLink } }]);
    saveShape(diagramId, pageId, node);
    setDraftAnchors([]);
    setPenMode(false);
    lastPenClickRef.current = null;
  }

  function handlePenMouseDown(e: React.MouseEvent) {
    if (!penMode) return;
    e.preventDefault();
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setPenDrag({ start: flowPos, current: flowPos });
  }
  function handlePenMouseMoveCapture(e: React.MouseEvent) {
    if (!penMode || !penDrag) return;
    setPenDrag(d => d && { ...d, current: screenToFlowPosition({ x: e.clientX, y: e.clientY }) });
  }
  // React Flow's own pane handler (zoomOnDoubleClick) stops propagation on
  // the native dblclick event before it reaches this wrapper, so a real
  // onDoubleClick prop here never fires — detect "finish the open path"
  // ourselves from two consecutive mouseups close in time and position.
  function handlePenMouseUp(e: React.MouseEvent) {
    if (!penMode || !penDrag) return;
    const { start, current } = penDrag;
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    const zoom = getZoom();
    const dragDist = Math.hypot(dx, dy);
    setPenDrag(null);

    const now = Date.now();
    const last = lastPenClickRef.current;
    const isDoubleClick = !!last && now - last.time < 400 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 6;
    lastPenClickRef.current = { time: now, x: e.clientX, y: e.clientY };
    if (isDoubleClick) {
      lastPenClickRef.current = null;
      if (draftAnchors.length >= 1) finalizePath(draftAnchors, false);
      return;
    }

    if (draftAnchors.length >= 2) {
      const first = draftAnchors[0];
      const closeDist = Math.hypot(start.x - first.x, start.y - first.y);
      if (closeDist < 10 / zoom) {
        finalizePath(draftAnchors, true);
        return;
      }
    }
    const anchor: PathAnchor = dragDist > 3 / zoom
      ? { x: start.x, y: start.y, handleOut: { x: dx, y: dy }, handleIn: { x: -dx, y: -dy } }
      : { x: start.x, y: start.y };
    setDraftAnchors(prev => [...prev, anchor]);
  }

  useEffect(() => {
    if (!penMode) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (draftAnchors.length >= 2) finalizePath(draftAnchors, false);
        else setDraftAnchors([]);
        setPenMode(false);
        lastPenClickRef.current = null;
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [penMode, draftAnchors]);

  useEffect(() => {
    if (!brushMode) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setBrushMode(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [brushMode]);

  useEffect(() => {
    if (!stylePaintMode) return;
    function onKeyDown(e: KeyboardEvent) {
      // First Escape drops the picked-up source (so the user can pick a
      // different one); a second Escape exits the tool entirely — matches
      // the "two-stage Escape" convention already used for Direct Selection.
      if (e.key !== 'Escape') return;
      if (stylePaintSource) setStylePaintSource(null);
      else setStylePaintMode(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stylePaintMode, stylePaintSource]);

  // Post-creation anchor editing — selecting a path shows its anchors
  // passively (see editingPathId above); they only become interactive while
  // Direct Selection is on. Dragging a marker updates pathAnchors live via
  // updateNodeData (fast visual feedback, no Firestore write per pixel) and
  // only persists on mouseup. A click WITHOUT a drag (under the same
  // dragDist>3/zoom threshold the pen tool itself uses to distinguish a
  // smooth-point drag from a plain click) instead focuses the anchor for
  // keyboard nudge/delete, rather than moving it.
  function handleAnchorMarkerMouseDown(anchorIndex: number, part: AnchorPart, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!editingPathId || !directSelectMode) return;
    const pathId = editingPathId;
    const node = shapeNodesRef.current.find(n => n.id === pathId);
    const rect = getAbsoluteRect(pathId);
    if (!node || !rect) return;
    const data = node.data as ShapeNodeData;
    const rotationDeg = data.rotation ?? 0;
    const { width: vbW, height: vbH } = computePathViewBox(data.pathAnchors ?? []);
    let liveAnchors = [...(data.pathAnchors ?? [])];
    const startClientX = e.clientX, startClientY = e.clientY;
    const dragThresholdPx = 3;
    let dragStarted = false;

    function onMove(ev: MouseEvent) {
      if (!dragStarted && Math.hypot(ev.clientX - startClientX, ev.clientY - startClientY) < dragThresholdPx) return;
      dragStarted = true;
      const abs = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      const local = absoluteToAnchorLocal(abs, rect!, vbW, vbH, rotationDeg);
      const next = [...liveAnchors];
      const anchor = next[anchorIndex];
      if (part === 'anchor') {
        next[anchorIndex] = { ...anchor, x: local.x, y: local.y };
      } else {
        const offset = { x: local.x - anchor.x, y: local.y - anchor.y };
        const mirrorKey: AnchorPart = part === 'handleIn' ? 'handleOut' : 'handleIn';
        const updated = { ...anchor, [part]: offset };
        // Mirror the opposite handle to keep the curve smooth, matching the
        // symmetric behavior already used when a point is first created by
        // dragging.
        if (anchor[mirrorKey as 'handleIn' | 'handleOut']) {
          updated[mirrorKey as 'handleIn' | 'handleOut'] = { x: -offset.x, y: -offset.y };
        }
        next[anchorIndex] = updated;
      }
      liveAnchors = next;
      updateNodeData(pathId, { pathAnchors: next });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (!dragStarted) {
        // Pure click: focus this anchor for keyboard nudge/delete rather than moving it.
        setActiveAnchorIndex(anchorIndex);
        return;
      }
      const pageId = findPageIdFor(node);
      if (!pageId) return;
      const normalized = normalizePathAnchors(liveAnchors, rect!, vbW, vbH);
      const persisted = toPersistableShape({
        ...node!,
        position: normalized.position, width: normalized.width, height: normalized.height,
        data: { ...data, pathAnchors: normalized.anchors },
      });
      setShapeNodes(prev => prev.map(n => n.id === pathId
        ? { ...n, position: normalized.position, width: normalized.width, height: normalized.height, data: { ...n.data, pathAnchors: normalized.anchors } }
        : n));
      saveShape(diagramId, pageId, persisted);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Persists a full anchors-array replacement through the same
  // normalize→toPersistableShape→saveShape pipeline the drag handler above
  // uses, for the discrete (non-drag) mutations below: insert, delete,
  // smooth/corner toggle, and (debounced) keyboard nudge.
  function commitPathAnchors(pathId: string, nextAnchors: PathAnchor[], prevVbW: number, prevVbH: number) {
    const node = shapeNodesRef.current.find(n => n.id === pathId);
    const rect = getAbsoluteRect(pathId);
    const pageId = node && findPageIdFor(node);
    if (!node || !rect || !pageId) return;
    const data = node.data as ShapeNodeData;
    const normalized = normalizePathAnchors(nextAnchors, rect, prevVbW, prevVbH);
    const persisted = toPersistableShape({
      ...node,
      position: normalized.position, width: normalized.width, height: normalized.height,
      data: { ...data, pathAnchors: normalized.anchors },
    });
    setShapeNodes(prev => prev.map(n => n.id === pathId
      ? { ...n, position: normalized.position, width: normalized.width, height: normalized.height, data: { ...n.data, pathAnchors: normalized.anchors } }
      : n));
    saveShape(diagramId, pageId, persisted);
  }

  // Click on a curve/line segment (while Direct Selection is on) inserts a
  // new anchor there via exact De Casteljau subdivision — the split curve is
  // geometrically identical to the original, so there's no visible kink.
  function handleInsertAnchor(segmentIndex: number, t: number) {
    if (!editingPathId) return;
    const pathId = editingPathId;
    const node = shapeNodesRef.current.find(n => n.id === pathId);
    const data = node?.data as ShapeNodeData | undefined;
    const anchors = data?.pathAnchors ?? [];
    if (!node || anchors.length < 2) return;
    const a = anchors[segmentIndex];
    const b = anchors[(segmentIndex + 1) % anchors.length];
    const { width: vbW, height: vbH } = computePathViewBox(anchors);
    let newAnchor: PathAnchor;
    const next = [...anchors];
    if (a.handleOut || b.handleIn) {
      const c1 = a.handleOut ? { x: a.x + a.handleOut.x, y: a.y + a.handleOut.y } : a;
      const c2 = b.handleIn ? { x: b.x + b.handleIn.x, y: b.y + b.handleIn.y } : b;
      const split = subdivideBezierAt(a, c1, c2, b, t);
      newAnchor = {
        x: split.point.x, y: split.point.y,
        handleIn: a.handleOut ? { x: split.c2Left.x - split.point.x, y: split.c2Left.y - split.point.y } : undefined,
        handleOut: b.handleIn ? { x: split.c1Right.x - split.point.x, y: split.c1Right.y - split.point.y } : undefined,
      };
      if (a.handleOut) next[segmentIndex] = { ...a, handleOut: { x: split.c1Left.x - a.x, y: split.c1Left.y - a.y } };
      if (b.handleIn) next[(segmentIndex + 1) % anchors.length] = { ...b, handleIn: { x: split.c2Right.x - b.x, y: split.c2Right.y - b.y } };
    } else {
      newAnchor = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    next.splice(segmentIndex + 1, 0, newAnchor);
    commitPathAnchors(pathId, next, vbW, vbH);
    setActiveAnchorIndex(segmentIndex + 1);
  }

  // Delete/Backspace with a focused anchor removes it — fewer than 2 anchors
  // can't describe a visible path at all, so that deletes the whole shape.
  function handleDeleteActiveAnchor() {
    if (!editingPathId || activeAnchorIndex === null) return;
    const pathId = editingPathId;
    const node = shapeNodesRef.current.find(n => n.id === pathId);
    const data = node?.data as ShapeNodeData | undefined;
    const anchors = data?.pathAnchors ?? [];
    if (!node || anchors.length === 0) return;
    const remaining = anchors.filter((_, i) => i !== activeAnchorIndex);
    setActiveAnchorIndex(null);
    if (remaining.length < 2) {
      const pageId = findPageIdFor(node);
      if (!pageId) return;
      deleteShape(diagramId, pageId, pathId);
      setShapeNodes(prev => prev.filter(n => n.id !== pathId));
      return;
    }
    const { width: vbW, height: vbH } = computePathViewBox(anchors);
    commitPathAnchors(pathId, remaining, vbW, vbH);
  }

  // Double-click an anchor to toggle smooth (mirrored handles) <-> corner
  // (no handles). Corner->smooth synthesizes new handles from the neighbors'
  // direction, since a corner point has no existing tangent to preserve.
  function handleToggleAnchorSmooth(index: number) {
    if (!editingPathId) return;
    const pathId = editingPathId;
    const node = shapeNodesRef.current.find(n => n.id === pathId);
    const data = node?.data as ShapeNodeData | undefined;
    const anchors = data?.pathAnchors ?? [];
    if (!node || index >= anchors.length) return;
    const { width: vbW, height: vbH } = computePathViewBox(anchors);
    const anchor = anchors[index];
    const next = [...anchors];
    if (anchor.handleIn || anchor.handleOut) {
      const { handleIn, handleOut, ...rest } = anchor;
      next[index] = rest;
    } else {
      next[index] = { ...anchor, ...synthesizeSmoothHandles(anchors, index, !!data!.pathClosed) };
    }
    commitPathAnchors(pathId, next, vbW, vbH);
  }

  // Arrow-key nudge for the focused anchor — moves it by a fixed amount in
  // path-local/viewBox units (not screen pixels), so the nudge distance is
  // independent of zoom, matching how the underlying data is actually
  // stored. Live-updates via updateNodeData immediately, but debounces the
  // actual Firestore write so holding a key down doesn't write-storm.
  const nudgeCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!directSelectMode || !editingPathId || activeAnchorIndex === null) return;
    const pathId = editingPathId;
    const anchorIndex = activeAnchorIndex;
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const dir = ({ ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 } } as Record<string, { x: number; y: number }>)[e.key];
      if (!dir) return;
      e.preventDefault();
      const node = shapeNodesRef.current.find(n => n.id === pathId);
      const data = node?.data as ShapeNodeData | undefined;
      const anchors = data?.pathAnchors ?? [];
      if (!node || anchorIndex >= anchors.length) return;
      const step = e.shiftKey ? 10 : 1;
      const { width: vbW, height: vbH } = computePathViewBox(anchors);
      const nextAnchors = anchors.map((a, i) => i === anchorIndex ? { ...a, x: a.x + dir.x * step, y: a.y + dir.y * step } : a);
      updateNodeData(pathId, { pathAnchors: nextAnchors });
      if (nudgeCommitTimerRef.current) clearTimeout(nudgeCommitTimerRef.current);
      nudgeCommitTimerRef.current = setTimeout(() => commitPathAnchors(pathId, nextAnchors, vbW, vbH), 400);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directSelectMode, editingPathId, activeAnchorIndex]);

  // Delete/Backspace deletes the focused anchor while Direct Selection is
  // active — must suppress RF's own deleteKeyCode-driven whole-node delete
  // at the <ReactFlow> prop level (below) to avoid both firing on one press.
  useEffect(() => {
    if (!directSelectMode || !editingPathId || activeAnchorIndex === null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteActiveAnchor();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directSelectMode, editingPathId, activeAnchorIndex]);

  // Two-stage Escape: clear anchor focus first, then Direct Selection mode,
  // and only fall through to a full deselect on a fresh Escape press once
  // neither of those "nested" focus levels is active.
  useEffect(() => {
    if (!editingPathId) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (activeAnchorIndex !== null) setActiveAnchorIndex(null);
      else if (directSelectMode) setDirectSelectMode(false);
      else deselectAll();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingPathId, activeAnchorIndex, directSelectMode]);

  // Path shapes are their own RF node type (not 'shape'), but they're still
  // a regular shape from the properties-panel's point of view — excluding
  // them here meant a selected path never got a ShapePropertiesPanel at all
  // (pre-existing gap, only surfaced now that paths have panel controls to
  // reach, like "Edit points").
  //
  // Scoped to activePageId — every page in the current viewMode stays
  // mounted simultaneously (continuous canvas), and React Flow's own
  // click-elsewhere deselection only fires from an actual pane click.
  // Navigating to a different page via the left rail (or anything else
  // that doesn't click the pane) left a shape/edge selected on a page you'd
  // since scrolled away from, and its floating properties bar kept showing
  // with nothing visibly selected — confirmed live for the connector
  // routing bar specifically, fixed here for both shapes and edges since
  // they share the identical root cause.
  const selectedShapeIds = nodes
    .filter(n => n.selected && (n.type === 'shape' || n.type === 'path') && (!activePageId || (n.data as ShapeNodeData | undefined)?.pageId === activePageId))
    .map(n => n.id);
  const selectedGroup = nodes.find(n => n.selected && n.type === 'group');
  // Falls back to the ephemeral inherited-master layer — those synthetic
  // `inherited-*` ids are never in shapeNodes (the real committed state),
  // so without this an inherited shape would visually select but the
  // properties panel would silently never open.
  const singleSelectedShape = selectedShapeIds.length === 1
    ? (shapeNodes.find(n => n.id === selectedShapeIds[0]) ?? inheritedMasterNodes.find(n => n.id === selectedShapeIds[0]))
    : undefined;
  // 2+ real (never inherited-from-master — those are locked/read-only)
  // selected shapes, for ShapePropertiesPanel's bulk-edit mode: style/font/
  // etc. fields apply to every one of these at once, while geometry
  // (position/size, via onResize/onMove) stays scoped to just the first —
  // the dedicated multi-select resize overlay already covers bulk resize in
  // a way that actually accounts for each shape's own position/size.
  const bulkSelectedShapes = selectedShapeIds.length >= 2
    ? selectedShapeIds.map(id => shapeNodes.find(n => n.id === id)).filter((n): n is Node => !!n)
    : [];
  // Same activePageId scoping as selectedShapeIds above, and for the same
  // reason — connectorEdges keeps every page's connectors loaded at once,
  // so an edge selected on a page you've since navigated away from (via the
  // rail, not a pane click) stayed marked selected forever, which is what
  // made the routing/arrow-style bar pop up with nothing visibly selected.
  const selectedEdges = connectorEdges.filter(e => {
    if (!e.selected) return false;
    if (!activePageId) return true;
    const sourcePageId = (nodes.find(n => n.id === e.source)?.data as ShapeNodeData | undefined)?.pageId;
    return sourcePageId === activePageId;
  });
  const singleSelectedEdge = selectedEdges.length === 1 ? selectedEdges[0] : undefined;
  const BOOLEAN_ELIGIBLE_KINDS = new Set(['path', 'ellipse', 'rectangle', 'stickyNote', 'container']);
  const canBooleanOp = selectedShapeIds.length === 2 && selectedShapeIds.every(id => {
    const data = shapeNodes.find(n => n.id === id)?.data as ShapeNodeData | undefined;
    return !!data && BOOLEAN_ELIGIBLE_KINDS.has(data.kind) && !data.rotation;
  });

  function deselectAll() {
    onNodesChange(nodes.filter(n => n.selected).map(n => ({ type: 'select', id: n.id, selected: false })));
  }
  deselectAllRef.current = deselectAll;

  function isLocked(id: string): boolean {
    return !!(shapeNodes.find(n => n.id === id)?.data as ShapeNodeData | undefined)?.locked;
  }

  // Shared by "Group" (plain, unstyled — `type: 'group'`, routes to
  // GroupNode.tsx) and "Container" (styled, themeable — `type: 'shape'` with
  // `data.kind: 'container'`, routes to ShapeNode.tsx). Containment mechanics
  // (parentId + extent:'parent') aren't tied to either node type, so both
  // share the exact same bounding-box + reparent math; only the resulting
  // node's type/data differ.
  async function wrapSelectedIn(kind: 'group' | 'container') {
    const selected = shapeNodes.filter(n => selectedShapeIds.includes(n.id) && !isLocked(n.id));
    if (selected.length < 2) return;
    const pageId = findPageIdFor(selected[0]);
    if (!pageId) return;
    // Mixed-parent grouping (selecting shapes from different existing groups,
    // or a mix of top-level and grouped shapes) is unsupported in v1 — the
    // bounding box / reparenting math below assumes every selected shape's
    // position is already expressed in the SAME coordinate space (their
    // shared parent's, or absolute if top-level).
    const parentIds = new Set(selected.map(n => n.parentId));
    if (parentIds.size > 1) return;
    const commonParentId = selected[0].parentId;

    const minX = Math.min(...selected.map(n => n.position.x)) - GROUP_PADDING;
    const minY = Math.min(...selected.map(n => n.position.y)) - GROUP_PADDING;
    const maxX = Math.max(...selected.map(n => n.position.x + (n.width ?? 100))) + GROUP_PADDING;
    const maxY = Math.max(...selected.map(n => n.position.y + (n.height ?? 70))) + GROUP_PADDING;

    const groupId = crypto.randomUUID();
    const groupNode: DiagramNode = {
      id: groupId,
      type: kind === 'group' ? 'group' : 'shape',
      position: { x: minX, y: minY },
      width: maxX - minX,
      height: maxY - minY,
      // A plain -1, not -0.5 — CSS z-index only accepts integers, and a
      // fractional value here is silently discarded by the browser (same
      // bug just fixed in inheritedMasterNodes above), leaving this newly
      // wrapped group/container with no effective z-index at all instead of
      // reliably sitting just behind the real content it's meant to frame.
      zIndex: -1,
      parentId: commonParentId,
      extent: commonParentId ? ('parent' as const) : undefined,
      data: kind === 'group'
        ? { kind: 'group', pageId, label: 'Group' }
        : { kind: 'container', pageId, label: 'Container', containerTheme: 'plain' },
    };
    // Await the parent write before saving children — a child doc with a
    // parentId React Flow can't yet resolve (parent snapshot not landed) will
    // warn/break rendering for whoever's snapshot listener sees it first.
    await saveShape(diagramId, pageId, groupNode);

    const reparented = selected.map(n => toPersistableShape({
      ...n,
      parentId: groupId,
      extent: 'parent' as const,
      position: { x: n.position.x - minX, y: n.position.y - minY },
    }));
    await Promise.all(reparented.map(child => saveShape(diagramId, pageId, child)));
  }

  async function handleGroup() {
    await wrapSelectedIn('group');
  }

  // Unlike Group, an empty container is a legitimate starting point (a Visio
  // user places the box first, then moves shapes in) — drag-and-drop
  // reparenting isn't built yet, so for now that "moves in" step still means
  // select-then-Group, but the box itself shouldn't require 2+ shapes to exist.
  async function handleInsertContainer() {
    if (selectedShapeIds.length >= 2) {
      await wrapSelectedIn('container');
      return;
    }
    const pageId = activePageId ?? pages[0]?.id;
    if (!pageId) return;
    const origin = pageOrigins.get(pageId) ?? 0;
    const node: DiagramNode = {
      id: crypto.randomUUID(),
      type: 'shape',
      position: { x: PAGE_X + 60, y: origin + 60 },
      width: 320,
      height: 220,
      // A plain -1, not -0.5 — CSS z-index only accepts integers, and a
      // fractional value here is silently discarded by the browser (same
      // bug just fixed in inheritedMasterNodes above), leaving this newly
      // wrapped group/container with no effective z-index at all instead of
      // reliably sitting just behind the real content it's meant to frame.
      zIndex: -1,
      data: { kind: 'container', pageId, label: 'Container', containerTheme: 'plain' },
    };
    await saveShape(diagramId, pageId, node);
  }

  // Rows/columns are always rendered evenly split (see ShapeNode.tsx), so
  // adding/removing one is purely a `tableCells` grid edit — no width/height
  // array to rebalance. Goes through `onCommit` like every other shape data
  // edit, so it gets the same debounced undo/redo entry as anything else.
  function addTableRow(id: string) {
    const node = shapeNodes.find(n => n.id === id);
    const data = node?.data as ShapeNodeData | undefined;
    if (!data || data.kind !== 'table') return;
    const cols = data.tableCols ?? 0;
    const cells = [...(data.tableCells ?? []), { cells: Array.from({ length: cols }, () => '') }];
    onCommit(id, { tableRows: (data.tableRows ?? 0) + 1, tableCells: cells });
  }
  function removeTableRow(id: string) {
    const node = shapeNodes.find(n => n.id === id);
    const data = node?.data as ShapeNodeData | undefined;
    if (!data || data.kind !== 'table' || (data.tableRows ?? 0) <= 1) return;
    const cells = (data.tableCells ?? []).slice(0, -1);
    onCommit(id, { tableRows: (data.tableRows ?? 1) - 1, tableCells: cells });
  }
  function addTableColumn(id: string) {
    const node = shapeNodes.find(n => n.id === id);
    const data = node?.data as ShapeNodeData | undefined;
    if (!data || data.kind !== 'table') return;
    const cells = (data.tableCells ?? []).map(row => ({ cells: [...row.cells, ''] }));
    onCommit(id, { tableCols: (data.tableCols ?? 0) + 1, tableCells: cells });
  }
  function removeTableColumn(id: string) {
    const node = shapeNodes.find(n => n.id === id);
    const data = node?.data as ShapeNodeData | undefined;
    if (!data || data.kind !== 'table' || (data.tableCols ?? 0) <= 1) return;
    const cells = (data.tableCells ?? []).map(row => ({ cells: row.cells.slice(0, -1) }));
    onCommit(id, { tableCols: (data.tableCols ?? 1) - 1, tableCells: cells });
  }

  function handleUngroup() {
    if (!selectedGroup || isLocked(selectedGroup.id)) return;
    const pageId = findPageIdFor(selectedGroup);
    const children = shapeNodes.filter(n => n.parentId === selectedGroup.id);
    // Promote children to the ungrouped group's OWN parent (not always
    // top-level/absolute) so ungrouping a nested sub-group correctly leaves
    // its children inside the outer group rather than jumping to the page root.
    const grandParentId = selectedGroup.parentId;
    for (const child of children) {
      const promoted = toPersistableShape({
        ...child,
        parentId: grandParentId,
        extent: grandParentId ? ('parent' as const) : undefined,
        position: { x: child.position.x + selectedGroup.position.x, y: child.position.y + selectedGroup.position.y },
      });
      if (pageId) saveShape(diagramId, pageId, promoted);
    }
    if (pageId) deleteShape(diagramId, pageId, selectedGroup.id);
  }

  // Saves whichever of `targetIds` changed in `updatedNodes` — not tied to
  // any one field, used by z-order, align, and distribute alike.
  // Batches every changed shape into ONE atomic write (see saveShapes' own
  // comment in store.ts) — critical here specifically because this is the
  // shared path behind bringToFront/sendToBack/alignSelected/
  // distributeSelected, all of which can touch many shapes on one page at
  // once. N independent unbatched writes let subscribeShapes' whole-
  // collection listener rebuild this app's shape state from a genuinely
  // partial mix of updated/stale docs mid-flight — confirmed live as the
  // exact cause of z-index reordering "sometimes working, sometimes
  // reverting until a hard reload."
  function persistNodes(updatedNodes: Node[], targetIds: string[]) {
    const updates: { pageId: string; node: DiagramNode }[] = [];
    for (const n of updatedNodes) {
      if (!targetIds.includes(n.id)) continue;
      const pageId = findPageIdFor(n);
      if (pageId) updates.push({ pageId, node: toPersistableShape(n) });
    }
    if (updates.length > 0) saveShapes(diagramId, updates);
  }

  function getBBox(n: Node): { x: number; y: number; w: number; h: number } {
    return { x: n.position.x, y: n.position.y, w: n.width ?? n.measured?.width ?? 100, h: n.height ?? n.measured?.height ?? 70 };
  }

  // Multi-select resize: captures every currently-selected top-level shape's
  // geometry the moment the drag starts (start ref), so handleEnd can later
  // compute one scale factor from the combined bbox's before/after size and
  // apply it to each shape relative to that SAME starting bbox's origin —
  // exactly handleResizeGroup's math (see its own comment), just generalized
  // from a real group's descendant tree to an ad-hoc multi-selection.
  const multiSelectResizeStartRef = useRef<{ bbox: { x: number; y: number; w: number; h: number }; shapes: Node[] } | null>(null);
  function handleMultiSelectResizeStart() {
    const targets = shapeNodesRef.current.filter(n => n.selected && !n.parentId && !(n.data as ShapeNodeData).locked);
    if (targets.length < 2) { multiSelectResizeStartRef.current = null; return; }
    const boxes = targets.map(getBBox);
    const minX = Math.min(...boxes.map(b => b.x));
    const minY = Math.min(...boxes.map(b => b.y));
    const maxX = Math.max(...boxes.map(b => b.x + b.w));
    const maxY = Math.max(...boxes.map(b => b.y + b.h));
    multiSelectResizeStartRef.current = { bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY }, shapes: targets };
  }
  function handleMultiSelectResizeEnd(_e: unknown, params: { x: number; y: number; width: number; height: number }) {
    const start = multiSelectResizeStartRef.current;
    multiSelectResizeStartRef.current = null;
    if (!start || start.bbox.w <= 0 || start.bbox.h <= 0) return;
    const scaleX = params.width / start.bbox.w;
    const scaleY = params.height / start.bbox.h;
    const before = start.shapes.map(n => ({ id: n.id, pageId: (n.data as ShapeNodeData).pageId, node: n as DiagramNode }));
    const after = start.shapes.map(n => {
      const bbox = getBBox(n);
      const position = {
        x: params.x + (bbox.x - start.bbox.x) * scaleX,
        y: params.y + (bbox.y - start.bbox.y) * scaleY,
      };
      const width = (n.width ?? bbox.w) * scaleX;
      const height = (n.height ?? bbox.h) * scaleY;
      return { id: n.id, pageId: (n.data as ShapeNodeData).pageId, node: { ...n, position, width, height } as DiagramNode };
    });
    commitShapeUpdates(after);
    pushHistory({ undo: () => commitShapeUpdates(before), redo: () => commitShapeUpdates(after) });
  }

  // Multi-select group rotate — same synthetic-overlay-drives-the-real-
  // shapes pattern as handleMultiSelectResizeStart/End above, generalized to
  // rotation: every selected shape's center rotates around the GROUP's own
  // combined-bbox center by the same delta angle, and that same delta is
  // added to each shape's own stored rotation. Unlike resize (where
  // NodeResizer gives the synthetic overlay free live visual feedback while
  // the real shapes only snap into place on release), there's no equivalent
  // free mechanism for a hand-rolled rotate drag — so this updates the real
  // shapeNodes state live on every mousemove tick (a plain setShapeNodes,
  // not yet persisted) for real-time visual feedback, then commits via
  // commitShapeUpdates (the same function handleMultiSelectResizeEnd already
  // uses for "multi-select-overlay gesture mutates N shapes' full geometry
  // at once") + one pushHistory entry on mouseup.
  function handleGroupRotateStart(e: React.MouseEvent) {
    e.stopPropagation();
    const targets = shapeNodesRef.current.filter(n => n.selected && !n.parentId && !(n.data as ShapeNodeData).locked);
    if (targets.length < 2) return;
    const boxes = targets.map(getBBox);
    const minX = Math.min(...boxes.map(b => b.x));
    const minY = Math.min(...boxes.map(b => b.y));
    const maxX = Math.max(...boxes.map(b => b.x + b.w));
    const maxY = Math.max(...boxes.map(b => b.y + b.h));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const shapes = targets.map(n => {
      const b = getBBox(n);
      return { id: n.id, cx: b.x + b.w / 2, cy: b.y + b.h / 2, startRotation: (n.data as ShapeNodeData).rotation ?? 0 };
    });
    const startFlow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const startAngle = Math.atan2(startFlow.y - centerY, startFlow.x - centerX);
    let finalDelta = 0;
    // Local, gesture-scoped Shift tracking (not the per-shape useShiftHeld
    // hook, which lives inside ShapeNode/PathNode components, out of reach
    // here) — live, same as single-shape rotate's own constrain check.
    let shiftDown = e.shiftKey;
    function onShiftKeyDown(ke: KeyboardEvent) { if (ke.key === 'Shift') shiftDown = true; }
    function onShiftKeyUp(ke: KeyboardEvent) { if (ke.key === 'Shift') shiftDown = false; }

    function onMove(ev: MouseEvent) {
      const flow = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      const angle = Math.atan2(flow.y - centerY, flow.x - centerX);
      const rawDeltaDeg = ((angle - startAngle) * 180) / Math.PI;
      const step = (uxPrefs.shiftRotateConstrainEnabled && shiftDown) ? 15 : 1;
      finalDelta = Math.round(rawDeltaDeg / step) * step;
      const rad = (finalDelta * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      setShapeNodes(prev => prev.map(n => {
        const s = shapes.find(t => t.id === n.id);
        if (!s) return n;
        const dx = s.cx - centerX, dy = s.cy - centerY;
        const newCx = centerX + dx * cos - dy * sin;
        const newCy = centerY + dx * sin + dy * cos;
        const b = getBBox(n);
        return {
          ...n,
          position: { x: newCx - b.w / 2, y: newCy - b.h / 2 },
          data: { ...n.data, rotation: (s.startRotation + finalDelta + 360) % 360 },
        };
      }));
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onShiftKeyDown);
      window.removeEventListener('keyup', onShiftKeyUp);
      const rad = (finalDelta * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const before = targets.map(n => ({ id: n.id, pageId: (n.data as ShapeNodeData).pageId, node: n as DiagramNode }));
      const after = shapes.map(s => {
        const original = targets.find(n => n.id === s.id)!;
        const dx = s.cx - centerX, dy = s.cy - centerY;
        const newCx = centerX + dx * cos - dy * sin;
        const newCy = centerY + dx * sin + dy * cos;
        const b = getBBox(original);
        const position = { x: newCx - b.w / 2, y: newCy - b.h / 2 };
        const rotation = (s.startRotation + finalDelta + 360) % 360;
        return { id: s.id, pageId: (original.data as ShapeNodeData).pageId, node: { ...original, position, data: { ...original.data, rotation } } as DiagramNode };
      });
      if (finalDelta !== 0) {
        commitShapeUpdates(after);
        pushHistory({ undo: () => commitShapeUpdates(before), redo: () => commitShapeUpdates(after) });
      } else {
        // No net rotation — the live preview above already mutated
        // shapeNodes in place for the (empty) drag, so just restore the
        // untouched originals rather than leaving a stale, never-committed
        // in-memory position/rotation around.
        commitShapeUpdates(before);
      }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onShiftKeyDown);
    window.addEventListener('keyup', onShiftKeyUp);
  }

  // Batched across every id in one call — same reasoning as
  // applyPositionBatch above: pushZIndexHistory's undo/redo can cover many
  // shapes at once (undoing a bringToFront/sendToBack/reorder that touched
  // a whole page), and looping a single-shape write per id let
  // subscribeShapes' listener rebuild this app's shape state from a
  // partial mix of updated/stale docs mid-flight.
  function applyZIndexBatch(entries: Map<string, number>) {
    const updates: { pageId: string; node: DiagramNode }[] = [];
    for (const [id, zIndex] of entries) {
      for (const slice of shapesSlices.current.values()) {
        const existing = slice.get(id);
        if (existing) {
          const updated: DiagramNode = { ...existing, zIndex };
          slice.set(id, updated);
          updates.push({ pageId: existing.data.pageId, node: updated });
          break;
        }
      }
    }
    rebuildShapes();
    if (updates.length > 0) saveShapes(diagramId, updates);
    // Force React Flow to re-measure ALL nodes after rebuildShapes creates new references.
    // Same fix as applyPosition/applyPositionBatch/commitShapeUpdates - adoptUserNodes resets handleBounds/measured
    // for all nodes when receiving new object references, causing connectors to vanish.
    const allIds: string[] = [];
    for (const slice of shapesSlices.current.values()) {
      for (const node of slice.values()) {
        allIds.push(node.id);
      }
    }
    scheduleUpdateNodeInternals(allIds);
  }
  function pushPositionHistory(before: Map<string, { x: number; y: number }>, after: Map<string, { x: number; y: number }>) {
    pushHistory({
      undo: () => applyPositionBatch(before),
      redo: () => applyPositionBatch(after),
    });
  }
  function pushZIndexHistory(before: Map<string, number>, after: Map<string, number>) {
    pushHistory({
      undo: () => applyZIndexBatch(before),
      redo: () => applyZIndexBatch(after),
    });
  }

  function alignSelected(edge: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') {
    const targetIds = selectedShapeIds.filter(id => !isLocked(id));
    if (targetIds.length < 2) return;
    setShapeNodes(prev => {
      const before = new Map(prev.filter(n => targetIds.includes(n.id)).map(n => [n.id, n.position]));
      const boxes = prev.filter(n => targetIds.includes(n.id)).map(n => ({ id: n.id, ...getBBox(n) }));
      // Align-to-key-object: use that ONE shape's own bbox as the reference
      // instead of the combined selection bbox, when it's set and still
      // part of this selection.
      const keyBox = uxPrefs.alignToKeyObjectEnabled && keyObjectId ? boxes.find(b => b.id === keyObjectId) : undefined;
      const minX = keyBox ? keyBox.x : Math.min(...boxes.map(b => b.x));
      const maxRight = keyBox ? keyBox.x + keyBox.w : Math.max(...boxes.map(b => b.x + b.w));
      const minY = keyBox ? keyBox.y : Math.min(...boxes.map(b => b.y));
      const maxBottom = keyBox ? keyBox.y + keyBox.h : Math.max(...boxes.map(b => b.y + b.h));
      const centerX = (minX + maxRight) / 2;
      const centerY = (minY + maxBottom) / 2;
      const next = prev.map(n => {
        if (!targetIds.includes(n.id)) return n;
        const box = getBBox(n);
        let { x, y } = box;
        if (edge === 'left') x = minX;
        else if (edge === 'right') x = maxRight - box.w;
        else if (edge === 'hcenter') x = centerX - box.w / 2;
        else if (edge === 'top') y = minY;
        else if (edge === 'bottom') y = maxBottom - box.h;
        else if (edge === 'vcenter') y = centerY - box.h / 2;
        return { ...n, position: { x, y } };
      });
      persistNodes(next, targetIds);
      pushPositionHistory(before, new Map(next.filter(n => targetIds.includes(n.id)).map(n => [n.id, n.position])));
      return next;
    });
  }

  // `mode: 'spacing'` (default) equalizes the GAPS between edges, accounting
  // for each shape's own size — the existing, already-correct behavior.
  // `mode: 'centers'` ignores size entirely and equalizes the spacing
  // between CENTER POINTS across the same span — Illustrator/Affinity's
  // other distribute convention, previously missing here. Not gated behind
  // a preference (a plain second button, not a debatable interaction).
  function distributeSelected(axis: 'horizontal' | 'vertical', mode: 'spacing' | 'centers' = 'spacing') {
    const targetIds = selectedShapeIds.filter(id => !isLocked(id));
    if (targetIds.length < 3) return;
    setShapeNodes(prev => {
      const before = new Map(prev.filter(n => targetIds.includes(n.id)).map(n => [n.id, n.position]));
      const boxes = prev.filter(n => targetIds.includes(n.id)).map(n => ({ id: n.id, ...getBBox(n) }));
      const positions = new Map<string, { x: number; y: number }>();
      if (mode === 'centers') {
        const sorted = [...boxes].sort((a, b) => axis === 'horizontal' ? (a.x + a.w / 2) - (b.x + b.w / 2) : (a.y + a.h / 2) - (b.y + b.h / 2));
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const firstCenter = axis === 'horizontal' ? first.x + first.w / 2 : first.y + first.h / 2;
        const lastCenter = axis === 'horizontal' ? last.x + last.w / 2 : last.y + last.h / 2;
        const centerGap = (lastCenter - firstCenter) / (sorted.length - 1);
        sorted.forEach((b, i) => {
          const center = firstCenter + i * centerGap;
          positions.set(b.id, axis === 'horizontal' ? { x: center - b.w / 2, y: b.y } : { x: b.x, y: center - b.h / 2 });
        });
      } else {
        const sorted = [...boxes].sort((a, b) => axis === 'horizontal' ? a.x - b.x : a.y - b.y);
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const totalSize = sorted.reduce((sum, b) => sum + (axis === 'horizontal' ? b.w : b.h), 0);
        const span = axis === 'horizontal' ? (last.x + last.w) - first.x : (last.y + last.h) - first.y;
        const gap = (span - totalSize) / (sorted.length - 1);
        let cursor = axis === 'horizontal' ? first.x : first.y;
        for (const b of sorted) {
          positions.set(b.id, axis === 'horizontal' ? { x: cursor, y: b.y } : { x: b.x, y: cursor });
          cursor += (axis === 'horizontal' ? b.w : b.h) + gap;
        }
      }
      const next = prev.map(n => positions.has(n.id) ? { ...n, position: positions.get(n.id)! } : n);
      persistNodes(next, targetIds);
      pushPositionHistory(before, positions);
      return next;
    });
  }

  // Converts a shape into an absolute-page-space bezier contour for boolean
  // ops — real `path` shapes already have anchors; rectangle/stickyNote/
  // container and ellipse get an on-the-fly bezier approximation (a rounded
  // rect uses the exact same corner-radius math the shape itself renders
  // with). Anything else (text, images, UML/icon glyphs, groups, ...) has no
  // well-defined closed-region geometry to convert, so this returns null.
  // Rotated shapes are also unsupported for now — handle vectors would need
  // rotating along with each anchor point, which this doesn't do.
  function shapeToBooleanContour(node: Node): PathContour | null {
    const data = node.data as ShapeNodeData;
    if (data.rotation) return null;
    const w = node.width ?? 100, h = node.height ?? 70;
    const toAbsolute = (a: PathAnchor): PathAnchor => ({ ...a, x: a.x + node.position.x, y: a.y + node.position.y });
    if (data.kind === 'path') {
      return { anchors: (data.pathAnchors ?? []).map(toAbsolute), closed: !!data.pathClosed };
    }
    if (data.kind === 'ellipse') {
      return { anchors: ellipseToAnchors(w, h).map(toAbsolute), closed: true };
    }
    if (data.kind === 'rectangle' || data.kind === 'stickyNote' || data.kind === 'container') {
      const r = data.cornerRadius ?? (data.kind === 'stickyNote' ? 2 : 4);
      return { anchors: roundedRectToAnchors(w, h, r).map(toAbsolute), closed: true };
    }
    return null;
  }

  // Boolean path operations (union/subtract/intersect/exclude) — true
  // curve-preserving math via paper.js (see utils/pathBoolean.ts), not a
  // flatten-to-polygon approximation. A result with a genuine hole (e.g.
  // subtract leaving a ring) is grouped by containment (groupContoursBy
  // Containment) and rendered as one path shape with `pathHoles` cut out
  // via even-odd fill-rule — a real hole, not two overlapping opaque shapes.
  function applyBooleanOpToSelection(op: BooleanOp) {
    const targets = selectedShapeIds.filter(id => !isLocked(id)).map(id => shapeNodes.find(n => n.id === id)).filter((n): n is Node => !!n);
    if (targets.length !== 2) return;
    const [nodeA, nodeB] = targets;
    const contourA = shapeToBooleanContour(nodeA);
    const contourB = shapeToBooleanContour(nodeB);
    if (!contourA || !contourB) return;
    const foundPageId = findPageIdFor(nodeA);
    if (!foundPageId) return;
    const pageId: string = foundPageId;
    const results = applyBooleanOp(op, contourA, contourB);
    if (!results) return;

    const dataA = nodeA.data as ShapeNodeData;
    // A group's hole(s) — e.g. a ring left by a subtract — get normalized
    // into the SAME local space as their outer contour (not each into their
    // own), so they stay correctly positioned relative to it once the group
    // becomes a single path shape with `pathHoles`.
    const groups = groupContoursByContainment(results);
    const newShapes: DiagramNode[] = groups.map(({ outer, holes }) => {
      const allAnchors = [...outer.anchors, ...holes.flatMap(h => h.anchors)];
      const minX = Math.min(...allAnchors.map(a => a.x));
      const minY = Math.min(...allAnchors.map(a => a.y));
      const maxX = Math.max(...allAnchors.map(a => a.x));
      const maxY = Math.max(...allAnchors.map(a => a.y));
      const toLocal = (a: PathAnchor): PathAnchor => ({ x: a.x - minX, y: a.y - minY, handleIn: a.handleIn, handleOut: a.handleOut });
      const localAnchors = outer.anchors.map(toLocal);
      const localHoles = holes.map(h => ({ anchors: h.anchors.map(toLocal), closed: h.closed }));
      return {
        id: crypto.randomUUID(),
        type: 'path',
        position: { x: minX, y: minY },
        width: maxX - minX,
        height: maxY - minY,
        zIndex: nextZIndexForPage(pageId),
        data: {
          kind: 'path', pageId, pathAnchors: localAnchors, pathClosed: outer.closed,
          pathHoles: localHoles.length > 0 ? localHoles : undefined,
          fillColor: dataA.fillColor, strokeColor: dataA.strokeColor, strokeWidth: dataA.strokeWidth,
          effect: dataA.effect, opacity: dataA.opacity, blur: dataA.blur, fillGradient: dataA.fillGradient,
        },
      };
    });

    const removedIds = new Set([nodeA.id, nodeB.id]);
    const removedShapes = [nodeA, nodeB].map(n => getCommittedShape(n.id)).filter((n): n is DiagramNode => !!n);
    const removedEdges = connectorEdges.filter(e => removedIds.has(e.source) || removedIds.has(e.target));
    const removedEdgePages = removedEdges.map(e => ({ edge: e as DiagramEdge, pageId: findEdgePageId(e) ?? pageId }));

    function commitResult() {
      for (const id of removedIds) deleteShape(diagramId, pageId, id);
      for (const { edge, pageId: ep } of removedEdgePages) deleteConnector(diagramId, ep, edge.id);
      for (const s of newShapes) saveShape(diagramId, pageId, s);
      setShapeNodes(prev => [
        ...prev.filter(n => !removedIds.has(n.id)),
        ...newShapes.map(s => ({ ...s, data: { ...s.data, onCommit, onNavigateLink: navigateToLink } })),
      ]);
      setConnectorEdges(prev => prev.filter(e => !removedEdges.some(re => re.id === e.id)));
    }
    function revertResult() {
      for (const s of newShapes) deleteShape(diagramId, pageId, s.id);
      for (const s of removedShapes) saveShape(diagramId, pageId, s);
      for (const { edge, pageId: ep } of removedEdgePages) saveConnector(diagramId, ep, edge);
      setShapeNodes(prev => [
        ...prev.filter(n => !newShapes.some(s => s.id === n.id)),
        ...removedShapes.map(s => ({ ...s, data: { ...s.data, onCommit, onNavigateLink: navigateToLink } })),
      ]);
      setConnectorEdges(prev => [...prev, ...removedEdges]);
    }

    commitResult();
    pushHistory({ undo: revertResult, redo: commitResult });
  }

  function bringToFront() {
    const targets = selectedShapeIds.filter(id => !isLocked(id));
    if (targets.length === 0) return;
    setShapeNodes(prev => {
      const before = new Map(prev.filter(n => targets.includes(n.id)).map(n => [n.id, n.zIndex ?? 0]));
      const maxZ = Math.max(0, ...prev.map(n => n.zIndex ?? 0));
      const next = prev.map(n => targets.includes(n.id) ? { ...n, zIndex: maxZ + 1 } : n);
      persistNodes(next, targets);
      pushZIndexHistory(before, new Map(targets.map(id => [id, maxZ + 1])));
      return next;
    });
  }
  // Renumbers every shape on each affected page to consecutive integers
  // starting at 0 (targets first, in their prior relative order, then
  // everything else) rather than just decrementing the targets below the
  // page's current minimum. The old "minZ - 1" approach had no floor at all
  // relative to the page frame (zIndex -1) or master-inherited layer
  // (-0.5) — repeated sends-to-back on a page kept decrementing without
  // bound, and eventually a shape's zIndex dropped low enough to paint
  // BEHIND the frame's own opaque background, i.e. the shape silently
  // disappeared under "the white page." Compressing the whole page's range
  // on every call means it can never run away, at the cost of persisting
  // every shape on the page, not just the ones actually sent to back.
  function sendToBack() {
    const targets = selectedShapeIds.filter(id => !isLocked(id));
    if (targets.length === 0) return;
    setShapeNodes(prev => {
      const pageIds = new Set(
        targets.map(id => (prev.find(n => n.id === id)?.data as ShapeNodeData | undefined)?.pageId).filter((p): p is string => !!p),
      );
      const zUpdates = new Map<string, number>();
      for (const pageId of pageIds) {
        const pageShapes = prev.filter(n => !n.parentId && (n.data as ShapeNodeData).pageId === pageId);
        const targetsOnPage = pageShapes.filter(n => targets.includes(n.id)).sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
        const restOnPage = pageShapes.filter(n => !targets.includes(n.id)).sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
        [...targetsOnPage, ...restOnPage].forEach((n, i) => zUpdates.set(n.id, i));
      }
      const before = new Map(prev.filter(n => zUpdates.has(n.id)).map(n => [n.id, n.zIndex ?? 0]));
      const next = prev.map(n => zUpdates.has(n.id) ? { ...n, zIndex: zUpdates.get(n.id)! } : n);
      const changedIds = Array.from(zUpdates.keys());
      persistNodes(next, changedIds);
      pushZIndexHistory(before, new Map(zUpdates));
      return next;
    });
  }
  // Batched, whole-selection version of handleReorderLayer's single-shape
  // step (that function stays as-is — LayersPanel's per-row buttons still
  // want single-shape stepping). direction -1 = forward/toward front (lower
  // index in a front-first-sorted sibling list), +1 = backward/toward back —
  // matching handleReorderLayer's own existing -1/+1 convention exactly.
  // Within each (parentId, pageId) sibling group, selected items move one
  // step while preserving their relative order: scanning front-to-back for
  // "forward" (so an already-adjacent selected run cascades past the next
  // non-selected item as one block) or back-to-front for "backward".
  function reorderSelection(direction: -1 | 1) {
    const targets = new Set(selectedShapeIds.filter(id => !isLocked(id)));
    if (targets.size === 0) return;
    const groupKeys = new Set(
      shapeNodes.filter(n => targets.has(n.id)).map(n => `${n.parentId ?? ''}::${findPageIdFor(n) ?? ''}`),
    );
    const zUpdates = new Map<string, number>();
    for (const key of groupKeys) {
      const [parentId, pageId] = key.split('::');
      const siblings = shapeNodes
        .filter(n => (n.parentId ?? '') === parentId && (findPageIdFor(n) ?? '') === pageId)
        .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));
      const zVals = siblings.map(n => n.zIndex ?? 0);
      const order = [...siblings];
      if (direction === -1) {
        for (let i = 1; i < order.length; i++) {
          if (targets.has(order[i].id) && !targets.has(order[i - 1].id)) {
            [order[i - 1], order[i]] = [order[i], order[i - 1]];
          }
        }
      } else {
        for (let i = order.length - 2; i >= 0; i--) {
          if (targets.has(order[i].id) && !targets.has(order[i + 1].id)) {
            [order[i], order[i + 1]] = [order[i + 1], order[i]];
          }
        }
      }
      order.forEach((n, i) => {
        if ((n.zIndex ?? 0) !== zVals[i]) zUpdates.set(n.id, zVals[i]);
      });
    }
    if (zUpdates.size === 0) return;
    setShapeNodes(prev => {
      const before = new Map(prev.filter(n => zUpdates.has(n.id)).map(n => [n.id, n.zIndex ?? 0]));
      const next = prev.map(n => zUpdates.has(n.id) ? { ...n, zIndex: zUpdates.get(n.id)! } : n);
      persistNodes(next, Array.from(zUpdates.keys()));
      pushZIndexHistory(before, new Map(zUpdates));
      return next;
    });
  }

  function deleteSelected() {
    onNodesChange(selectedShapeIds.filter(id => !isLocked(id)).map(id => ({ type: 'remove', id })));
  }

  // Real (but bandwidth-free) page-navigator thumbnails: a session-scoped,
  // in-memory-only cache of small raster snapshots, keyed by pageId — never
  // uploaded/persisted anywhere, so this costs no storage or bandwidth.
  // Only the ACTIVE page is ever snapshotted (onlyRenderVisibleElements
  // already keeps exactly that page's nodes mounted, unlike PDF export's
  // "every page" case, which needed to temporarily disable that culling).
  // Pages never visited this session simply keep showing PageNavigatorRail's
  // existing rough SVG approximation.
  const [pageSnapshots, setPageSnapshots] = useState<Map<string, string>>(new Map());
  // Which page ids are mid-(re)generation right now — purely a small corner
  // spinner in PageNavigatorRail, so a stale-looking thumbnail doesn't read
  // as final while a fresher one is on its way.
  const [generatingSnapshotPageIds, setGeneratingSnapshotPageIds] = useState<Set<string>>(new Set());
  // Seeds pageSnapshots from each page's own PERSISTED thumbnailUrl (Storage,
  // survives reload/other sessions) the first time that page is seen, so a
  // page nobody has visited yet this session still shows a real thumbnail
  // instead of the rough SVG fallback — the in-memory snapshot above still
  // takes priority once the active page actually gets (re)rendered.
  useEffect(() => {
    setPageSnapshots(prev => {
      let changed = false;
      const next = new Map(prev);
      for (const page of pages) {
        if (!next.has(page.id) && page.thumbnailUrl) { next.set(page.id, page.thumbnailUrl); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [pages]);
  useEffect(() => {
    if (isPresent || !activePageId) return;
    const dims = pageDimensions.get(activePageId);
    const origin = pageOrigins.get(activePageId);
    if (!dims || origin === undefined) return;
    const timer = setTimeout(() => {
      const scale = Math.min(THUMB_MAX_WIDTH / dims.width, THUMB_MAX_HEIGHT / dims.height);
      setGeneratingSnapshotPageIds(prev => new Set(prev).add(activePageId));
      exportPageAsImage({ x: 0, y: origin, width: dims.width, height: dims.height }, 'png', scale)
        .then(async dataUrl => {
          setPageSnapshots(prev => new Map(prev).set(activePageId, dataUrl));
          const url = await uploadThumbnail(diagramId, dataUrl, 'pageThumbnails');
          await updatePage(diagramId, activePageId, { thumbnailUrl: url, thumbnailUpdatedAt: Date.now() });
        })
        .catch(() => {})
        .finally(() => setGeneratingSnapshotPageIds(prev => { const next = new Set(prev); next.delete(activePageId); return next; }));
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageId, shapeNodes, pageDimensions, pageOrigins, isPresent]);

  // A cover thumbnail can only be freshly rendered for the currently ACTIVE
  // page (onlyRenderVisibleElements keeps only that page's shapes mounted —
  // see the comment above); for any other page this reuses whatever
  // snapshot/persisted thumbnail already exists for it rather than forcing
  // a page switch just to set a cover.
  async function handleSetCoverPage(pageId: string) {
    const existing = pageSnapshots.get(pageId) ?? pages.find(p => p.id === pageId)?.thumbnailUrl;
    const url = existing?.startsWith('data:') ? await uploadThumbnail(diagramId, existing, 'coverThumbnails') : existing;
    await setCoverPage(diagramId, pageId, url);
  }

  async function handleDuplicatePage(pageId: string) {
    const sourcePage = pages.find(p => p.id === pageId);
    if (!sourcePage) return;
    const newPage = await duplicatePage(diagramId, sourcePage, pages);
    fitToPage(newPage.id, { duration: 300 });
  }

  // Clones a REGULAR page as a starting point for a new master page —
  // distinct from handleDuplicatePage, which always stays within the source
  // page's own kind (a master duplicates into another master, a regular
  // page into another regular page). Only offered for non-master pages.
  async function handleCloneIntoMasters(pageId: string) {
    const sourcePage = regularPages.find(p => p.id === pageId);
    if (!sourcePage) return;
    await duplicatePage(diagramId, sourcePage, masterPages, true);
  }

  // Same guard/warning logic as PageSettingsPanel's own delete button
  // (Popconfirm there vs. Modal.confirm here, since this fires from a
  // context-menu click rather than a button that can wrap a Popconfirm) —
  // kept in sync deliberately so deleting a page reads the same regardless
  // of which affordance was used.
  function handleDeletePage(pageId: string) {
    const page = pages.find(p => p.id === pageId);
    if (!page) return;
    if (!page.isMaster && regularPages.length <= 1) return;
    const referencing = page.isMaster ? regularPages.filter(p => p.masterPageId === page.id) : [];
    // Every page after this one (within its own kind's stack — regular vs
    // master) needs its shapes shifted up by this page's height+gap once
    // it's gone, or its content silently stays exactly where it was while
    // its page frame jumps to close the gap — see deletePage's own comment
    // in store.ts for the full "why."
    const ownStack = page.isMaster ? masterPages : regularPages;
    const pageIndex = ownStack.findIndex(p => p.id === pageId);
    const subsequentPageIds = pageIndex >= 0 ? ownStack.slice(pageIndex + 1).map(p => p.id) : [];
    const { height } = getPageDimensions(page.paperSize, page.orientation, page.customWidth, page.customHeight);
    const deltaY = height + PAGE_GAP;
    Modal.confirm({
      title: page.isMaster ? 'Delete this master?' : 'Delete this page?',
      content: page.isMaster && referencing.length > 0
        ? `${referencing.length} page${referencing.length === 1 ? '' : 's'} using this master will lose its shape content, background, header & footer — not just fall back to a default.`
        : undefined,
      okText: 'Delete', okButtonProps: { danger: true },
      onOk: async () => {
        for (const p of referencing) await updatePage(diagramId, p.id, { masterPageId: undefined });
        await deletePage(diagramId, pageId, subsequentPageIds, deltaY);
      },
    });
  }

  // In-memory clipboard (a ref, not the OS Clipboard API — this is a
  // real-time collaborative Firestore-backed canvas with no cross-tab/app
  // paste requirement, and the async permission-gated Clipboard API adds
  // real friction for no benefit over a plain ref).
  const clipboardRef = useRef<{ shapes: DiagramNode[]; edges: DiagramEdge[]; sourcePageId: string } | null>(null);

  // Ids currently mid-resize with Alt held at drag-start (snapshotted once,
  // same philosophy as resizeShiftLock — not re-checked live). Consumed and
  // cleared at the single existing dimensions-commit site in onNodesChange
  // below, since NodeResizer has no live center-anchor hook of its own —
  // the correction has to be a post-hoc fix-up of the final corner-anchored
  // geometry rather than something applied during the drag itself.
  const resizeAltCenterIdsRef = useRef<Set<string>>(new Set());
  function handleResizeAltStart(id: string, altHeld: boolean) {
    if (altHeld) resizeAltCenterIdsRef.current.add(id);
    else resizeAltCenterIdsRef.current.delete(id);
  }

  // Selected shapes/group plus every descendant of a selected group
  // (recursively, so a group-of-groups copies whole), plus any connector
  // whose both endpoints fall inside that set.
  function collectCopySet(): { shapes: Node[]; edges: Edge[] } {
    const ids = new Set<string>(selectedShapeIds);
    if (selectedGroup) ids.add(selectedGroup.id);
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of shapeNodes) {
        if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
          ids.add(n.id);
          grew = true;
        }
      }
    }
    const shapes = shapeNodes.filter(n => ids.has(n.id));
    const edges = connectorEdges.filter(e => ids.has(e.source) && ids.has(e.target));
    return { shapes, edges };
  }

  function handleCopy() {
    const { shapes, edges } = collectCopySet();
    if (shapes.length === 0) return;
    const pageId = findPageIdFor(shapes[0]);
    if (!pageId) return;
    clipboardRef.current = {
      shapes: shapes.map(n => toPersistableShape(n)),
      edges: edges.map(e => ({ ...e })) as DiagramEdge[],
      sourcePageId: pageId,
    };
  }

  function handleCut() {
    const { shapes } = collectCopySet();
    if (shapes.length === 0) return;
    handleCopy();
    onNodesChange(shapes.filter(n => !isLocked(n.id)).map(n => ({ type: 'remove' as const, id: n.id })));
  }

  // Depth-first so a parent is always written (and thus resolvable by
  // React Flow) before any child that references it — mirrors handleGroup's
  // own await-parent-before-children ordering, generalized to any depth.
  function topoSortByParent(list: DiagramNode[]): DiagramNode[] {
    const byId = new Map(list.map(s => [s.id, s] as const));
    const visited = new Set<string>();
    const ordered: DiagramNode[] = [];
    function visit(s: DiagramNode) {
      if (visited.has(s.id)) return;
      visited.add(s.id);
      if (s.parentId && byId.has(s.parentId)) visit(byId.get(s.parentId)!);
      ordered.push(s);
    }
    for (const s of list) visit(s);
    return ordered;
  }

  async function handlePaste() {
    const clip = clipboardRef.current;
    if (!clip || clip.shapes.length === 0) return;
    const destPageId = activePageId ?? clip.sourcePageId;
    const destOrigin = pageOrigins.get(destPageId) ?? 0;
    const srcOrigin = pageOrigins.get(clip.sourcePageId) ?? 0;
    const destDims = pageDimensions.get(destPageId);
    const srcDims = pageDimensions.get(clip.sourcePageId);
    // Pasting onto a different page than the one shapes were copied from,
    // when that destination page is exactly the same format, lands shapes
    // in the exact same spot they were copied from rather than nudging them
    // — matches "paste in place" behavior for a same-size target. Any other
    // case (same page, or a differently-sized page) keeps the small fixed
    // offset so repeated pastes don't stack exactly on top of each other.
    const sameFormatDifferentPage = destPageId !== clip.sourcePageId && !!srcDims && !!destDims
      && srcDims.width === destDims.width && srcDims.height === destDims.height;
    const PASTE_OFFSET = sameFormatDifferentPage ? 0 : 24;
    const dx = PASTE_OFFSET;
    const dy = (destOrigin - srcOrigin) + PASTE_OFFSET;

    const idMap = new Map<string, string>();
    for (const s of clip.shapes) idMap.set(s.id, crypto.randomUUID());

    // Pushes the whole pasted set above everything already on the
    // destination page while preserving their relative stacking order among
    // themselves (same reasoning as nextZIndexForPage — a pasted copy should
    // land on top, not tie with and lose to older shapes on DOM order).
    const zIndexBase = nextZIndexForPage(destPageId);
    const newShapes: DiagramNode[] = clip.shapes.map(s => {
      const newParentId = s.parentId ? idMap.get(s.parentId) : undefined;
      const isTopLevel = !newParentId;
      let position = isTopLevel ? { x: s.position.x + dx, y: s.position.y + dy } : s.position;
      // Clamp only top-level pasted shapes to the destination page immediately —
      // matches drag clamping, and grouped children stay in their parent's
      // already-valid local space. A shape that's actually larger than the
      // destination page on an axis has no valid clamped position on that
      // axis — snapping it to the page origin used to discard the offset
      // entirely, making a large pasted group land exactly on top of the
      // still-visible original (read as "pasted twice"). Leave that axis
      // un-clamped instead of forcing it to the corner.
      if (isTopLevel && destDims) {
        const w = s.width ?? 100, h = s.height ?? 100;
        position = {
          x: w >= destDims.width ? position.x : Math.min(Math.max(position.x, PAGE_X), PAGE_X + destDims.width - w),
          y: h >= destDims.height ? position.y : Math.min(Math.max(position.y, destOrigin), destOrigin + destDims.height - h),
        };
      }
      return {
        ...s,
        id: idMap.get(s.id)!,
        parentId: newParentId,
        extent: newParentId ? ('parent' as const) : undefined,
        position,
        zIndex: (s.zIndex ?? 0) + zIndexBase,
        data: cloneShapeData({ ...s.data, pageId: destPageId }),
      };
    });

    for (const s of topoSortByParent(newShapes)) {
      await saveShape(diagramId, destPageId, s);
    }

    const newEdges: DiagramEdge[] = clip.edges
      .filter(e => idMap.has(e.source) && idMap.has(e.target))
      .map(e => ({ ...e, id: crypto.randomUUID(), source: idMap.get(e.source)!, target: idMap.get(e.target)! }));
    for (const e of newEdges) {
      await saveConnector(diagramId, destPageId, e);
    }

    setShapeNodes(prev => [
      ...prev.map(n => n.selected ? { ...n, selected: false } : n),
      ...newShapes.map(s => ({ ...s, selected: true })),
    ]);
    setConnectorEdges(prev => [...prev, ...newEdges]);

    // Paste/duplicate was another explicitly-out-of-scope gap from when
    // undo/redo was first built — one combined history entry for the whole
    // batch (all pasted shapes + edges), matching the "batch operation, one
    // history entry" convention bringToFront/sendToBack already use.
    pushHistory({
      undo: () => {
        for (const s of newShapes) deleteShape(diagramId, destPageId, s.id);
        for (const e of newEdges) deleteConnector(diagramId, destPageId, e.id);
        setShapeNodes(prev => prev.filter(n => !newShapes.some(s => s.id === n.id)));
        setConnectorEdges(prev => prev.filter(e => !newEdges.some(ne => ne.id === e.id)));
      },
      redo: () => {
        for (const s of topoSortByParent(newShapes)) saveShape(diagramId, destPageId, s);
        for (const e of newEdges) saveConnector(diagramId, destPageId, e);
        setShapeNodes(prev => [
          ...prev.map(n => n.selected ? { ...n, selected: false } : n),
          ...newShapes.map(s => ({ ...s, selected: true })),
        ]);
        setConnectorEdges(prev => [...prev, ...newEdges]);
      },
    });
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (isPresent) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 'c') { e.preventDefault(); handleCopy(); }
      else if (e.key === 'x') { e.preventDefault(); handleCut(); }
      // Ctrl/Cmd+V itself is handled by the native `paste` listener below,
      // not here — that's the only place with access to clipboardData, so
      // an OS-clipboard image can be told apart from the app's own internal
      // shape clipboard before deciding which paste path to run.
      else if (e.key === 'd') { e.preventDefault(); handleCopy(); void handlePaste(); }
      else if (e.key.toLowerCase() === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
      else if (e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      else if (e.key === ']' && e.shiftKey) { e.preventDefault(); bringToFront(); }
      else if (e.key === '[' && e.shiftKey) { e.preventDefault(); sendToBack(); }
      else if (e.key === ']') { e.preventDefault(); reorderSelection(-1); }
      else if (e.key === '[') { e.preventDefault(); reorderSelection(1); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent, selectedShapeIds, selectedGroup, shapeNodes, connectorEdges, activePageId, pageOrigins, pageDimensions, diagramId]);

  // A genuine OS-clipboard paste (e.g. a screenshot copied outside the app)
  // previously did nothing at all — only the app's own internal shape
  // clipboard ever responded to Ctrl+V. Checks for an image first and, if
  // found, reuses the exact same upload pipeline the toolbar's image-upload
  // button already goes through; falls through to the internal shape
  // clipboard when the OS clipboard carries no image.
  // 
  // FIXED: Now checks the app's internal shape clipboard FIRST before checking
  // the OS clipboard. This prevents the bug where copying an image from a browser,
  // then copying a shape with Ctrl+C, then pasting with Ctrl+V would paste the
  // image instead of the shape. The internal clipboard should take priority when
  // it has content.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (isTypingTarget(e.target) || isPresent) return;
      
      // Check app's internal shape clipboard FIRST
      if (clipboardRef.current) {
        e.preventDefault();
        void handlePaste();
        return;
      }
      
      // Fall back to OS clipboard for images
      const items = e.clipboardData?.items;
      const imageItem = items && Array.from(items).find(item => item.type.startsWith('image/'));
      const file = imageItem?.getAsFile();
      if (file) {
        e.preventDefault();
        void handleUploadMedia(file);
        return;
      }
      e.preventDefault();
      void handlePaste();
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent, activePageId, pageOrigins, pageDimensions, diagramId]);

  const [guides, setGuides] = useState<GuideLines | null>(null);
  const [dataPanelOpen, setDataPanelOpen] = useState(false);
  const [validationPanelOpen, setValidationPanelOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // While an export capture is running, force EVERY node to mount regardless
  // of the live camera position — onlyRenderVisibleElements otherwise culls
  // any page's shapes that aren't under the current viewport, which is what
  // made multi-page PDF/PPTX export (and single-page export of a non-active
  // page) silently capture blank pages for everything but the page the user
  // happened to be looking at.
  const [isExporting, setIsExporting] = useState(false);
  const [layersPanelOpen, setLayersPanelOpen] = useState(false);
  const [pageSettingsPanelOpen, setPageSettingsPanelOpen] = useState(false);
  // Shape selection is driven by React Flow's own node-click handling, not
  // the shared selectTool() dispatcher every OTHER right-side panel already
  // mutually excludes itself through — so without this, selecting a page
  // (opening Page Settings) then clicking a shape left BOTH panels open at
  // once, overlapping. Closing Page Settings here (paired with the
  // `!pageSettingsPanelOpen` guard on ShapePropertiesPanel's own render
  // condition) covers the other direction too.
  useEffect(() => {
    if (singleSelectedShape) setPageSettingsPanelOpen(false);
  }, [singleSelectedShape?.id]);
  const [gridRulersPanelOpen, setGridRulersPanelOpen] = useState(false);
  const [tagsPanelOpen, setTagsPanelOpen] = useState(false);

  // Derived, not stored — computed fresh every render from the existing
  // booleans above (cheap, same convention as toolActive itself). Used only
  // by the Toolbar (active-button highlighting) and the tool-settings panel
  // dispatcher; every other existing direct read of penMode/brushMode/etc.
  // throughout this file is untouched.
  const activeToolId: ToolId | null = (() => {
    if (handMode) return 'hand';
    if (directSelectMode) return 'directSelect';
    if (connectMode) return 'connect';
    if (placingComment) return 'comment';
    if (highlightMode) return 'highlight';
    if (placingShapeKind === 'hotspot') return 'hotspot';
    if (placingShapeKind === 'image' || placingShapeKind === 'video') return 'media';
    if (placingShapeKind === 'text') return 'text';
    if (placingShapeKind) return 'shapes';
    if (penMode) return 'pen';
    if (brushMode) return 'brush';
    if (stylePaintMode) return 'stylePaint';
    if (layersPanelOpen) return 'layers';
    if (animationPanelOpen) return 'animation';
    if (dataPanelOpen) return 'data';
    if (validationPanelOpen) return 'validation';
    if (pageSettingsPanelOpen) return 'pageSettings';
    if (gridRulersPanelOpen) return 'gridRulers';
    if (tagsPanelOpen) return 'tags';
    if (shapeGalleryOpen) return 'shapeGallery';
    return null;
  })();

  function handleSelectTool(toolId: ToolId) {
    selectTool(activeToolId === toolId ? 'select' : toolId);
  }

  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  // Snap-to-grid was previously always-on at a fixed 8px — now a user toggle
  // plus a choice of increment. The visible dot grid is drawn at 2x the
  // actual snap increment (matching the old fixed 16px-dots/8px-snap ratio),
  // so it marks every other real snap point rather than every one.
  // These three (plus every other toggleable UX behavior) live in
  // useUxPreferences now instead of their own useState, so they finally
  // persist across reloads — previously they silently reset every time.
  const snapEnabled = uxPrefs.snapToGridEnabled;
  const setSnapEnabled = (v: boolean) => updateUxPrefs({ snapToGridEnabled: v });
  const gridSize = uxPrefs.gridSize;
  const setGridSize = (v: number) => updateUxPrefs({ gridSize: v });
  const showRulers = uxPrefs.showRulers;
  const setShowRulers = (v: boolean) => updateUxPrefs({ showRulers: v });

  // '?' (Shift+/) opens the shortcuts help overlay — no modifier key, so it
  // needs its own listener rather than folding into the Cmd/Ctrl-gated
  // clipboard/undo handler below.
  useEffect(() => {
    if (isPresent) return;
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.key === '?') { e.preventDefault(); setShortcutsHelpOpen(o => !o); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPresent]);


  // Gated on validationPanelOpen so this only ever computes while the panel
  // is actually visible — not a live/reactive validator re-scanning on
  // every edit (see ValidationPanel's own doc comment for why).
  const validationIssues = useMemo(
    () => (validationPanelOpen ? computeValidationIssues(shapeNodes, connectorEdges) : []),
    [validationPanelOpen, shapeNodes, connectorEdges],
  );

  function handleValidationSelect(shapeId: string) {
    handleLayerSelect(shapeId, false);
    const target = shapeNodesRef.current.find(n => n.id === shapeId);
    if (target) {
      const w = target.width ?? target.measured?.width ?? 100;
      const h = target.height ?? target.measured?.height ?? 70;
      setCenter(target.position.x + w / 2, target.position.y + h / 2, { zoom: 1.2, duration: 500 });
    }
  }

  function handleNodeContextMenu(event: React.MouseEvent, node: Node) {
    // Gate BEFORE preventDefault — turning the preference off must restore
    // the native browser menu, not just leave right-click doing nothing.
    if (!uxPrefs.rightClickContextMenuEnabled) return;
    if (isPresent) return;
    if (node.type !== 'shape' && node.type !== 'path' && node.type !== 'group') return;
    event.preventDefault();
    if (!node.selected) handleLayerSelect(node.id, false);
    setContextMenu({ x: event.clientX, y: event.clientY });
  }

  function handleLayerSelect(id: string, additive: boolean) {
    const changes: NodeChange[] = additive
      ? [{ type: 'select', id, selected: true }]
      : [
          ...nodes.filter(n => n.selected && n.id !== id).map(n => ({ type: 'select' as const, id: n.id, selected: false })),
          { type: 'select', id, selected: true },
        ];
    onNodesChange(changes);
  }

  async function handleDetachMasterShape() {
    if (!singleSelectedShape) return;
    const d = singleSelectedShape.data as ShapeNodeData & { __masterPageId?: string; __masterShapeId?: string };
    const childPageId = d.pageId;
    if (!d.__masterPageId || !d.__masterShapeId || !childPageId) return;
    const dy = (pageOrigins.get(childPageId) ?? 0) - (masterOrigins.get(d.__masterPageId) ?? 0);
    const newShapeId = await detachMasterShape(diagramId, childPageId, d.__masterPageId, d.__masterShapeId, { dx: 0, dy });
    // Best-effort continuity — a no-op if this fires before the detached
    // shape's own Firestore snapshot has round-tripped back into `nodes`.
    handleLayerSelect(newShapeId, false);
  }

  // Used to fire its two saveShape writes independently with no local
  // optimistic update at all — the ONLY visual feedback came from waiting
  // on subscribeShapes' async round-trip, so a rebuild triggered between
  // the two writes landing (or arriving out of order) could show no change
  // at all until a later firing (or a reload) caught up, and undo/redo
  // wasn't wired up here the way every other z-index operation has it.
  // Now matches bringToFront/sendToBack's own pattern: optimistic
  // setShapeNodes update, persistNodes' batched (atomic) write, and real
  // undo/redo history.
  function handleReorderLayer(id: string, direction: -1 | 1) {
    const node = shapeNodes.find(n => n.id === id);
    if (!node || isLocked(id)) return;
    const pageId = findPageIdFor(node);
    const siblings = shapeNodes
      .filter(n => n.parentId === node.parentId && findPageIdFor(n) === pageId)
      .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));
    const idx = siblings.findIndex(n => n.id === id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= siblings.length || !pageId) return;
    const a = siblings[idx];
    const b = siblings[swapIdx];
    const az = a.zIndex ?? 0;
    const bz = b.zIndex ?? 0;
    setShapeNodes(prev => {
      const next = prev.map(n => n.id === a.id ? { ...n, zIndex: bz } : n.id === b.id ? { ...n, zIndex: az } : n);
      persistNodes(next, [a.id, b.id]);
      return next;
    });
    pushZIndexHistory(new Map([[a.id, az], [b.id, bz]]), new Map([[a.id, bz], [b.id, az]]));
  }

  function handleIndentLayer(id: string) {
    const node = shapeNodes.find(n => n.id === id);
    if (!node || isLocked(id)) return;
    const pageId = findPageIdFor(node);
    if (!pageId) return;
    const siblings = shapeNodes
      .filter(n => n.parentId === node.parentId && findPageIdFor(n) === pageId)
      .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));
    const idx = siblings.findIndex(n => n.id === id);
    const above = siblings[idx - 1];
    if (!above || above.type !== 'group') return;
    const promoted = toPersistableShape({
      ...node,
      parentId: above.id,
      extent: 'parent' as const,
      position: { x: node.position.x - above.position.x, y: node.position.y - above.position.y },
    });
    saveShape(diagramId, pageId, promoted);
  }

  function handleOutdentLayer(id: string) {
    const node = shapeNodes.find(n => n.id === id);
    if (!node || !node.parentId || isLocked(id)) return;
    const parent = shapeNodes.find(n => n.id === node.parentId);
    if (!parent) return;
    const pageId = findPageIdFor(node);
    if (!pageId) return;
    const grandParentId = parent.parentId;
    const promoted = toPersistableShape({
      ...node,
      parentId: grandParentId,
      extent: grandParentId ? ('parent' as const) : undefined,
      position: { x: node.position.x + parent.position.x, y: node.position.y + parent.position.y },
    });
    saveShape(diagramId, pageId, promoted);
  }

  function getCommittedPosition(id: string): { x: number; y: number } | undefined {
    for (const slice of shapesSlices.current.values()) {
      const existing = slice.get(id);
      if (existing) return existing.position;
    }
    return undefined;
  }

  // Alt/Option-held-at-drag-start duplicates the current selection at its
  // pre-drag position. React Flow's drag machinery is already locked onto
  // the ORIGINAL node ids for the rest of this gesture — there is no
  // supported way to redirect an in-progress drag onto newly-created nodes
  // — so the practical equivalent of "a copy peels off and follows the
  // cursor" is: create the copy here, left behind and unselected, while the
  // original continues to be what actually moves under the pointer for the
  // rest of the drag. The two nodes are pixel-identical at this instant, so
  // this reads identically to the literal gesture even though it's
  // internally the original that keeps moving.
  function onNodeDragStart(event: MouseEvent | TouchEvent, _node: Node, _draggedNodes: Node[]) {
    if (isPresent) return;
    if (!uxPrefs.altDragDuplicateEnabled) return;
    if (!('altKey' in event) || !event.altKey) return;
    const { shapes, edges } = collectCopySet();
    if (shapes.length === 0) return;
    const pageId = findPageIdFor(shapes[0]);
    if (!pageId) return;

    const idMap = new Map<string, string>();
    for (const s of shapes) idMap.set(s.id, crypto.randomUUID());

    const clones: DiagramNode[] = shapes.map(n => {
      const s = toPersistableShape(n);
      const newParentId = s.parentId ? idMap.get(s.parentId) : undefined;
      return {
        ...s,
        id: idMap.get(s.id)!,
        parentId: newParentId,
        extent: newParentId ? ('parent' as const) : undefined,
        data: cloneShapeData({ ...s.data, pageId }),
      };
    });
    const cloneEdges: DiagramEdge[] = edges
      .filter(e => idMap.has(e.source!) && idMap.has(e.target!))
      .map(e => ({ ...e, id: crypto.randomUUID(), source: idMap.get(e.source!)!, target: idMap.get(e.target!)! })) as DiagramEdge[];

    const ordered = topoSortByParent(clones);
    setShapeNodes(prev => [...prev, ...ordered.map(s => ({ ...s, selected: false }))]);
    setConnectorEdges(prev => [...prev, ...cloneEdges]);
    for (const s of ordered) saveShape(diagramId, pageId, s);
    for (const e of cloneEdges) saveConnector(diagramId, pageId, e);

    pushHistory({
      undo: () => {
        for (const s of clones) deleteShape(diagramId, pageId, s.id);
        for (const e of cloneEdges) deleteConnector(diagramId, pageId, e.id);
        setShapeNodes(prev => prev.filter(n => !clones.some(s => s.id === n.id)));
        setConnectorEdges(prev => prev.filter(e => !cloneEdges.some(ce => ce.id === e.id)));
      },
      redo: () => {
        for (const s of topoSortByParent(clones)) saveShape(diagramId, pageId, s);
        for (const e of cloneEdges) saveConnector(diagramId, pageId, e);
        setShapeNodes(prev => [...prev, ...clones]);
        setConnectorEdges(prev => [...prev, ...cloneEdges]);
      },
    });
  }

  function onNodeDrag(_event: MouseEvent | TouchEvent, node: Node) {
    if (node.type !== 'shape') return;
    // Guide computation/setGuides now lives entirely in clampDragChanges
    // (called from onNodesChange for this same drag tick) — consolidated
    // there so the rendered guide lines always match exactly what smart
    // guide snapping actually snapped to, with no separate, potentially
    // one-frame-stale computation running here too.
    const committed = getCommittedPosition(node.id);
    if (committed) {
      updateDragPreview({ shapeIds: [node.id], dx: node.position.x - committed.x, dy: node.position.y - committed.y });
    }
  }
  function onNodeDragStop(_event: MouseEvent | TouchEvent, _node: Node, draggedNodes: Node[]) {
    setGuides(null);
    updateDragPreview(null);
    // React Flow's own adoptUserNodes resets a node's internal handleBounds
    // (and measured width/height) to undefined whenever it receives a new
    // object reference for that node — which every position update
    // produces (ours, via applyNodeChanges' own immutable spread), since
    // this app never sets `measured`/`handles` on its own node objects (it
    // renders real `<Handle>` components instead of RF's declarative
    // `node.handles` config — see ConnectionHandles.tsx — and
    // parseHandles() only preserves the PREVIOUS handleBounds when
    // `userNode.measured` is already truthy, which ours never is). Normally
    // something repopulates that reset almost immediately, but it doesn't
    // reliably happen for every node after a MULTI-node drag — leaving
    // those nodes permanently "not initialized" from RF's own perspective,
    // which makes getEdgePosition (and thus every connector touching them)
    // return null forever, until a full reload re-mounts everything from
    // scratch. Confirmed live: calling updateNodeInternals synchronously
    // here does NOT fix it — this callback fires BEFORE React commits the
    // position update that triggers adoptUserNodes' own reset, so the
    // immediate call gets stomped by that reset happening right after it.
    // Deferring to the next tick (after the reset has already run) is what
    // actually lets it stick — this is React Flow's own documented pattern
    // for apps with custom Handle-based nodes needing a forced re-measure.
    // A single deferred call raced adoptUserNodes' own reset unreliably in
    // testing — 50ms was enough most of the time but not always, and a
    // same-tick (0ms) call never was. Rather than tune a fragile magic
    // number, call it a few times across a spread of delays: each call is
    // harmless/idempotent (a node that's already correctly measured just
    // gets re-measured to the same values), so the only cost of "extra"
    // calls is negligible, while missing the one call that lands after the
    // reset has actually happened means this connector's edges silently
    // vanish until a full reload.
    // Use scheduleUpdateNodeInternals instead of plain setTimeout so these
    // timeouts get cancelled if rebuildShapes() is called (e.g., from the
    // Firestore echo). Without this, stale timeouts from onNodeDragStop
    // would fire after newer rebuilds have created new node references,
    // causing brief misplacement of nodes during group moves.
    const ids = draggedNodes.map(n => n.id);
    scheduleUpdateNodeInternals(ids);
  }

  function handlePaneMouseMove(e: React.MouseEvent) {
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    updateCursor(flowPos.x, flowPos.y);
    handlePenMouseMoveCapture(e);
    handleConnectMouseMoveCapture(e);
    if (placingShapeKind) setStampScreenPos({ x: e.clientX, y: e.clientY });
  }
  function handleWrapperMouseDown(e: React.MouseEvent) {
    handlePenMouseDown(e);
    handleShapePlaceMouseDown(e);
    handleMarqueeMouseDown(e);
    handleCommentPlaceMouseDown(e);
    handleBrushMouseDown(e);
  }
  function handleWrapperMouseUp(e: React.MouseEvent) {
    handlePenMouseUp(e);
    handleConnectMouseUp(e);
  }

  return (
    <div
      ref={wrapperRef}
      style={{
        width: '100%', height: '100%', position: 'relative',
        // Distinct cursor per mode: crosshair for drawing/connecting tools,
        // none while a shape is armed (ShapeStampCursor replaces the native
        // pointer with a preview of what's about to be placed), and an
        // explicit 'default' otherwise rather than leaving it unset.
        cursor: placingShapeKind ? 'none' : penMode || connectMode ? 'crosshair' : 'default',
      }}
      onMouseMove={handlePaneMouseMove}
      onMouseDown={handleWrapperMouseDown}
      onMouseUp={handleWrapperMouseUp}
    >
      {(dissolveActive || screenFlash) && (
        <style>{'@keyframes sd-dissolve { 0% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: 0; } }'}</style>
      )}
      {dissolveActive && (
        <div style={{
          position: 'absolute', inset: 0, background: '#fff', zIndex: 50,
          pointerEvents: 'none', animation: 'sd-dissolve 0.5s ease',
        }} />
      )}
      {screenFlash && (
        <div style={{
          position: 'absolute', left: screenFlash.x, top: screenFlash.y, width: screenFlash.width, height: screenFlash.height,
          borderRadius: screenFlash.radius, background: '#fff', zIndex: 16,
          pointerEvents: 'none', animation: 'sd-dissolve 0.5s ease',
        }} />
      )}
      {/*
        The canvas stays a full-window React Flow instance at all times —
        resizing its actual container to the frame's screen rect on page
        change raced React Flow's own resize-observer re-measurement, so
        setCenter would occasionally center against a stale, differently-
        sized container. Instead PresentationFrame masks everything outside
        the screen rect with opaque panels matching the ambient background,
        so other pages stacked in flow-space are hidden, not resized around.
      */}
      <div
        style={{ width: '100%', height: '100%', cursor: (isSpaceDown || handMode) ? (isSpaceDragging ? 'grabbing' : 'grab') : undefined }}
        onMouseDown={() => { if (isSpaceDown || handMode) setIsSpaceDragging(true); }}
        onMouseUp={() => setIsSpaceDragging(false)}
      >
        <ArrowMarkerDefs />
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onInit={() => setFlowReady(true)}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          edgesReconnectable={!isPresent}
          onReconnect={onReconnect}
          onNodeClick={handleNodeClick}
          onNodeContextMenu={handleNodeContextMenu}
          onPaneClick={() => setHighlighted(null)}
          onNodeDragStart={isPresent ? undefined : onNodeDragStart}
          onNodeDrag={isPresent ? undefined : onNodeDrag}
          onNodeDragStop={isPresent ? undefined : onNodeDragStop}
          connectionMode={ConnectionMode.Loose}
          onlyRenderVisibleElements={!isExporting}
          minZoom={0.1}
          maxZoom={2}
          // React Flow's own default (true) invisibly boosts every SELECTED
          // node's rendered z-index by a large fixed offset, on top of
          // whatever its own zIndex prop says — harmless for apps with no
          // z-order model of their own, but this one has a full explicit
          // layering system (zIndex field, Layers panel, bring-to-front/
          // send-to-back). With the default left on, "send to back" (or
          // "move backward" in the Layers panel) on a shape that STAYS
          // selected afterward — the normal state right after clicking a
          // toolbar button targeting it — correctly updated the shape's
          // real zIndex, but the shape kept rendering on top regardless,
          // because RF's own automatic elevation overrode it. It only
          // "worked" once the shape was deselected some other way, which
          // is exactly the reported "inconsistent, sometimes needs a
          // refresh" behavior — deselecting doesn't refetch anything, but
          // it does stop RF from overriding the (already-correct) real
          // zIndex, so the shape visibly snaps to where it already was.
          elevateNodesOnSelect={false}
          elevateEdgesOnSelect={false}
          // Disables RF's own per-node tabIndex/keyboard-a11y layer (Space
          // toggling node selection, Arrow keys nudging the selected node) —
          // it was silently fighting the Space-drag-pan and new WASD/arrow
          // canvas-pan handlers below, and this app has no other keyboard-nav
          // affordances built around node focus.
          disableKeyboardA11y={!isPresent}
          snapToGrid={!isPresent && snapEnabled}
          snapGrid={[gridSize, gridSize]}
          // Presenting is a slide deck, not a Miro board — no free panning or
          // zooming. The camera moves only programmatically (step/page nav,
          // hyperlink/hotspot jumps), never by the viewer dragging or scrolling.
          //
          // Plain left-drag under the Select tool (the default, nothing else
          // active) marquee-selects — matching Affinity/Illustrator/Figma's
          // own convention. An earlier pass made left-drag pan by default
          // instead, on the theory that panning needed to be reachable
          // without a modifier — reverted per direct feedback: making the
          // Select tool itself act like a hand tool broke plain click-drag
          // multi-select outright, which is a more common gesture than
          // reaching for a Hand tool/Space just to pan a little. Panning
          // without Space now needs either the dedicated Hand tool
          // (handMode, its own toolbar button) or middle/right-click-drag,
          // which stays available in every mode alike — including Select
          // and any drawing tool — same as before.
          // Every branch spells out an explicit button array rather than
          // `true` — @xyflow/system's own button filter for `panOnDrag ===
          // true` (as opposed to an array) only allows buttons 0/1, silently
          // dropping right-click-drag panning; confirmed live via
          // Playwright after `true` here broke right-click pan.
          panOnDrag={isPresent ? false : (isSpaceDown || handMode) ? [0, 1, 2] : [1, 2]}
          zoomOnScroll={!isPresent}
          zoomOnPinch={!isPresent}
          // Explicitly disabled — camera zoom/pan should only ever change from
          // the user's own explicit action (scroll/pinch/drag, or the various
          // programmatic setCenter calls in this file), never as a side
          // effect of double-clicking a shape to rename it.
          zoomOnDoubleClick={false}
          // True whenever the Select tool is the active one (not some other
          // tool, not Hand mode, not Space-held) — this is what makes a
          // plain drag over the true empty pane background (outside any
          // page) marquee-select by default, matching handleMarqueeMouseDown
          // below's own gating for drags starting on a page's own
          // background instead (a page frame is a real node spanning the
          // whole page, not "the pane" by RF's own definition, so it needs
          // its own hand-rolled equivalent — see that function's comment).
          selectionOnDrag={!isPresent && !toolActive && !isSpaceDown}
          // No held key needed to REACH the marquee anymore (selectionOnDrag
          // above already covers a plain drag) — explicitly null rather
          // than left at RF's own default ('Shift') specifically so holding
          // Shift never suppresses panOnDrag via RF's internal
          // `!selectionKeyPressed && panOnDrag` composition, which would
          // otherwise block a Shift-held middle/right-click-drag pan for no
          // reason. Additive marquee/click selection is Shift (among
          // others) via multiSelectionKeyCode below instead — a distinct
          // RF mechanism from this one.
          selectionKeyCode={null}
          // Users reach for either modifier to add a shape to the current
          // selection — RF's own default only recognizes Meta/Control (never
          // Shift), so Shift-click silently replaced the selection instead
          // of extending it.
          multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
          selectNodesOnDrag={false}
          nodesDraggable={!isPresent && !toolActive && !isSpaceDown}
          nodesConnectable={!isPresent && !toolActive && !isSpaceDown}
          // Dropped `&& !toolActive` here (unlike the two props above) so
          // EDGES stay globally selectable even while a tool like the
          // connector/pen tool is active — clicking an existing connector to
          // select it should still work during connect-mode, only clicking a
          // SHAPE is meant to draw/connect instead of select (see the
          // per-node `selectable` override on shape nodes above). Also gated
          // on isSpaceDown, matching nodesDraggable/nodesConnectable, so
          // holding Space to grab-pan doesn't leave shapes selectable/
          // connectable mid-pan.
          elementsSelectable={!isPresent && !isSpaceDown}
          // Suppressed while Direct Selection is active — Delete/Backspace
          // means "delete the focused anchor point" there (a dedicated
          // keydown effect above), not "delete the whole path"; letting both
          // stay bound to the same key would double-fire on one press.
          deleteKeyCode={isPresent || directSelectMode ? [] : ['Backspace', 'Delete']}
          proOptions={{ hideAttribution: true }}
          style={isPresent ? { background: 'transparent' } : undefined}
        >
          {!isPresent && <Background color="#d8dbe6" gap={gridSize * 2} />}
          {!isPresent && <Controls showInteractive={false} />}
          <AlignmentGuidesOverlay guides={guides} />
          <RemoteCursorsLayer peers={peers} shapeNodes={shapeNodes} />
          <PenDrawingOverlay anchors={draftAnchors} dragPreview={penDrag} />
          {brushDraft && <BrushDrawingOverlay points={brushDraft} />}
          <ConnectorDrawingOverlay drag={connectDrag} />
          {editingPathId && (() => {
            const editNode = shapeNodesRef.current.find(n => n.id === editingPathId);
            const rect = getAbsoluteRect(editingPathId);
            if (!editNode || !rect) return null;
            const editData = editNode.data as ShapeNodeData;
            const { width: vbW, height: vbH } = computePathViewBox(editData.pathAnchors ?? []);
            return (
              <AnchorEditOverlay
                anchors={editData.pathAnchors ?? []}
                closed={!!editData.pathClosed}
                rect={rect}
                vbW={vbW}
                vbH={vbH}
                rotationDeg={editData.rotation ?? 0}
                activeAnchorIndex={activeAnchorIndex}
                interactive={directSelectMode}
                onMarkerMouseDown={handleAnchorMarkerMouseDown}
                onMarkerDoubleClick={(index) => handleToggleAnchorSmooth(index)}
                onSegmentMouseDown={(segmentIndex, t) => handleInsertAnchor(segmentIndex, t)}
              />
            );
          })()}
        </ReactFlow>
      </div>
      {isPresent && <PresentationFrame layout={presentLayout} windowSize={windowSize} />}

      {isPresent && (
        <div style={{
          position: 'absolute', top: 16, left: 16, right: 16, zIndex: 20,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <Tooltip title="Exit presentation (Esc)">
              <Button shape="circle" icon={<IconExit />} onClick={onExitPresent} />
            </Tooltip>
            <Tooltip title={osFullscreen ? 'Exit full screen' : 'Full screen — hide the browser window chrome, like PowerPoint presentation mode'}>
              <Button
                shape="circle" type={osFullscreen ? 'primary' : 'default'}
                icon={osFullscreen ? <IconFullscreenExit /> : <IconFullscreenEnter />}
                onClick={toggleOsFullscreen}
              />
            </Tooltip>
            <Tooltip title={fullscreenOverride ? 'Restore frame' : 'Fill screen (skip the device frame for this page — great for a landscape desktop/deck page)'}>
              <Button
                shape="circle" type={fullscreenOverride ? 'primary' : 'default'}
                icon={<IconFillScreen />}
                onClick={() => setFullscreenOverride(v => !v)}
              />
            </Tooltip>
            <Popover
              open={presentSettingsOpen}
              onOpenChange={setPresentSettingsOpen}
              trigger="click"
              placement="bottomLeft"
              content={
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 220 }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Frame</div>
                    <Select
                      size="small" style={{ width: '100%' }}
                      value={effectivePresentationSettings.frameMode}
                      options={[
                        { value: 'auto', label: 'Auto (device frame by page size)' },
                        { value: 'none', label: 'None (always fill screen)' },
                      ]}
                      onChange={v => onUpdatePresentationSettings?.({ frameMode: v })}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: '#888' }}>Rounded corners</span>
                    <Switch
                      size="small"
                      checked={effectivePresentationSettings.roundedCorners}
                      onChange={v => onUpdatePresentationSettings?.({ roundedCorners: v })}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: '#888' }}>Frame color</span>
                    <ColorPicker
                      size="small"
                      value={effectivePresentationSettings.frameColor}
                      onChangeComplete={c => onUpdatePresentationSettings?.({ frameColor: c.toHexString() })}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Page transition</div>
                    <Select
                      size="small" style={{ width: '100%' }}
                      value={effectivePresentationSettings.pageTransition ?? 'none'}
                      options={[
                        { value: 'none', label: 'None (pan)' },
                        { value: 'fade', label: 'Fade' },
                      ]}
                      onChange={v => onUpdatePresentationSettings?.({ pageTransition: v })}
                    />
                  </div>
                </div>
              }
            >
              <Tooltip title="Presentation frame settings">
                <Button shape="circle" icon={<IconSettingsGear />} type={presentSettingsOpen ? 'primary' : 'default'} />
              </Tooltip>
            </Popover>
          </div>
          <div style={{
            background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 20, padding: '4px 14px', fontSize: 12,
          }}>
            {presentPage?.name} · {presentPageIndex + 1} / {pages.length}
            {presentSequence.length > 0 && <> · step {presentStep + 1} / {presentSequence.length}</>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Tooltip title="Back (←)">
              <Button
                shape="circle" icon={<IconChevronLeft />}
                onClick={() => {
                  if (presentStep > -1) setPresentStep(s => s - 1);
                  else if (presentPageIndex > 0) setPresentPageIndex(i => i - 1);
                }}
              />
            </Tooltip>
            <Tooltip title="Next (→ / Space)">
              <Button
                shape="circle" type="primary" icon={<IconChevronRight />}
                onClick={() => {
                  if (presentStep < presentSequence.length - 1) setPresentStep(s => s + 1);
                  else if (presentPageIndex < pages.length - 1) setPresentPageIndex(i => i + 1);
                }}
              />
            </Tooltip>
          </div>
        </div>
      )}

      {/* A commenter has no full Toolbar (hidden along with every other
          isPresent-gated bit of editing chrome) — this is their only way to
          invoke the same click-to-place-a-pin flow the full toolbar's own
          Comment button already drives via selectTool. */}
      {mode === 'comment' && (
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 20 }}>
          <Tooltip title="Add a comment — click the canvas to drop a pin">
            <Button
              type={placingComment ? 'primary' : 'default'}
              icon={<IconComment />}
              onClick={() => selectTool('comment')}
            >
              Comment
            </Button>
          </Tooltip>
        </div>
      )}

      {!isPresent && toolbarSlot && createPortal(
        <Toolbar
          onUndo={undo}
          onRedo={redo}
          activeTool={activeToolId}
          onSelectTool={handleSelectTool}
          directSelectDisabled={!editingPathId && !directSelectMode}
          onStartPlacingHotspot={() => beginPlacingShape('hotspot')}
          onStartPlacingText={() => beginPlacingShape('text')}
          onUploadMedia={handleUploadMedia}
          onInsertContainer={handleInsertContainer}
          onOpenExport={() => setExportOpen(true)}
          onOpenShortcuts={() => setShortcutsHelpOpen(true)}
          onOpenPreferences={() => setPreferencesOpen(true)}
        />,
        toolbarSlot,
      )}
      {!isPresent && (
        <ToolSettingsPanel
          activeToolId={activeToolId}
          hasSingleSelectedShape={!!singleSelectedShape}
          onClose={() => selectTool('select')}
          penDefaults={toolDefaults.pen}
          onPenChange={updatePenDefaults}
          brushDefaults={toolDefaults.brush}
          onBrushChange={updateBrushDefaults}
          connectDefaults={toolDefaults.connector}
          onConnectChange={updateConnectorDefaults}
          stylePaintSource={stylePaintSource}
          onStylePaintClear={() => setStylePaintSource(null)}
          shapeGalleryOpen={shapeGalleryOpen}
          onSelectShape={(kind, extraData) => beginPlacingShape(kind, extraData, { keepGalleryOpen: true })}
          isFavoriteShape={isFavorite}
          favoritesFull={favorites.length >= MAX_FAVORITE_SHAPES}
          onToggleFavoriteShape={toggleFavorite}
          snapEnabled={snapEnabled}
          onToggleSnap={setSnapEnabled}
          gridSize={gridSize}
          onGridSizeChange={setGridSize}
          showRulers={showRulers}
          onToggleRulers={setShowRulers}
          allTags={allTags}
          hiddenTags={hiddenTags}
          onToggleTagVisibility={toggleTagVisibility}
        />
      )}
      {!isPresent && (
        <FavoriteShapesPanel favorites={favorites} activeKind={placingShapeKind} onPlace={beginPlacingShape} />
      )}
      {!isPresent && (
        <ShapeStampCursor kind={placingShapeKind} imageUrl={pendingMediaPlacement?.kind === 'image' ? pendingMediaPlacement.url : undefined} iconName={pendingShapeExtraData?.iconName} pos={stampScreenPos} />
      )}
      {marqueeRect && (
        <div
          style={{
            position: 'fixed', left: marqueeRect.x, top: marqueeRect.y,
            width: marqueeRect.width, height: marqueeRect.height,
            border: '1px solid #1677ff', background: 'rgba(22, 119, 255, 0.08)',
            pointerEvents: 'none', zIndex: 1000,
          }}
        />
      )}
      {!isPresent && layersPanelOpen && !singleSelectedShape && (
        <LayersPanel
          shapeNodes={shapeNodes}
          activePageId={activePageId}
          selectedIds={new Set(nodes.filter(n => n.selected).map(n => n.id))}
          onSelect={handleLayerSelect}
          onRename={(id, label) => onCommit(id, { label })}
          onToggleHidden={id => { const n = shapeNodes.find(s => s.id === id); onCommit(id, { hidden: !(n?.data as ShapeNodeData | undefined)?.hidden }); }}
          onToggleLocked={id => { const n = shapeNodes.find(s => s.id === id); onCommit(id, { locked: !(n?.data as ShapeNodeData | undefined)?.locked }); }}
          onReorder={handleReorderLayer}
          onIndent={handleIndentLayer}
          onOutdent={handleOutdentLayer}
          onClose={() => setLayersPanelOpen(false)}
        />
      )}
      {!isPresent && viewMode === 'masters' && (
        <div style={{
          position: 'absolute', top: 0, left: 168, right: 0, height: 32, zIndex: 15,
          background: '#fff7e6', borderBottom: '1px solid #ffd591',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 600, color: '#874d00', pointerEvents: 'none',
        }}>
          Editing Master Pages
        </div>
      )}
      {!isPresent && (
        <PageNavigatorRail
          pages={pages} pageOrigins={pageOrigins} pageDimensions={pageDimensions}
          shapeNodes={shapeNodes}
          pageSnapshots={pageSnapshots}
          generatingSnapshotPageIds={generatingSnapshotPageIds}
          onSelectPage={pageId => fitToPage(pageId, { duration: 300 })}
          onInsertPageAt={afterOrder => (viewMode === 'masters' ? onInsertMasterAt : onInsertPageAt)?.(afterOrder)}
          onReorderPages={handleReorderPagesWithShapes}
          onOpenPageSettings={() => selectTool('pageSettings')}
          onDuplicatePage={handleDuplicatePage}
          onCloneIntoMasters={viewMode === 'masters' ? undefined : handleCloneIntoMasters}
          onSetCoverPage={handleSetCoverPage}
          onDeletePage={handleDeletePage}
          isMastersMode={viewMode === 'masters'}
        />
      )}
      {!isPresent && pageSettingsPanelOpen && activePageId && (() => {
        const activePage = pages.find(p => p.id === activePageId);
        if (!activePage) return null;
        return (
          <PageSettingsPanel
            // Every field here (name, paperSize, masterPageId, margins,
            // header/footer, ...) is seeded via useState ONCE at mount and
            // never resynced from props afterward (see its own commit()).
            // Without this key, switching the represented page while the
            // panel stays open (e.g. clicking a different thumbnail right
            // after an action like duplicate/insert, before activePageId's
            // own scroll-driven update lands) kept the PREVIOUS page's
            // stale field values mounted under the NEW page's identity —
            // clicking Save then silently overwrote the new page's real
            // name/master/margins with the old page's. Keying by page id
            // forces a full remount on every page switch, so the panel's
            // fields are always freshly seeded from the page it currently
            // represents.
            key={activePage.id}
            diagramId={diagramId}
            page={activePage}
            pages={regularPages}
            masterPages={masterPages}
            pageOrigin={pageOrigins.get(activePageId) ?? 0}
            pageShapes={shapeNodes.filter(n => (n.data as ShapeNodeData).pageId === activePageId)}
            onResizePageContent={handleResizePageContent}
            onClose={() => setPageSettingsPanelOpen(false)}
            onCreateMasterForFormat={onCreateMasterForFormat}
          />
        );
      })()}
      {!isPresent && showRulers && <RulerOverlay railWidth={168} />}


      {!isPresent && (
        <ShortcutsHelpModal open={shortcutsHelpOpen} onClose={() => setShortcutsHelpOpen(false)} />
      )}

      {!isPresent && (
        <UxPreferencesDrawer
          open={preferencesOpen}
          prefs={uxPrefs}
          onChange={updateUxPrefs}
          onClose={() => setPreferencesOpen(false)}
        />
      )}

      {!isPresent && (
        <ExportModal
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          docName={diagramName}
          pages={pages}
          pageOrigins={pageOrigins}
          pageDimensions={pageDimensions}
          shapeNodes={shapeNodes}
          connectorEdges={connectorEdges}
          onExportingChange={setIsExporting}
        />
      )}

      {uploadProgress && (
        <div style={{
          position: 'absolute', bottom: 16, right: 16, zIndex: 30, background: '#fff',
          border: '1px solid #e6e8ef', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          padding: '10px 14px', width: 220,
        }}>
          <div style={{ fontSize: 12, color: '#555', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Uploading {uploadProgress.fileName}…
          </div>
          <Progress percent={Math.round(uploadProgress.percent)} size="small" />
        </div>
      )}

      {!isPresent && (singleSelectedShape || bulkSelectedShapes.length > 1) && !gridRulersPanelOpen && !tagsPanelOpen && !pageSettingsPanelOpen && (() => {
        const referenceNode = singleSelectedShape ?? bulkSelectedShapes[0];
        return (
          <ShapePropertiesPanel
            node={referenceNode}
            bulkCount={bulkSelectedShapes.length > 1 ? bulkSelectedShapes.length : undefined}
            diagramId={diagramId}
            pages={pages}
            allShapes={shapeNodes}
            variables={variables}
            connectorEdges={connectorEdges}
            onChange={patch => {
              if (bulkSelectedShapes.length > 1) { for (const n of bulkSelectedShapes) onCommit(n.id, patch); }
              else onCommit(referenceNode.id, patch);
            }}
            onResize={(w, h) => handleResizeShape(referenceNode.id, w, h)}
            onMove={(x, y) => handleMoveShape(referenceNode.id, x, y)}
            pageOrigin={pageOrigins.get(findPageIdFor(referenceNode) ?? '') ?? 0}
            onDeleteEdge={id => onEdgesChange([{ type: 'remove', id }])}
            onClose={deselectAll}
            onDetachFromMaster={handleDetachMasterShape}
          />
        );
      })()}

      {dataPanelOpen && !singleSelectedShape && (
        <DataPanel
          variables={variables}
          onUpsert={v => upsertVariable(diagramId, v)}
          onDelete={id => deleteVariable(diagramId, id)}
          onClose={() => setDataPanelOpen(false)}
        />
      )}

      {validationPanelOpen && !singleSelectedShape && (
        <ValidationPanel
          issues={validationIssues}
          onSelectIssue={handleValidationSelect}
          onClose={() => setValidationPanelOpen(false)}
        />
      )}

      {commentsEnabled && (draftComment || activeCommentId) && (
        <CommentThreadPanel
          comment={activeCommentId ? findComment(activeCommentId) ?? null : null}
          draft={draftComment}
          currentUserId={user?.uid ?? ''}
          currentUserSeed={user?.email ?? user?.uid ?? ''}
          members={members}
          onPost={handlePostComment}
          onReply={handleReplyToComment}
          onEditComment={handleEditActiveComment}
          onEditReply={handleEditActiveReply}
          onDeleteReply={handleDeleteActiveReply}
          onToggleReaction={handleToggleReaction}
          onToggleResolved={handleToggleActiveResolved}
          onDeleteThread={handleDeleteActiveThread}
          onClose={() => { setDraftComment(null); setActiveCommentId(null); }}
        />
      )}

      {animationPanelOpen && !singleSelectedShape && (
        <AnimationPanel
          items={sequenceItems}
          step={revealStep}
          onStepChange={setRevealStep}
          onToggleSequenced={handleToggleSequenced}
          onReorder={handleReorderSequence}
          onChangeAnimation={handleChangeAnimation}
          onClose={() => { setAnimationPanelOpen(false); setRevealStep(-1); }}
        />
      )}

      {selectedShapeIds.length > 0 && !editingShapeId && !(singleSelectedShape?.data as { __inheritedFromMaster?: boolean } | undefined)?.__inheritedFromMaster && (
        <div style={{
          position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
          background: '#fff', borderRadius: 8, padding: 6, display: 'flex', alignItems: 'center', gap: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        }}>
          {selectedShapeIds.length >= 2 && (
            <>
              <Tooltip title="Align left"><Button size="small" icon={<IconAlignLeft />} onClick={() => alignSelected('left')} /></Tooltip>
              <Tooltip title="Align center"><Button size="small" icon={<IconAlignCenter />} onClick={() => alignSelected('hcenter')} /></Tooltip>
              <Tooltip title="Align right"><Button size="small" icon={<IconAlignRight />} onClick={() => alignSelected('right')} /></Tooltip>
              <Tooltip title="Align top"><Button size="small" icon={<IconAlignTop />} onClick={() => alignSelected('top')} /></Tooltip>
              <Tooltip title="Align middle"><Button size="small" icon={<IconAlignMiddle />} onClick={() => alignSelected('vcenter')} /></Tooltip>
              <Tooltip title="Align bottom"><Button size="small" icon={<IconAlignBottom />} onClick={() => alignSelected('bottom')} /></Tooltip>
            </>
          )}
          {selectedShapeIds.length >= 3 && (
            <>
              <Tooltip title="Distribute horizontal spacing (equal gaps)"><Button size="small" icon={<IconDistributeH />} onClick={() => distributeSelected('horizontal', 'spacing')} /></Tooltip>
              <Tooltip title="Distribute vertical spacing (equal gaps)"><Button size="small" icon={<IconDistributeV />} onClick={() => distributeSelected('vertical', 'spacing')} /></Tooltip>
              <Tooltip title="Distribute horizontal centers (equal center spacing)"><Button size="small" icon={<IconDistributeH />} style={{ opacity: 0.75 }} onClick={() => distributeSelected('horizontal', 'centers')} /></Tooltip>
              <Tooltip title="Distribute vertical centers (equal center spacing)"><Button size="small" icon={<IconDistributeV />} style={{ opacity: 0.75 }} onClick={() => distributeSelected('vertical', 'centers')} /></Tooltip>
            </>
          )}
          {canBooleanOp && (
            <>
              <div style={{ width: 1, alignSelf: 'stretch', background: '#e6e8ef', margin: '0 2px' }} />
              <Tooltip title="Union"><Button size="small" icon={<IconBooleanUnion />} onClick={() => applyBooleanOpToSelection('unite')} /></Tooltip>
              <Tooltip title="Subtract"><Button size="small" icon={<IconBooleanSubtract />} onClick={() => applyBooleanOpToSelection('subtract')} /></Tooltip>
              <Tooltip title="Intersect"><Button size="small" icon={<IconBooleanIntersect />} onClick={() => applyBooleanOpToSelection('intersect')} /></Tooltip>
              <Tooltip title="Exclude"><Button size="small" icon={<IconBooleanExclude />} onClick={() => applyBooleanOpToSelection('exclude')} /></Tooltip>
            </>
          )}
          {singleSelectedShape?.data.kind === 'table' && (
            <>
              <div style={{ width: 1, alignSelf: 'stretch', background: '#e6e8ef', margin: '0 2px' }} />
              <Tooltip title="Add row"><Button size="small" icon={<IconAddRow />} onClick={() => addTableRow(singleSelectedShape.id)} /></Tooltip>
              <Tooltip title="Remove row"><Button size="small" icon={<IconRemoveRow />} onClick={() => removeTableRow(singleSelectedShape.id)} /></Tooltip>
              <Tooltip title="Add column"><Button size="small" icon={<IconAddColumn />} onClick={() => addTableColumn(singleSelectedShape.id)} /></Tooltip>
              <Tooltip title="Remove column"><Button size="small" icon={<IconRemoveColumn />} onClick={() => removeTableColumn(singleSelectedShape.id)} /></Tooltip>
            </>
          )}
          {selectedShapeIds.length >= 2 && <div style={{ width: 1, alignSelf: 'stretch', background: '#e6e8ef', margin: '0 2px' }} />}
          {selectedShapeIds.length >= 2 && (
            <Tooltip title="Group (organize only — no fill or border)"><Button size="small" icon={<IconGroup />} onClick={handleGroup} /></Tooltip>
          )}
          <Tooltip title={selectedShapeIds.length >= 2 ? 'Wrap in container (a styleable frame — background, border theme, swimlane)' : 'Insert container (a styleable frame — background, border theme, swimlane)'}>
            <Button size="small" icon={<IconContainer />} onClick={handleInsertContainer} />
          </Tooltip>
          <Tooltip title="Bring to front (Cmd/Ctrl+Shift+])"><Button size="small" icon={<IconBringToFront />} onClick={bringToFront} /></Tooltip>
          <Tooltip title="Bring forward (Cmd/Ctrl+])"><Button size="small" icon={<IconMoveUp />} onClick={() => reorderSelection(-1)} /></Tooltip>
          <Tooltip title="Send backward (Cmd/Ctrl+[)"><Button size="small" icon={<IconMoveDown />} onClick={() => reorderSelection(1)} /></Tooltip>
          <Tooltip title="Send to back (Cmd/Ctrl+Shift+[)"><Button size="small" icon={<IconSendToBack />} onClick={sendToBack} /></Tooltip>
          <Tooltip title="Duplicate"><Button size="small" icon={<IconDuplicate />} onClick={() => { handleCopy(); void handlePaste(); }} /></Tooltip>
          <Tooltip title="Delete"><Button size="small" danger icon={<IconDelete />} onClick={deleteSelected} /></Tooltip>
        </div>
      )}

      {contextMenu && (
        <ShapeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectionCount={selectedShapeIds.length}
          isGroup={!!selectedGroup}
          onBringToFront={bringToFront}
          onBringForward={() => reorderSelection(-1)}
          onSendBackward={() => reorderSelection(1)}
          onSendToBack={sendToBack}
          onGroupOrUngroup={selectedGroup ? handleUngroup : handleGroup}
          onDuplicate={() => { handleCopy(); void handlePaste(); }}
          onCopy={handleCopy}
          onDelete={deleteSelected}
          onAlign={alignSelected}
          onClose={() => setContextMenu(null)}
        />
      )}

      {selectedGroup && (
        <div style={{
          position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
          background: '#fff', borderRadius: 8, padding: 6, display: 'flex', gap: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        }}>
          <Tooltip title="Ungroup"><Button size="small" icon={<IconUngroup />} onClick={handleUngroup} /></Tooltip>
        </div>
      )}

      {selectedEdges.length > 0 && (() => {
        // With 2+ edges selected, apply a change to every one of them (same
        // "loop + per-item Firestore write" convention bringToFront/
        // sendToBack already use for bulk shape operations) — the displayed
        // value is just the first selected edge's current value, not a true
        // mixed-state indicator, matching this file's existing bar-minimum
        // approach to bulk editing.
        const displayEdge = singleSelectedEdge ?? selectedEdges[0];
        const displayData = displayEdge.data as SmartEdgeData | undefined;
        function commitToAll(patch: Partial<SmartEdgeData>) {
          for (const edge of selectedEdges) onEdgeCommit(edge.id, patch);
        }
        return (
          <div style={{
            // Sits below the main toolbar (also top-center-docked now that
            // it's a horizontal bar) rather than sharing its exact position.
            position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
            background: '#fff', borderRadius: 8, padding: 6, display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}>
            <Select
              size="small" style={{ width: 100 }}
              value={displayData?.routing ?? 'orthogonal'}
              options={[{ value: 'orthogonal', label: 'Elbow' }, { value: 'curved', label: 'Curved' }, { value: 'straight', label: 'Straight' }]}
              onChange={v => commitToAll({ routing: v })}
            />
            <Select
              size="small" style={{ width: 110 }}
              value={displayData?.flowAnimation ?? 'none'}
              options={[{ value: 'none', label: 'No animation' }, { value: 'dash', label: 'Flow (dash)' }, { value: 'dot', label: 'Flow (dot)' }]}
              onChange={v => commitToAll({ flowAnimation: v })}
            />
            <Select
              size="small" style={{ width: 130 }}
              value={displayData?.startArrow ?? 'none'}
              options={ARROW_MARKER_OPTIONS.map(o => ({ value: o.value, label: `Start: ${o.label}` }))}
              onChange={v => commitToAll({ startArrow: v })}
            />
            <Select
              size="small" style={{ width: 130 }}
              value={displayData?.endArrow ?? 'arrowClosed'}
              options={ARROW_MARKER_OPTIONS.map(o => ({ value: o.value, label: `End: ${o.label}` }))}
              onChange={v => commitToAll({ endArrow: v })}
            />
          </div>
        );
      })()}
    </div>
  );
}
