import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ReactFlow, Background, Controls, addEdge, applyNodeChanges, applyEdgeChanges,
  MarkerType, ConnectionMode, useReactFlow, type Node, type Edge, type NodeTypes, type EdgeTypes,
  type OnConnect, type NodeChange, type EdgeChange,
} from '@xyflow/react';
import { Button, Tooltip, Select, Popover, Switch, ColorPicker, Modal, Progress } from 'antd';
import {
  IconDelete, IconAlignTop, IconAlignBottom, IconAlignMiddle,
  IconAlignLeft, IconAlignCenter, IconAlignRight, IconDistributeH, IconDistributeV,
  IconBringToFront, IconSendToBack, IconDuplicate,
  IconBooleanUnion, IconBooleanSubtract, IconBooleanIntersect, IconBooleanExclude,
  IconGroup, IconUngroup, IconContainer,
  IconExit, IconChevronLeft, IconChevronRight,
  IconFullscreenEnter, IconFullscreenExit, IconSettingsGear, IconFillScreen,
  IconAddRow, IconRemoveRow, IconAddColumn, IconRemoveColumn,
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
import { CommentThreadPanel } from '../panels/CommentThreadPanel';
import { SmartEdge } from './edges/SmartEdge';
import { PageNavigatorRail } from './PageNavigatorRail';
import { RulerOverlay } from './Ruler';
import { Toolbar } from './Toolbar';
import { ToolSettingsPanel } from '../panels/ToolSettingsPanel';
import { FavoriteShapesPanel } from './FavoriteShapesPanel';
import { useFavoriteShapes, MAX_FAVORITE_SHAPES } from '../../hooks/useFavoriteShapes';
import { useToolDefaults } from '../../hooks/useToolDefaults';
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
import { computeAlignmentGuides, type GuideLines } from './alignmentGuides';
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
import { RemoteCursorsLayer } from './RemoteCursorsLayer';
import { PresentationFrame } from './PresentationFrame';
import { usePresence } from '../../hooks/usePresence';
import { resolveStyle } from '../../utils/shapeStyleResolver';
import { computeDownstream } from '../../utils/graphTraversal';
import { computePresentationLayout, DEFAULT_PRESENTATION_SETTINGS } from '../../utils/presentationFrame';
import { uploadDiagramImage, uploadDiagramMedia, getImageDimensions, getVideoDimensions } from '../../utils/imageUpload';
import { downsampleImageFile, formatBytes } from '../../utils/imageDownsample';
import { exportPageAsImage } from '../../utils/exportImage';
import { THUMB_MAX_WIDTH, THUMB_MAX_HEIGHT } from './PageNavigatorRail';
import type { DiagramVariable } from '../../types/variables';
import {
  subscribeShapes, subscribeConnectors, saveShape, deleteShape, saveConnector, deleteConnector,
  subscribeVariables, upsertVariable, deleteVariable, updatePage, duplicatePage,
  subscribeComments, saveComment, deleteComment,
} from '../../store';
import type { DiagramComment } from '../../types/comments';
import { useAuth } from '../../AuthContext';

const nodeTypes: NodeTypes = {
  pageFrame: PageFrameNode,
  shape: ShapeNode,
  group: GroupNode,
  path: PathNode,
  comment: CommentPinNode,
};
const edgeTypes: EdgeTypes = {
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
  mode?: 'edit' | 'present';
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
  onReorderPages?: (pages: DiagramPage[]) => void;
  // Diagram members, for @mention autocomplete in comment threads.
  members?: { uid: string; email: string }[];
}

// A connector's arrowhead is chosen per-end (start/end independently) after
// it's drawn, stored in `data.startArrow`/`endArrow` and materialized into
// React Flow's own `markerStart`/`markerEnd` edge fields here — `undefined`
// falls back to each end's pre-existing default (no start arrow, filled
// arrow at the end) so every connector created before this field existed
// keeps looking exactly the same.
function arrowMarker(style: ArrowStyle | undefined, fallback: ArrowStyle) {
  const resolved = style ?? fallback;
  if (resolved === 'none') return undefined;
  return { type: resolved === 'arrow' ? MarkerType.Arrow : MarkerType.ArrowClosed, color: '#8a93a6' };
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
  toolbarSlot, onInsertPageAt, onReorderPages, members = [],
}: Props) {
  // Master pages (isMaster: true) live in the same pages subcollection as
  // everything else — reusing all of addPage/updatePage/subscribePages
  // unchanged — but they're never themselves navigated to, presented,
  // exported, or counted in {page}/{pages}: they exist only to be pointed
  // at by other pages' masterPageId. Every existing `pages` usage below
  // this line continues to mean "the regular, navigable pages" unchanged;
  // `masterPages` is the small separate list for the settings-form
  // dropdown and for resolving a page's inherited background/header/footer.
  const masterPages = useMemo(() => pagesProp.filter(p => p.isMaster), [pagesProp]);
  const pages = useMemo(() => pagesProp.filter(p => !p.isMaster), [pagesProp]);

  const { user } = useAuth();
  const { screenToFlowPosition, setCenter, getZoom, getInternalNode, fitBounds, getViewport, setViewport, updateNodeData } = useReactFlow();
  const isPresent = mode === 'present';
  const { peers, updateCursor, updateDragPreview } = usePresence(diagramId, user, mode);
  // Measures the actual on-screen container size so fitToPage can reserve
  // space for the properties drawer (an absolutely-positioned overlay that
  // doesn't shrink this element's own measured size) — fitBounds's own
  // padding option is a single percentage with no way to reserve an
  // asymmetric region for it.
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [shapeNodes, setShapeNodes] = useState<Node[]>([]);
  const [connectorEdges, setConnectorEdges] = useState<Edge[]>([]);
  const [comments, setComments] = useState<DiagramComment[]>([]);

  const shapesSlices = useRef<Map<string, Map<string, DiagramNode>>>(new Map());
  const connectorsSlices = useRef<Map<string, Map<string, DiagramEdge>>>(new Map());
  const commentsSlices = useRef<Map<string, Map<string, DiagramComment>>>(new Map());

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
  }, [pages]);
  const pageGeomRef = useRef({ pageOrigins, pageDimensions, pages });
  pageGeomRef.current = { pageOrigins, pageDimensions, pages };

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
        pageNumberEnabled: page.pageNumberEnabled, pageNumberStyle: page.pageNumberStyle, pageNumberPosition: page.pageNumberPosition,
        pageIndex: i + 1, pageCount: pages.length,
        ...(pageDimensions.get(page.id) ?? { width: 794, height: 1123 }),
      },
      draggable: false,
      selectable: false,
      zIndex: -1,
    };
  }), [pages, masterPages, pageOrigins, pageDimensions, diagramId]);

  const [variables, setVariables] = useState<DiagramVariable[]>([]);
  useEffect(() => subscribeVariables(diagramId, setVariables), [diagramId]);

  // ── Subscriptions: merge shapes/connectors across every page of this document ──
  useEffect(() => {
    const shapeUnsubs = pages.map(page => subscribeShapes(diagramId, page.id, nodes => {
      shapesSlices.current.set(page.id, new Map(nodes.map(n => [n.id, n])));
      rebuildShapes();
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

  function rebuildShapes() {
    const merged: Node[] = [];
    for (const slice of shapesSlices.current.values()) {
      for (const n of slice.values()) merged.push({ ...n, data: { ...n.data, onCommit, onNavigateLink: navigateToLink, onResizeGroup: handleResizeGroup, readOnly: isPresent } });
    }
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

  function rebuildConnectors() {
    const merged: Edge[] = [];
    for (const slice of connectorsSlices.current.values()) {
      for (const e of slice.values()) merged.push(e);
    }
    // Same selection-loss hazard as rebuildShapes — Firestore docs never carry
    // `selected`, so an unconditional rebuild would clear it every echo.
    setConnectorEdges(prev => {
      const prevSelected = new Set(prev.filter(e => e.selected).map(e => e.id));
      return merged.map(e => prevSelected.has(e.id) ? { ...e, selected: true } : e);
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

  function applySize(id: string, size: { width: number; height: number }) {
    for (const slice of shapesSlices.current.values()) {
      const existing = slice.get(id);
      if (existing) {
        const updated: DiagramNode = { ...existing, width: size.width, height: size.height };
        slice.set(id, updated);
        saveShape(diagramId, existing.data.pageId, updated);
        rebuildShapes();
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
        return;
      }
    }
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
      setShapeNodes(prev => prev.map(n => {
        const s = snaps.find(x => x.id === n.id);
        if (!s) return n;
        const updated = { ...n, position: s.position, ...(s.width !== undefined ? { width: s.width } : {}), ...(s.height !== undefined ? { height: s.height } : {}) };
        saveShape(diagramId, s.pageId, toPersistableShape(updated));
        return updated;
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
      setShapeNodes(prev => prev.map(n => {
        const s = snaps.find(x => x.id === n.id);
        if (!s) return n;
        const updated = { ...n, position: s.position, ...(s.width !== undefined ? { width: s.width } : {}), ...(s.height !== undefined ? { height: s.height } : {}) };
        saveShape(diagramId, pageId, toPersistableShape(updated));
        return updated;
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
      setShapeNodes(prev => prev.map(n => {
        const u = updates.get(n.id);
        if (!u) return n;
        const updated = { ...n, position: u.position };
        saveShape(diagramId, u.pageId, toPersistableShape(updated));
        return updated;
      }));
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

  const toolActive = penMode || connectMode || directSelectMode || brushMode || stylePaintMode || highlightMode || !!placingShapeKind;

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

  const nodes = useMemo(() => {
    const byId = new Map(shapeNodes.map(n => [n.id, n]));
    const styled = shapeNodes.map(n => {
      const shapeData = n.data as ShapeNodeData;
      // connectMode/onStartConnect are always injected (unlike the other
      // conditional `extra` fields below) so every shape's ConnectionHandles
      // picks up live tool state and can report a connect-drag start.
      // directSelectMode is injected the same way so PathNode can hide its
      // NodeResizer while anchor points are the interactive thing instead.
      const extra: Record<string, unknown> = { connectMode, onStartConnect: handleStartConnect, directSelectMode };
      if (shapeData.dataBinding) {
        const resolved = resolveStyle(shapeData.dataBinding, variables);
        if (resolved) extra.__resolvedStyle = resolved;
      }
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
      };
    });
    // Comment pins are an authoring/collaboration affordance, not part of
    // the diagram's actual content — hidden while presenting, same as the
    // page navigator rail and other editor-only chrome.
    const commentNodes: Node[] = isPresent ? [] : comments.map(c => ({
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
    if (!isPresent && draftComment) {
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
    return [...frameNodes, ...styled, ...commentNodes];
  }, [frameNodes, shapeNodes, variables, highlighted, animationPanelOpen, revealStep, isPresent, presentPage, presentThresholdOrder, connectMode, toolActive, directSelectMode, comments, activeCommentId, draftComment, hiddenTags]);

  const edges = useMemo(() => connectorEdges.map(e => {
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
  }), [connectorEdges, shapeNodes, highlighted, animationPanelOpen, revealStep, isPresent, presentPage, presentThresholdOrder]);

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
      for (const n of shapeNudgePendingRef.current.values()) {
        const pageId = (n.data as ShapeNodeData | undefined)?.pageId;
        if (pageId) saveShape(diagramId, pageId, toPersistableShape(n));
        finals.set(n.id, n.position);
      }
      pushHistory({
        undo: () => { for (const [id, pos] of originals) applyPosition(id, pos); },
        redo: () => { for (const [id, pos] of finals) applyPosition(id, pos); },
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
    if (posChanges.length === 0) return changes;

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
    if (byPage.size === 0) return changes;

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
        return;
      }
    }
  }

  const onNodesChange = useCallback((rawChanges: NodeChange[]) => {
    const changes = clampDragChanges(rawChanges);
    setShapeNodes(prev => applyNodeChanges(changes, [...frameNodes, ...prev]).filter(n => n.type !== 'pageFrame'));

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
            saveShape(diagramId, pageId, toPersistableShape({ ...node, position: nextPosition }));
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
          saveShape(diagramId, pageId, toPersistableShape({ ...node, width: nextSize.width, height: nextSize.height }));
          if (prevSize && (prevSize.width !== nextSize.width || prevSize.height !== nextSize.height)) {
            pushHistory({ undo: () => applySize(change.id, prevSize), redo: () => applySize(change.id, nextSize) });
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
  }, [frameNodes, shapeNodes, connectorEdges, diagramId]);

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
  function handleMarqueeMouseDown(e: React.MouseEvent) {
    if (toolActive || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (!target.closest('.react-flow__node-pageFrame')) return;
    const startScreen = { x: e.clientX, y: e.clientY };
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const preSelectedIds = additive ? new Set(selectedShapeIds) : new Set<string>();
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
      downsampled = await new Promise<boolean>(resolve => {
        Modal.confirm({
          title: 'Downsample this image?',
          content: `This image is ${formatBytes(file.size)}. Downsampling can significantly reduce storage use, usually with little visible quality loss. You can also downsample it later from the shape's Settings tab.`,
          okText: 'Downsample', cancelText: 'Keep original',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
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
  const selectedShapeIds = nodes.filter(n => n.selected && (n.type === 'shape' || n.type === 'path')).map(n => n.id);
  const selectedGroup = nodes.find(n => n.selected && n.type === 'group');
  const singleSelectedShape = selectedShapeIds.length === 1 ? shapeNodes.find(n => n.id === selectedShapeIds[0]) : undefined;
  const selectedEdges = connectorEdges.filter(e => e.selected);
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
      zIndex: -0.5,
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
      zIndex: -0.5,
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
  function persistNodes(updatedNodes: Node[], targetIds: string[]) {
    for (const n of updatedNodes) {
      if (!targetIds.includes(n.id)) continue;
      const pageId = findPageIdFor(n);
      if (pageId) saveShape(diagramId, pageId, toPersistableShape(n));
    }
  }

  function getBBox(n: Node): { x: number; y: number; w: number; h: number } {
    return { x: n.position.x, y: n.position.y, w: n.width ?? n.measured?.width ?? 100, h: n.height ?? n.measured?.height ?? 70 };
  }

  function applyZIndex(id: string, zIndex: number) {
    for (const slice of shapesSlices.current.values()) {
      const existing = slice.get(id);
      if (existing) {
        const updated: DiagramNode = { ...existing, zIndex };
        slice.set(id, updated);
        saveShape(diagramId, existing.data.pageId, updated);
        rebuildShapes();
        return;
      }
    }
  }
  function pushPositionHistory(before: Map<string, { x: number; y: number }>, after: Map<string, { x: number; y: number }>) {
    pushHistory({
      undo: () => { for (const [id, pos] of before) applyPosition(id, pos); },
      redo: () => { for (const [id, pos] of after) applyPosition(id, pos); },
    });
  }
  function pushZIndexHistory(before: Map<string, number>, after: Map<string, number>) {
    pushHistory({
      undo: () => { for (const [id, z] of before) applyZIndex(id, z); },
      redo: () => { for (const [id, z] of after) applyZIndex(id, z); },
    });
  }

  function alignSelected(edge: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') {
    const targetIds = selectedShapeIds.filter(id => !isLocked(id));
    if (targetIds.length < 2) return;
    setShapeNodes(prev => {
      const before = new Map(prev.filter(n => targetIds.includes(n.id)).map(n => [n.id, n.position]));
      const boxes = prev.filter(n => targetIds.includes(n.id)).map(n => ({ id: n.id, ...getBBox(n) }));
      const minX = Math.min(...boxes.map(b => b.x));
      const maxRight = Math.max(...boxes.map(b => b.x + b.w));
      const minY = Math.min(...boxes.map(b => b.y));
      const maxBottom = Math.max(...boxes.map(b => b.y + b.h));
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

  function distributeSelected(axis: 'horizontal' | 'vertical') {
    const targetIds = selectedShapeIds.filter(id => !isLocked(id));
    if (targetIds.length < 3) return;
    setShapeNodes(prev => {
      const before = new Map(prev.filter(n => targetIds.includes(n.id)).map(n => [n.id, n.position]));
      const boxes = prev.filter(n => targetIds.includes(n.id)).map(n => ({ id: n.id, ...getBBox(n) }));
      const sorted = [...boxes].sort((a, b) => axis === 'horizontal' ? a.x - b.x : a.y - b.y);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const totalSize = sorted.reduce((sum, b) => sum + (axis === 'horizontal' ? b.w : b.h), 0);
      const span = axis === 'horizontal' ? (last.x + last.w) - first.x : (last.y + last.h) - first.y;
      const gap = (span - totalSize) / (sorted.length - 1);
      const positions = new Map<string, { x: number; y: number }>();
      let cursor = axis === 'horizontal' ? first.x : first.y;
      for (const b of sorted) {
        positions.set(b.id, axis === 'horizontal' ? { x: cursor, y: b.y } : { x: b.x, y: cursor });
        cursor += (axis === 'horizontal' ? b.w : b.h) + gap;
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
  function sendToBack() {
    const targets = selectedShapeIds.filter(id => !isLocked(id));
    if (targets.length === 0) return;
    setShapeNodes(prev => {
      const before = new Map(prev.filter(n => targets.includes(n.id)).map(n => [n.id, n.zIndex ?? 0]));
      const minZ = Math.min(0, ...prev.map(n => n.zIndex ?? 0));
      const next = prev.map(n => targets.includes(n.id) ? { ...n, zIndex: minZ - 1 } : n);
      persistNodes(next, targets);
      pushZIndexHistory(before, new Map(targets.map(id => [id, minZ - 1])));
      return next;
    });
  }
  function deleteSelected() {
    onNodesChange(selectedShapeIds.filter(id => !isLocked(id)).map(id => ({ type: 'remove', id })));
  }

  const activePageId = useActivePageId(pages, pageOrigins, pageDimensions);

  // Real (but bandwidth-free) page-navigator thumbnails: a session-scoped,
  // in-memory-only cache of small raster snapshots, keyed by pageId — never
  // uploaded/persisted anywhere, so this costs no storage or bandwidth.
  // Only the ACTIVE page is ever snapshotted (onlyRenderVisibleElements
  // already keeps exactly that page's nodes mounted, unlike PDF export's
  // "every page" case, which needed to temporarily disable that culling).
  // Pages never visited this session simply keep showing PageNavigatorRail's
  // existing rough SVG approximation.
  const [pageSnapshots, setPageSnapshots] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (isPresent || !activePageId) return;
    const dims = pageDimensions.get(activePageId);
    const origin = pageOrigins.get(activePageId);
    if (!dims || origin === undefined) return;
    const timer = setTimeout(() => {
      const scale = Math.min(THUMB_MAX_WIDTH / dims.width, THUMB_MAX_HEIGHT / dims.height);
      exportPageAsImage({ x: 0, y: origin, width: dims.width, height: dims.height }, 'png', scale)
        .then(dataUrl => setPageSnapshots(prev => new Map(prev).set(activePageId, dataUrl)))
        .catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageId, shapeNodes, pageDimensions, pageOrigins, isPresent]);

  async function handleDuplicatePage(pageId: string) {
    const sourcePage = pages.find(p => p.id === pageId);
    if (!sourcePage) return;
    const newPage = await duplicatePage(diagramId, sourcePage, pages);
    fitToPage(newPage.id, { duration: 300 });
  }

  // In-memory clipboard (a ref, not the OS Clipboard API — this is a
  // real-time collaborative Firestore-backed canvas with no cross-tab/app
  // paste requirement, and the async permission-gated Clipboard API adds
  // real friction for no benefit over a plain ref).
  const clipboardRef = useRef<{ shapes: DiagramNode[]; edges: DiagramEdge[]; sourcePageId: string } | null>(null);

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
    // A small fixed offset keeps repeated pastes from stacking exactly on
    // top of each other; the page-origin delta re-bases Y when pasting onto
    // a different page than the shapes were copied from.
    const PASTE_OFFSET = 24;
    const dx = PASTE_OFFSET;
    const dy = (destOrigin - srcOrigin) + PASTE_OFFSET;

    const idMap = new Map<string, string>();
    for (const s of clip.shapes) idMap.set(s.id, crypto.randomUUID());

    const destDims = pageDimensions.get(destPageId);
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
      // already-valid local space.
      if (isTopLevel && destDims) {
        const w = s.width ?? 100, h = s.height ?? 100;
        position = {
          x: w >= destDims.width ? PAGE_X : Math.min(Math.max(position.x, PAGE_X), PAGE_X + destDims.width - w),
          y: h >= destDims.height ? destOrigin : Math.min(Math.max(position.y, destOrigin), destOrigin + destDims.height - h),
        };
      }
      return {
        ...s,
        id: idMap.get(s.id)!,
        parentId: newParentId,
        extent: newParentId ? ('parent' as const) : undefined,
        position,
        zIndex: (s.zIndex ?? 0) + zIndexBase,
        data: { ...s.data, pageId: destPageId },
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
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (isPresent) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 'c') { e.preventDefault(); handleCopy(); }
      else if (e.key === 'x') { e.preventDefault(); handleCut(); }
      else if (e.key === 'v') { e.preventDefault(); void handlePaste(); }
      else if (e.key === 'd') { e.preventDefault(); handleCopy(); void handlePaste(); }
      else if (e.key.toLowerCase() === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
      else if (e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent, selectedShapeIds, selectedGroup, shapeNodes, connectorEdges, activePageId, pageOrigins, pageDimensions, diagramId]);

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
  const [gridRulersPanelOpen, setGridRulersPanelOpen] = useState(false);
  const [tagsPanelOpen, setTagsPanelOpen] = useState(false);

  // Derived, not stored — computed fresh every render from the existing
  // booleans above (cheap, same convention as toolActive itself). Used only
  // by the Toolbar (active-button highlighting) and the tool-settings panel
  // dispatcher; every other existing direct read of penMode/brushMode/etc.
  // throughout this file is untouched.
  const activeToolId: ToolId | null = (() => {
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
  // Snap-to-grid was previously always-on at a fixed 8px — now a user toggle
  // plus a choice of increment. The visible dot grid is drawn at 2x the
  // actual snap increment (matching the old fixed 16px-dots/8px-snap ratio),
  // so it marks every other real snap point rather than every one.
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [gridSize, setGridSize] = useState(8);
  const [showRulers, setShowRulers] = useState(false);

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

  function handleLayerSelect(id: string, additive: boolean) {
    const changes: NodeChange[] = additive
      ? [{ type: 'select', id, selected: true }]
      : [
          ...nodes.filter(n => n.selected && n.id !== id).map(n => ({ type: 'select' as const, id: n.id, selected: false })),
          { type: 'select', id, selected: true },
        ];
    onNodesChange(changes);
  }

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
    saveShape(diagramId, pageId, toPersistableShape({ ...a, zIndex: bz }));
    saveShape(diagramId, pageId, toPersistableShape({ ...b, zIndex: az }));
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

  function onNodeDrag(_event: MouseEvent | TouchEvent, node: Node) {
    if (node.type !== 'shape') return;
    const pageId = findPageIdFor(node);
    const siblings = shapeNodes.filter(n => n.id !== node.id && n.type === 'shape' && findPageIdFor(n) === pageId);
    setGuides(computeAlignmentGuides(
      { x: node.position.x, y: node.position.y, width: node.width ?? node.measured?.width ?? 0, height: node.height ?? node.measured?.height ?? 0 },
      siblings,
    ));
    const committed = getCommittedPosition(node.id);
    if (committed) {
      updateDragPreview({ shapeIds: [node.id], dx: node.position.x - committed.x, dy: node.position.y - committed.y });
    }
  }
  function onNodeDragStop() {
    setGuides(null);
    updateDragPreview(null);
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
        style={{ width: '100%', height: '100%', cursor: isSpaceDown ? (isSpaceDragging ? 'grabbing' : 'grab') : undefined }}
        onMouseDown={() => { if (isSpaceDown) setIsSpaceDragging(true); }}
        onMouseUp={() => setIsSpaceDragging(false)}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onInit={() => setFlowReady(true)}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={handleNodeClick}
          onPaneClick={() => setHighlighted(null)}
          onNodeDrag={isPresent ? undefined : onNodeDrag}
          onNodeDragStop={isPresent ? undefined : onNodeDragStop}
          connectionMode={ConnectionMode.Loose}
          onlyRenderVisibleElements={!isExporting}
          minZoom={0.1}
          maxZoom={2}
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
          panOnDrag={isPresent ? false : isSpaceDown ? true : [1, 2]}
          zoomOnScroll={!isPresent}
          zoomOnPinch={!isPresent}
          // Explicitly disabled — camera zoom/pan should only ever change from
          // the user's own explicit action (scroll/pinch/drag, or the various
          // programmatic setCenter calls in this file), never as a side
          // effect of double-clicking a shape to rename it.
          zoomOnDoubleClick={false}
          selectionOnDrag={!isPresent && !toolActive && !isSpaceDown}
          // Plain-drag-on-empty-canvas already starts a selection box via
          // selectionOnDrag above, so RF's default Shift-triggered selection
          // mode is redundant — and actively harmful, since it hijacks any
          // Shift+drag (e.g. Shift-drag a resize handle for aspect-ratio
          // lock) into a marquee-select that clears the current selection
          // mid-drag instead of resizing.
          selectionKeyCode={null}
          // Users reach for either modifier to add a shape to the current
          // selection — RF's own default only recognizes Meta/Control (never
          // Shift), so Shift-click silently replaced the selection instead
          // of extending it.
          multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
          selectNodesOnDrag={false}
          nodesDraggable={!isPresent && !toolActive && !isSpaceDown}
          nodesConnectable={!isPresent && !toolActive}
          elementsSelectable={!isPresent && !toolActive}
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
      {!isPresent && (
        <PageNavigatorRail
          diagramId={diagramId}
          pages={pages} masterPages={masterPages} pageOrigins={pageOrigins} pageDimensions={pageDimensions}
          shapeNodes={shapeNodes}
          pageSnapshots={pageSnapshots}
          onSelectPage={pageId => fitToPage(pageId, { duration: 300 })}
          onInsertPageAt={afterOrder => onInsertPageAt?.(afterOrder)}
          onReorderPages={handleReorderPagesWithShapes}
          onOpenPageSettings={() => selectTool('pageSettings')}
          onDuplicatePage={handleDuplicatePage}
        />
      )}
      {!isPresent && pageSettingsPanelOpen && activePageId && (() => {
        const activePage = pages.find(p => p.id === activePageId);
        if (!activePage) return null;
        return (
          <PageSettingsPanel
            diagramId={diagramId}
            page={activePage}
            pages={pages}
            masterPages={masterPages}
            pageOrigin={pageOrigins.get(activePageId) ?? 0}
            pageShapes={shapeNodes.filter(n => (n.data as ShapeNodeData).pageId === activePageId)}
            onResizePageContent={handleResizePageContent}
            onClose={() => setPageSettingsPanelOpen(false)}
          />
        );
      })()}
      {!isPresent && showRulers && <RulerOverlay railWidth={168} />}


      {!isPresent && (
        <ShortcutsHelpModal open={shortcutsHelpOpen} onClose={() => setShortcutsHelpOpen(false)} />
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

      {!isPresent && singleSelectedShape && !gridRulersPanelOpen && !tagsPanelOpen && (
        <ShapePropertiesPanel
          node={singleSelectedShape}
          diagramId={diagramId}
          pages={pages}
          allShapes={shapeNodes}
          variables={variables}
          connectorEdges={connectorEdges}
          onChange={patch => onCommit(singleSelectedShape.id, patch)}
          onResize={(w, h) => handleResizeShape(singleSelectedShape.id, w, h)}
          onMove={(x, y) => handleMoveShape(singleSelectedShape.id, x, y)}
          pageOrigin={pageOrigins.get(findPageIdFor(singleSelectedShape) ?? '') ?? 0}
          onDeleteEdge={id => onEdgesChange([{ type: 'remove', id }])}
          onClose={deselectAll}
        />
      )}

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

      {!isPresent && (draftComment || activeCommentId) && (
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

      {selectedShapeIds.length > 0 && (
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
              <Tooltip title="Distribute horizontally"><Button size="small" icon={<IconDistributeH />} onClick={() => distributeSelected('horizontal')} /></Tooltip>
              <Tooltip title="Distribute vertically"><Button size="small" icon={<IconDistributeV />} onClick={() => distributeSelected('vertical')} /></Tooltip>
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
          <Tooltip title="Bring to front"><Button size="small" icon={<IconBringToFront />} onClick={bringToFront} /></Tooltip>
          <Tooltip title="Send to back"><Button size="small" icon={<IconSendToBack />} onClick={sendToBack} /></Tooltip>
          <Tooltip title="Duplicate"><Button size="small" icon={<IconDuplicate />} onClick={() => { handleCopy(); void handlePaste(); }} /></Tooltip>
          <Tooltip title="Delete"><Button size="small" danger icon={<IconDelete />} onClick={deleteSelected} /></Tooltip>
        </div>
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

      {singleSelectedEdge && (
        <div style={{
          // Sits below the main toolbar (also top-center-docked now that
          // it's a horizontal bar) rather than sharing its exact position.
          position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
          background: '#fff', borderRadius: 8, padding: 6, display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        }}>
          <Select
            size="small" style={{ width: 100 }}
            value={(singleSelectedEdge.data as SmartEdgeData | undefined)?.routing ?? 'orthogonal'}
            options={[{ value: 'orthogonal', label: 'Elbow' }, { value: 'curved', label: 'Curved' }, { value: 'straight', label: 'Straight' }]}
            onChange={v => onEdgeCommit(singleSelectedEdge.id, { routing: v })}
          />
          <Select
            size="small" style={{ width: 110 }}
            value={(singleSelectedEdge.data as SmartEdgeData | undefined)?.flowAnimation ?? 'none'}
            options={[{ value: 'none', label: 'No animation' }, { value: 'dash', label: 'Flow (dash)' }, { value: 'dot', label: 'Flow (dot)' }]}
            onChange={v => onEdgeCommit(singleSelectedEdge.id, { flowAnimation: v })}
          />
          <Select
            size="small" style={{ width: 110 }}
            value={(singleSelectedEdge.data as SmartEdgeData | undefined)?.startArrow ?? 'none'}
            options={[{ value: 'none', label: 'Start: None' }, { value: 'arrow', label: 'Start: Arrow' }, { value: 'arrowClosed', label: 'Start: Filled' }]}
            onChange={v => onEdgeCommit(singleSelectedEdge.id, { startArrow: v })}
          />
          <Select
            size="small" style={{ width: 110 }}
            value={(singleSelectedEdge.data as SmartEdgeData | undefined)?.endArrow ?? 'arrowClosed'}
            options={[{ value: 'none', label: 'End: None' }, { value: 'arrow', label: 'End: Arrow' }, { value: 'arrowClosed', label: 'End: Filled' }]}
            onChange={v => onEdgeCommit(singleSelectedEdge.id, { endArrow: v })}
          />
        </div>
      )}
    </div>
  );
}
