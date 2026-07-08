import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  ReactFlow, Background, Controls, addEdge, applyNodeChanges, applyEdgeChanges,
  MarkerType, ConnectionMode, useReactFlow, type Node, type Edge, type NodeTypes, type EdgeTypes,
  type OnConnect, type NodeChange, type EdgeChange,
} from '@xyflow/react';
import { Button, Tooltip, Select, Popover, Switch, ColorPicker } from 'antd';
import {
  DeleteOutlined, VerticalAlignTopOutlined, VerticalAlignBottomOutlined,
  GroupOutlined, UngroupOutlined, BorderOuterOutlined,
  CloseCircleOutlined, LeftOutlined, RightOutlined,
  FullscreenOutlined, FullscreenExitOutlined, SettingOutlined, BorderOutlined,
} from '@ant-design/icons';
import type { DiagramPage, PresentationSettings } from '../../types/document';
import type { ShapeKind, DiagramNode, ShapeNodeData, PathAnchor, BrushPoint } from '../../types/shapes';
import type { DiagramEdge, SmartEdgeData } from '../../types/edges';
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
import { Toolbar } from './Toolbar';
import { ShapeGalleryModal } from '../ShapeGalleryModal';
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
import { ShapePropertiesPanel } from '../panels/ShapePropertiesPanel';
import { DataPanel } from '../panels/DataPanel';
import { AnimationPanel, type SequenceItem } from '../panels/AnimationPanel';
import { LayersPanel } from '../panels/LayersPanel';
import { ExportModal } from '../ExportModal';
import { RemoteCursorsLayer } from './RemoteCursorsLayer';
import { PresentationFrame } from './PresentationFrame';
import { usePresence } from '../../hooks/usePresence';
import { resolveStyle } from '../../utils/shapeStyleResolver';
import { computeDownstream } from '../../utils/graphTraversal';
import { computePresentationLayout, DEFAULT_PRESENTATION_SETTINGS } from '../../utils/presentationFrame';
import { uploadDiagramImage, uploadDiagramMedia, getImageDimensions, getVideoDimensions } from '../../utils/imageUpload';
import type { DiagramVariable } from '../../types/variables';
import {
  subscribeShapes, subscribeConnectors, saveShape, deleteShape, saveConnector, deleteConnector,
  subscribeVariables, upsertVariable, deleteVariable, updatePage,
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
}

export function Canvas({
  diagramId, pages, diagramName = 'diagram', mode = 'edit', onExitPresent,
  presentationSettings, onUpdatePresentationSettings,
}: Props) {
  const { user } = useAuth();
  const { screenToFlowPosition, setCenter, getZoom, getInternalNode, fitBounds, getViewport, setViewport, updateNodeData } = useReactFlow();
  const isPresent = mode === 'present';
  const { peers, updateCursor, updateDragPreview } = usePresence(diagramId, user);
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
  const frameNodes = useMemo<Node[]>(() => pages.map(page => ({
    id: `pageFrame-${page.id}`,
    type: 'pageFrame',
    position: { x: PAGE_X, y: pageOrigins.get(page.id) ?? 0 },
    data: {
      pageName: page.name, pageId: page.id, onRename: handleRenamePage,
      onDeselectAll: () => deselectAllRef.current(),
      ...(pageDimensions.get(page.id) ?? { width: 794, height: 1123 }),
    },
    draggable: false,
    selectable: false,
    zIndex: -1,
  })), [pages, pageOrigins, pageDimensions, diagramId]);

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
      for (const n of slice.values()) merged.push({ ...n, data: { ...n.data, onCommit, onNavigateLink: navigateToLink, readOnly: isPresent } });
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
  }, [diagramId]);

  const onCommit = useCallback((id: string, patch: Partial<ShapeNodeData>) => {
    for (const slice of shapesSlices.current.values()) {
      const existing = slice.get(id);
      if (existing) {
        const updated: DiagramNode = { ...existing, data: { ...existing.data, ...patch } };
        slice.set(id, updated);
        saveShape(diagramId, existing.data.pageId, updated);
        rebuildShapes();
        return;
      }
    }
  }, [diagramId]);

  // Precise numeric resize (e.g. the properties panel's mm-based width/
  // height inputs) — width/height live on the node itself, not `.data`, so
  // this can't go through onCommit above.
  const handleResizeShape = useCallback((id: string, width: number, height: number) => {
    for (const slice of shapesSlices.current.values()) {
      const existing = slice.get(id);
      if (existing) {
        const updated: DiagramNode = { ...existing, width, height };
        slice.set(id, updated);
        saveShape(diagramId, existing.data.pageId, updated);
        rebuildShapes();
        return;
      }
    }
  }, [diagramId]);

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

  // Click-to-place: picking a shape (from the gallery or the quick Hotspot
  // button) no longer creates it immediately — it arms this, and the next
  // canvas click places it exactly there instead of always at the viewport
  // center. Single-use: placing one shape disarms it again, so it takes a
  // fresh gallery pick to place another.
  const [shapeGalleryOpen, setShapeGalleryOpen] = useState(false);
  const [placingShapeKind, setPlacingShapeKind] = useState<ShapeKind | null>(null);
  const [pendingMediaPlacement, setPendingMediaPlacement] = useState<{ kind: 'image' | 'video'; url: string; width: number; height: number } | null>(null);
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

  const toolActive = penMode || connectMode || directSelectMode || !!placingShapeKind;

  function clearOtherTools() {
    // Finalize (not discard) an in-progress pen path when switching tools —
    // matches the pen tool's own Escape/toggle-off behavior.
    if (penMode) {
      if (draftAnchors.length >= 2) finalizePath(draftAnchors, false);
      else setDraftAnchors([]);
    }
    setPenMode(false); lastPenClickRef.current = null;
    setConnectMode(false); setConnectDrag(null);
    setPlacingShapeKind(null); setPendingMediaPlacement(null);
    setHighlightMode(false); setHighlighted(null);
    setDirectSelectMode(false); setActiveAnchorIndex(null);
    setPlacingComment(false);
    setBrushMode(false);
  }

  function handleToggleDirectSelect() {
    const wasOn = directSelectMode;
    clearOtherTools();
    if (!wasOn) setDirectSelectMode(true);
  }

  // Reset anchor focus whenever the edited path changes (including becoming
  // null) so a stale index never survives onto a different path's anchors.
  useEffect(() => {
    setActiveAnchorIndex(null);
  }, [editingPathId]);

  const [highlightMode, setHighlightMode] = useState(false);
  const [highlighted, setHighlighted] = useState<{ nodeIds: Set<string>; edgeIds: Set<string> } | null>(null);
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
        hidden: isPersistedHidden(n.id, byId),
        // An explicit per-node `draggable` always overrides RF's global
        // nodesDraggable prop, so it must repeat the same toolActive gate —
        // otherwise clicking a shape's body while the Arrow/Pen tool is
        // active drags the shape instead of starting a connector/path.
        draggable: !locked && !toolActive,
        connectable: !locked,
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
      data: { resolved: c.resolved, replyCount: c.replies.length, active: c.id === activeCommentId, onOpen: (id: string) => { setDraftComment(null); setActiveCommentId(id); } },
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
  }, [frameNodes, shapeNodes, variables, highlighted, animationPanelOpen, revealStep, isPresent, presentPage, presentThresholdOrder, connectMode, toolActive, directSelectMode, comments, activeCommentId, draftComment]);

  const edges = useMemo(() => connectorEdges.map(e => {
    const edgeData = e.data as SmartEdgeData | undefined;
    const edgePageId = findPageIdFor(shapeNodes.find(n => n.id === e.source));
    let hidden = false;
    if (isPresent && edgePageId === presentPage?.id && edgeData?.revealOrder !== undefined) {
      hidden = edgeData.revealOrder > presentThresholdOrder;
    } else if (!isPresent && animationPanelOpen && edgeData?.revealOrder !== undefined) {
      hidden = edgeData.revealOrder > revealStep;
    }
    return { ...e, data: { ...e.data, __dimmed: highlighted ? !highlighted.edgeIds.has(e.id) : false, __hidden: hidden } };
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

  function handleNodeClick(_event: unknown, node: Node) {
    if (node.type !== 'shape') return;
    const link = (node.data as ShapeNodeData).link;
    if (isPresent && link) { navigateToLink(node.id); return; }
    if (!isPresent && !highlightMode) return;
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
    const shouldDissolve = pageHadBezelRef.current || targetHasBezel;
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

  // WASD + arrow-key viewport panning (edit mode only — presentation mode
  // already owns Space/Arrow for step navigation above). viewport.x/y are
  // already screen-space, so a constant pixel delta pans a constant on-screen
  // distance regardless of zoom — no zoom-based conversion needed here.
  //
  // The Direct Selection shortcut ('A', no modifiers) is folded into this
  // SAME handler rather than a second window listener — WASD-pan's own KeyA
  // already means "pan left," so a separate listener would double-fire on
  // every 'A' press (both listeners see the same native event; only
  // stopImmediatePropagation prevents a later-registered listener from
  // running, and that's a fragile ordering dependency to rely on). Deciding
  // both in one place avoids the conflict outright: 'A' toggles Direct
  // Selection only when there's a path to edit, otherwise it still pans.
  useEffect(() => {
    if (isPresent) return;
    const PAN_STEP_SCREEN_PX = 60;
    const PAN_KEYS: Record<string, { x: number; y: number }> = {
      ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
      KeyW: { x: 0, y: -1 }, KeyS: { x: 0, y: 1 }, KeyA: { x: -1, y: 0 }, KeyD: { x: 1, y: 0 },
    };
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'KeyA' && !e.shiftKey && (editingPathId || directSelectMode)) {
        e.preventDefault();
        handleToggleDirectSelect();
        return;
      }
      if (toolActive) return; // don't fight an in-progress path/connector/shape-placement drag
      const dir = PAN_KEYS[e.code];
      if (!dir) return;
      e.preventDefault();
      const { x, y, zoom } = getViewport();
      setViewport({ x: x - dir.x * PAN_STEP_SCREEN_PX, y: y - dir.y * PAN_STEP_SCREEN_PX, zoom }, { duration: 0 });
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent, toolActive, editingPathId, directSelectMode]);

  // Accepts undefined so callers deriving `node` from a `.find()` (e.g. an
  // edge's source/target shape) don't need an unsafe cast — an edge left
  // pointing at a since-deleted shape must degrade to "no page" rather than
  // throw and take down every memo that iterates connectorEdges.
  function findPageIdFor(node: Node | undefined): string | undefined {
    return (node?.data as ShapeNodeData | undefined)?.pageId;
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
      fillColor: d.fillColor,
      strokeColor: d.strokeColor,
      strokeWidth: d.strokeWidth,
      rotation: d.rotation,
      zIndex: d.zIndex,
      revealOrder: d.revealOrder,
      highlightGroup: d.highlightGroup,
      dataBinding: d.dataBinding,
      link: d.link,
      imageUrl: d.imageUrl,
      locked: d.locked,
      hidden: d.hidden,
      pathAnchors: d.pathAnchors,
      pathClosed: d.pathClosed,
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

  const onNodesChange = useCallback((rawChanges: NodeChange[]) => {
    const changes = clampDragChanges(rawChanges);
    setShapeNodes(prev => applyNodeChanges(changes, [...frameNodes, ...prev]).filter(n => n.type !== 'pageFrame'));

    for (const change of changes) {
      if (change.type === 'position' && change.dragging === false && change.position) {
        const node = shapeNodes.find(n => n.id === change.id);
        const pageId = node && findPageIdFor(node);
        if (node && pageId) {
          saveShape(diagramId, pageId, toPersistableShape({ ...node, position: change.position }));
        }
      }
      if (change.type === 'dimensions' && change.resizing === false && change.dimensions) {
        const node = shapeNodes.find(n => n.id === change.id);
        const pageId = node && findPageIdFor(node);
        if (node && pageId) {
          saveShape(diagramId, pageId, toPersistableShape({ ...node, width: change.dimensions.width, height: change.dimensions.height }));
        }
      }
      if (change.type === 'remove') {
        const node = shapeNodes.find(n => n.id === change.id);
        const pageId = node && findPageIdFor(node);
        if (pageId) deleteShape(diagramId, pageId, change.id);
        // A connector left pointing at a deleted shape becomes an orphan:
        // shapeNodes.find() for its source/target returns undefined forever
        // after this, which crashes every memo that resolves an edge's page
        // (sequenceItems, the edges render memo) on next render. Cascade the
        // deletion so no connector can outlive both of the shapes it joins.
        const orphaned = connectorEdges.filter(e => e.source === change.id || e.target === change.id);
        if (orphaned.length > 0) {
          setConnectorEdges(prev => prev.filter(e => !orphaned.some(o => o.id === e.id)));
          for (const edge of orphaned) {
            const edgePageId = findEdgePageId(edge);
            if (edgePageId) deleteConnector(diagramId, edgePageId, edge.id);
          }
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
      data: { routing: 'orthogonal' },
    };
    setConnectorEdges(prev => addEdge(edge, prev));
    saveConnector(diagramId, pageId, edge);
  }, [shapeNodes, diagramId]);

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
  function beginPlacingShape(kind: ShapeKind, extraData?: Partial<ShapeNodeData>) {
    clearOtherTools();
    setPlacingShapeKind(kind);
    setPendingShapeExtraData(extraData ?? null);
  }

  function beginPlacingComment() {
    clearOtherTools();
    setPlacingComment(true);
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
      const { url, width, height } = pendingMediaPlacement;
      const node: DiagramNode = {
        id: crypto.randomUUID(),
        type: 'shape',
        position: { x: flowPoint.x - width / 2, y: flowPoint.y - height / 2 },
        width, height,
        data: kind === 'image'
          ? { kind: 'image', pageId, imageUrl: url }
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
    const width = kind === 'text' ? 120 : kind === 'hotspot' ? 140 : isSquareIconLike ? 64 : kind === 'pieChart' ? 120 : 100;
    const height = kind === 'text' ? 32 : kind === 'hotspot' ? 90 : isSquareIconLike ? 64 : kind === 'pieChart' ? 120 : 70;
    const node: DiagramNode = {
      id: crypto.randomUUID(),
      type: 'shape',
      position: { x: flowPoint.x - width / 2, y: flowPoint.y - height / 2 },
      width,
      height,
      data: { kind, pageId, label: kind === 'text' ? 'Text' : '', ...pendingShapeExtraData },
    };
    setShapeNodes(prev => [...prev, { ...node, data: { ...node.data, onCommit, onNavigateLink: navigateToLink } }]);
    saveShape(diagramId, pageId, node);
    setPlacingShapeKind(null);
    setPendingShapeExtraData(null);
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
    const [dims, url] = await Promise.all([
      isVideo ? getVideoDimensions(file) : getImageDimensions(file),
      isVideo ? uploadDiagramMedia(diagramId, file, 'diagramVideos') : uploadDiagramImage(diagramId, file),
    ]);
    const maxDim = 320;
    const scale = Math.min(1, maxDim / Math.max(dims.width, dims.height));
    const width = Math.round(dims.width * scale);
    const height = Math.round(dims.height * scale);
    // Don't route through beginPlacingShape here — it calls clearOtherTools(),
    // which would also null out the pendingMediaPlacement we're about to set
    // (both setState calls batch together since neither is separated by an
    // await, so the clear would silently win over the set).
    clearOtherTools();
    setPendingMediaPlacement({ kind: isVideo ? 'video' : 'image', url, width, height });
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
        routing: 'orthogonal',
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

  function handleTogglePen() {
    const wasOn = penMode;
    clearOtherTools();
    if (!wasOn) setPenMode(true);
  }
  function handleToggleBrush() {
    const wasOn = brushMode;
    clearOtherTools();
    if (!wasOn) setBrushMode(true);
  }

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
      data: {
        kind: 'brushStroke', pageId,
        brushPoints: localPoints, brushStyle: 'pencil', brushBaseWidth: 6,
        brushViewBoxWidth: width, brushViewBoxHeight: height,
        strokeColor: '#1a1a2e',
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
    const startFlow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const native = e.nativeEvent as PointerEvent;
    const isRealPen = native.pointerType === 'pen';
    const points: BrushPoint[] = [{ x: startFlow.x, y: startFlow.y, pressure: isRealPen ? (native.pressure || 0.5) : 0.6 }];
    setBrushDraft([...points]);
    let last = { x: startFlow.x, y: startFlow.y, t: Date.now() };

    function onMove(ev: PointerEvent) {
      const flow = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
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
  function handleToggleConnect() {
    const wasOn = connectMode;
    clearOtherTools();
    if (!wasOn) setConnectMode(true);
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
      data: { kind: 'path', pageId, pathAnchors: localAnchors, pathClosed: closed },
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

  function persistZIndex(updatedNodes: Node[], targetIds: string[]) {
    for (const n of updatedNodes) {
      if (!targetIds.includes(n.id)) continue;
      const pageId = findPageIdFor(n);
      if (pageId) saveShape(diagramId, pageId, toPersistableShape(n));
    }
  }

  function bringToFront() {
    const targets = selectedShapeIds.filter(id => !isLocked(id));
    if (targets.length === 0) return;
    setShapeNodes(prev => {
      const maxZ = Math.max(0, ...prev.map(n => n.zIndex ?? 0));
      const next = prev.map(n => targets.includes(n.id) ? { ...n, zIndex: maxZ + 1 } : n);
      persistZIndex(next, targets);
      return next;
    });
  }
  function sendToBack() {
    const targets = selectedShapeIds.filter(id => !isLocked(id));
    if (targets.length === 0) return;
    setShapeNodes(prev => {
      const minZ = Math.min(0, ...prev.map(n => n.zIndex ?? 0));
      const next = prev.map(n => targets.includes(n.id) ? { ...n, zIndex: minZ - 1 } : n);
      persistZIndex(next, targets);
      return next;
    });
  }
  function deleteSelected() {
    onNodesChange(selectedShapeIds.filter(id => !isLocked(id)).map(id => ({ type: 'remove', id })));
  }

  const activePageId = useActivePageId(pages, pageOrigins, pageDimensions);

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
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent, selectedShapeIds, selectedGroup, shapeNodes, connectorEdges, activePageId, pageOrigins, pageDimensions, diagramId]);

  const [guides, setGuides] = useState<GuideLines | null>(null);
  const [dataPanelOpen, setDataPanelOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [layersPanelOpen, setLayersPanelOpen] = useState(false);

  const drawerOpen = !!singleSelectedShape || dataPanelOpen || animationPanelOpen || !!activeCommentId || !!draftComment;
  // Re-fit only on the closed→open transition (a shape newly selected, or a
  // panel newly opened) — not continuously on every selection change, which
  // would fight the user's own manual zoom/pan while they're actively
  // clicking between shapes with the drawer already open.
  const wasDrawerOpenRef = useRef(false);
  useEffect(() => {
    if (drawerOpen && !wasDrawerOpenRef.current && activePageId) {
      fitToPage(activePageId, { duration: 300 }, 316);
    }
    wasDrawerOpenRef.current = drawerOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen]);

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
      <div style={{ width: '100%', height: '100%' }}>
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
          onlyRenderVisibleElements
          minZoom={0.1}
          maxZoom={2}
          // Disables RF's own per-node tabIndex/keyboard-a11y layer (Space
          // toggling node selection, Arrow keys nudging the selected node) —
          // it was silently fighting the Space-drag-pan and new WASD/arrow
          // canvas-pan handlers below, and this app has no other keyboard-nav
          // affordances built around node focus.
          disableKeyboardA11y={!isPresent}
          snapToGrid={!isPresent}
          snapGrid={[8, 8]}
          // Presenting is a slide deck, not a Miro board — no free panning or
          // zooming. The camera moves only programmatically (step/page nav,
          // hyperlink/hotspot jumps), never by the viewer dragging or scrolling.
          panOnDrag={isPresent ? false : [1, 2]}
          zoomOnScroll={!isPresent}
          zoomOnPinch={!isPresent}
          zoomOnDoubleClick={!isPresent && !toolActive}
          selectionOnDrag={!isPresent && !toolActive}
          nodesDraggable={!isPresent && !toolActive}
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
          {!isPresent && <Background color="#d8dbe6" gap={16} />}
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
              <Button shape="circle" icon={<CloseCircleOutlined />} onClick={onExitPresent} />
            </Tooltip>
            <Tooltip title={osFullscreen ? 'Exit full screen' : 'Full screen — hide the browser window chrome, like PowerPoint presentation mode'}>
              <Button
                shape="circle" type={osFullscreen ? 'primary' : 'default'}
                icon={osFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                onClick={toggleOsFullscreen}
              />
            </Tooltip>
            <Tooltip title={fullscreenOverride ? 'Restore frame' : 'Fill screen (skip the device frame for this page — great for a landscape desktop/deck page)'}>
              <Button
                shape="circle" type={fullscreenOverride ? 'primary' : 'default'}
                icon={<BorderOutlined />}
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
                </div>
              }
            >
              <Tooltip title="Presentation frame settings">
                <Button shape="circle" icon={<SettingOutlined />} type={presentSettingsOpen ? 'primary' : 'default'} />
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
                shape="circle" icon={<LeftOutlined />}
                onClick={() => {
                  if (presentStep > -1) setPresentStep(s => s - 1);
                  else if (presentPageIndex > 0) setPresentPageIndex(i => i - 1);
                }}
              />
            </Tooltip>
            <Tooltip title="Next (→ / Space)">
              <Button
                shape="circle" type="primary" icon={<RightOutlined />}
                onClick={() => {
                  if (presentStep < presentSequence.length - 1) setPresentStep(s => s + 1);
                  else if (presentPageIndex < pages.length - 1) setPresentPageIndex(i => i + 1);
                }}
              />
            </Tooltip>
          </div>
        </div>
      )}

      {!isPresent && (
        <Toolbar
          leftOffset={layersPanelOpen ? 276 : 16}
          isSelectMode={!toolActive}
          onSelectTool={clearOtherTools}
          onOpenShapeGallery={() => setShapeGalleryOpen(true)}
          isPlacingBasicShape={!!placingShapeKind && placingShapeKind !== 'hotspot' && placingShapeKind !== 'image' && placingShapeKind !== 'video'}
          penMode={penMode}
          onTogglePen={handleTogglePen}
          brushMode={brushMode}
          onToggleBrush={handleToggleBrush}
          directSelectMode={directSelectMode}
          onToggleDirectSelect={handleToggleDirectSelect}
          directSelectDisabled={!editingPathId && !directSelectMode}
          connectMode={connectMode}
          onToggleConnect={handleToggleConnect}
          isPlacingHotspot={placingShapeKind === 'hotspot'}
          onStartPlacingHotspot={() => beginPlacingShape('hotspot')}
          onUploadMedia={handleUploadMedia}
          onInsertContainer={handleInsertContainer}
          isPlacingComment={placingComment}
          onStartPlacingComment={beginPlacingComment}
          layersPanelOpen={layersPanelOpen}
          onToggleLayers={() => setLayersPanelOpen(o => !o)}
          highlightMode={highlightMode}
          onToggleHighlight={() => { setHighlightMode(m => !m); setHighlighted(null); }}
          animationPanelOpen={animationPanelOpen}
          onToggleAnimation={() => { setAnimationPanelOpen(o => !o); setDataPanelOpen(false); setRevealStep(-1); }}
          dataPanelOpen={dataPanelOpen}
          onToggleData={() => { setDataPanelOpen(o => !o); setAnimationPanelOpen(false); }}
          onOpenExport={() => setExportOpen(true)}
        />
      )}
      {!isPresent && (
        <ShapeGalleryModal
          open={shapeGalleryOpen}
          onClose={() => setShapeGalleryOpen(false)}
          onSelect={(kind, extraData) => beginPlacingShape(kind, extraData)}
        />
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
      {!isPresent && layersPanelOpen && (
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
      {/* Hidden entirely (not just shifted) while a drawer covers the right
          side — there isn't room for it, and rightOffset would either
          overlap the drawer or crowd the remaining space. */}
      {!isPresent && !drawerOpen && (
        <PageNavigatorRail
          diagramId={diagramId}
          pages={pages} pageOrigins={pageOrigins} pageDimensions={pageDimensions}
          rightOffset={16}
          onSelectPage={pageId => fitToPage(pageId, { duration: 300 })}
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
        />
      )}

      {!isPresent && singleSelectedShape && (
        <ShapePropertiesPanel
          node={singleSelectedShape}
          pages={pages}
          allShapes={shapeNodes}
          variables={variables}
          connectorEdges={connectorEdges}
          onChange={patch => onCommit(singleSelectedShape.id, patch)}
          onResize={(w, h) => handleResizeShape(singleSelectedShape.id, w, h)}
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

      {!isPresent && (draftComment || activeCommentId) && (
        <CommentThreadPanel
          comment={activeCommentId ? findComment(activeCommentId) ?? null : null}
          draft={draftComment}
          currentUserId={user?.uid ?? ''}
          currentUserSeed={user?.email ?? user?.uid ?? ''}
          onPost={handlePostComment}
          onReply={handleReplyToComment}
          onEditComment={handleEditActiveComment}
          onEditReply={handleEditActiveReply}
          onDeleteReply={handleDeleteActiveReply}
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
          onClose={() => { setAnimationPanelOpen(false); setRevealStep(-1); }}
        />
      )}

      {selectedShapeIds.length > 0 && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
          background: '#fff', borderRadius: 8, padding: 6, display: 'flex', gap: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        }}>
          {selectedShapeIds.length >= 2 && (
            <Tooltip title="Group"><Button size="small" icon={<GroupOutlined />} onClick={handleGroup} /></Tooltip>
          )}
          <Tooltip title={selectedShapeIds.length >= 2 ? 'Wrap in container' : 'Insert container'}>
            <Button size="small" icon={<BorderOuterOutlined />} onClick={handleInsertContainer} />
          </Tooltip>
          <Tooltip title="Bring to front"><Button size="small" icon={<VerticalAlignTopOutlined />} onClick={bringToFront} /></Tooltip>
          <Tooltip title="Send to back"><Button size="small" icon={<VerticalAlignBottomOutlined />} onClick={sendToBack} /></Tooltip>
          <Tooltip title="Delete"><Button size="small" danger icon={<DeleteOutlined />} onClick={deleteSelected} /></Tooltip>
        </div>
      )}

      {selectedGroup && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
          background: '#fff', borderRadius: 8, padding: 6, display: 'flex', gap: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        }}>
          <Tooltip title="Ungroup"><Button size="small" icon={<UngroupOutlined />} onClick={handleUngroup} /></Tooltip>
        </div>
      )}

      {singleSelectedEdge && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
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
        </div>
      )}
    </div>
  );
}
