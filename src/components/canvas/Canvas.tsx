import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  ReactFlow, Background, Controls, addEdge, applyNodeChanges, applyEdgeChanges,
  MarkerType, ConnectionMode, useReactFlow, type Node, type Edge, type NodeTypes, type EdgeTypes,
  type OnConnect, type NodeChange, type EdgeChange,
} from '@xyflow/react';
import { Button, Tooltip, Select, Popover, Switch, ColorPicker } from 'antd';
import {
  DeleteOutlined, VerticalAlignTopOutlined, VerticalAlignBottomOutlined,
  GroupOutlined, UngroupOutlined,
  CloseCircleOutlined, LeftOutlined, RightOutlined,
  FullscreenOutlined, FullscreenExitOutlined, SettingOutlined, BorderOutlined,
} from '@ant-design/icons';
import type { DiagramPage, PresentationSettings } from '../../types/document';
import type { ShapeKind, DiagramNode, ShapeNodeData, PathAnchor } from '../../types/shapes';
import type { DiagramEdge, SmartEdgeData } from '../../types/edges';
import { getPageDimensions } from '../../utils/paperSizes';
import { PAGE_GAP, PAGE_X } from '../../constants';
import { PageFrameNode } from './nodes/PageFrameNode';
import { ShapeNode } from './nodes/ShapeNode';
import { GroupNode } from './nodes/GroupNode';
import { PathNode } from './nodes/PathNode';
import { SmartEdge } from './edges/SmartEdge';
import { PageNavigatorRail } from './PageNavigatorRail';
import { Toolbar } from './Toolbar';
import { ShapeGalleryModal } from '../ShapeGalleryModal';
import { ShapeStampCursor } from './ShapeStampCursor';
import { useActivePageId } from './useActivePageId';
import { AlignmentGuidesOverlay } from './AlignmentGuidesOverlay';
import { PenDrawingOverlay } from './PenDrawingOverlay';
import { ConnectorDrawingOverlay } from './ConnectorDrawingOverlay';
import { AnchorEditOverlay, type AnchorPart } from './AnchorEditOverlay';
import { computePathViewBox, absoluteToAnchorLocal, anchorToAbsolute, normalizePathAnchors } from '../../utils/pathAnchorGeometry';
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
import { uploadDiagramImage, getImageDimensions } from '../../utils/imageUpload';
import type { DiagramVariable } from '../../types/variables';
import {
  subscribeShapes, subscribeConnectors, saveShape, deleteShape, saveConnector, deleteConnector,
  subscribeVariables, upsertVariable, deleteVariable, updatePage,
} from '../../store';
import { useAuth } from '../../AuthContext';

const nodeTypes: NodeTypes = {
  pageFrame: PageFrameNode,
  shape: ShapeNode,
  group: GroupNode,
  path: PathNode,
};
const edgeTypes: EdgeTypes = {
  smart: SmartEdge,
};

const GROUP_PADDING = 24;

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

  const [shapeNodes, setShapeNodes] = useState<Node[]>([]);
  const [connectorEdges, setConnectorEdges] = useState<Edge[]>([]);

  const shapesSlices = useRef<Map<string, Map<string, DiagramNode>>>(new Map());
  const connectorsSlices = useRef<Map<string, Map<string, DiagramEdge>>>(new Map());

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
  function fitToPage(pageId: string, opts: { duration: number }) {
    const { pageOrigins: origins, pageDimensions: dims } = pageGeomRef.current;
    const origin = origins.get(pageId) ?? 0;
    const dims_ = dims.get(pageId) ?? { width: 794, height: 1123 };
    fitBounds({ x: PAGE_X, y: origin, width: dims_.width, height: dims_.height }, { padding: 0.1, duration: opts.duration });
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
    return () => {
      shapeUnsubs.forEach(u => u());
      connectorUnsubs.forEach(u => u());
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

  const [penMode, setPenMode] = useState(false);
  const [draftAnchors, setDraftAnchors] = useState<PathAnchor[]>([]);
  const [penDrag, setPenDrag] = useState<{ start: { x: number; y: number }; current: { x: number; y: number } } | null>(null);
  const lastPenClickRef = useRef<{ time: number; x: number; y: number } | null>(null);

  // Click-to-place: picking a shape (from the gallery or the quick Hotspot
  // button) no longer creates it immediately — it arms this, and the next
  // canvas click places it exactly there instead of always at the viewport
  // center. Single-use: placing one shape disarms it again, so it takes a
  // fresh gallery pick to place another.
  const [shapeGalleryOpen, setShapeGalleryOpen] = useState(false);
  const [placingShapeKind, setPlacingShapeKind] = useState<ShapeKind | null>(null);
  const [pendingImagePlacement, setPendingImagePlacement] = useState<{ imageUrl: string; width: number; height: number } | null>(null);
  // Raw screen coordinates (not flow-space) for the ShapeStampCursor overlay —
  // only tracked while a shape is armed, so normal mousemoves outside
  // placing mode don't pay for an extra re-render.
  const [stampScreenPos, setStampScreenPos] = useState<{ x: number; y: number } | null>(null);

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

  const toolActive = penMode || connectMode || !!placingShapeKind;

  function clearOtherTools() {
    // Finalize (not discard) an in-progress pen path when switching tools —
    // matches the pen tool's own Escape/toggle-off behavior.
    if (penMode) {
      if (draftAnchors.length >= 2) finalizePath(draftAnchors, false);
      else setDraftAnchors([]);
    }
    setPenMode(false); lastPenClickRef.current = null;
    setConnectMode(false); setConnectDrag(null);
    setPlacingShapeKind(null); setPendingImagePlacement(null);
    setHighlightMode(false); setHighlighted(null);
  }

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
      const extra: Record<string, unknown> = { connectMode, onStartConnect: handleStartConnect };
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
    return [...frameNodes, ...styled];
  }, [frameNodes, shapeNodes, variables, highlighted, animationPanelOpen, revealStep, isPresent, presentPage, presentThresholdOrder, connectMode, toolActive]);

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
  useEffect(() => {
    if (isPresent) return;
    const PAN_STEP_SCREEN_PX = 60;
    const PAN_KEYS: Record<string, { x: number; y: number }> = {
      ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
      KeyW: { x: 0, y: -1 }, KeyS: { x: 0, y: 1 }, KeyA: { x: -1, y: 0 }, KeyD: { x: 1, y: 0 },
    };
    function isTypingTarget(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (toolActive) return; // don't fight an in-progress path/connector/shape-placement drag
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const dir = PAN_KEYS[e.code];
      if (!dir) return;
      e.preventDefault();
      const { x, y, zoom } = getViewport();
      setViewport({ x: x - dir.x * PAN_STEP_SCREEN_PX, y: y - dir.y * PAN_STEP_SCREEN_PX, zoom }, { duration: 0 });
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent, toolActive]);

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
      strokeStyle: d.strokeStyle,
      effect: d.effect,
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

  const onNodesChange = useCallback((changes: NodeChange[]) => {
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
  function beginPlacingShape(kind: ShapeKind) {
    clearOtherTools();
    setPlacingShapeKind(kind);
  }

  function commitPlaceShape(kind: ShapeKind, flowPoint: { x: number; y: number }) {
    const pageId = getPageIdForFlowPoint(flowPoint);
    if (!pageId) return;
    if (kind === 'image') {
      if (!pendingImagePlacement) return;
      const { imageUrl, width, height } = pendingImagePlacement;
      const node: DiagramNode = {
        id: crypto.randomUUID(),
        type: 'shape',
        position: { x: flowPoint.x - width / 2, y: flowPoint.y - height / 2 },
        width, height,
        data: { kind: 'image', pageId, imageUrl },
      };
      setShapeNodes(prev => [...prev, { ...node, data: { ...node.data, onCommit, onNavigateLink: navigateToLink } }]);
      saveShape(diagramId, pageId, node);
      // Image placement is single-use — the uploaded file backing
      // pendingImagePlacement can't be reused for a second copy.
      setPlacingShapeKind(null);
      setPendingImagePlacement(null);
      return;
    }
    const width = kind === 'text' ? 120 : kind === 'hotspot' ? 140 : 100;
    const height = kind === 'text' ? 32 : kind === 'hotspot' ? 90 : 70;
    const node: DiagramNode = {
      id: crypto.randomUUID(),
      type: 'shape',
      position: { x: flowPoint.x - width / 2, y: flowPoint.y - height / 2 },
      width,
      height,
      data: { kind, pageId, label: kind === 'text' ? 'Text' : '' },
    };
    setShapeNodes(prev => [...prev, { ...node, data: { ...node.data, onCommit, onNavigateLink: navigateToLink } }]);
    saveShape(diagramId, pageId, node);
    setPlacingShapeKind(null);
  }

  function handleShapePlaceMouseDown(e: React.MouseEvent) {
    if (!placingShapeKind) return;
    e.preventDefault();
    const flowPoint = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    commitPlaceShape(placingShapeKind, flowPoint);
  }

  useEffect(() => {
    if (!placingShapeKind) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { setPlacingShapeKind(null); setPendingImagePlacement(null); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [placingShapeKind]);

  async function handleUploadImage(file: File) {
    const [dims, imageUrl] = await Promise.all([
      getImageDimensions(file),
      uploadDiagramImage(diagramId, file),
    ]);
    const maxDim = 320;
    const scale = Math.min(1, maxDim / Math.max(dims.width, dims.height));
    const width = Math.round(dims.width * scale);
    const height = Math.round(dims.height * scale);
    // Don't route through beginPlacingShape here — it calls clearOtherTools(),
    // which would also null out the pendingImagePlacement we're about to set
    // (both setState calls batch together since neither is separated by an
    // await, so the clear would silently win over the set).
    clearOtherTools();
    setPendingImagePlacement({ imageUrl, width, height });
    setPlacingShapeKind('image');
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

  // Post-creation anchor editing — selecting a path shows its anchors
  // immediately (see editingPathId above); dragging a marker updates
  // pathAnchors live via updateNodeData (fast visual feedback, no Firestore
  // write per pixel) and only persists on mouseup.
  function handleAnchorMarkerMouseDown(anchorIndex: number, part: AnchorPart, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!editingPathId) return;
    const pathId = editingPathId;
    const node = shapeNodesRef.current.find(n => n.id === pathId);
    const rect = getAbsoluteRect(pathId);
    if (!node || !rect) return;
    const data = node.data as ShapeNodeData;
    const rotationDeg = data.rotation ?? 0;
    const { width: vbW, height: vbH } = computePathViewBox(data.pathAnchors ?? []);
    let liveAnchors = [...(data.pathAnchors ?? [])];

    function onMove(ev: MouseEvent) {
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

  useEffect(() => {
    if (!editingPathId) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') deselectAll();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editingPathId]);

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

  async function handleGroup() {
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
      type: 'group',
      position: { x: minX, y: minY },
      width: maxX - minX,
      height: maxY - minY,
      zIndex: -0.5,
      parentId: commonParentId,
      extent: commonParentId ? ('parent' as const) : undefined,
      data: { kind: 'group', pageId, label: 'Group' },
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

  const [guides, setGuides] = useState<GuideLines | null>(null);
  const [dataPanelOpen, setDataPanelOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [layersPanelOpen, setLayersPanelOpen] = useState(false);
  const activePageId = useActivePageId(pages, pageOrigins, pageDimensions);

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
  }
  function handleWrapperMouseUp(e: React.MouseEvent) {
    handlePenMouseUp(e);
    handleConnectMouseUp(e);
  }

  return (
    <div
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
          deleteKeyCode={isPresent ? [] : ['Backspace', 'Delete']}
          proOptions={{ hideAttribution: true }}
          style={isPresent ? { background: 'transparent' } : undefined}
        >
          {!isPresent && <Background color="#d8dbe6" gap={16} />}
          {!isPresent && <Controls showInteractive={false} />}
          <AlignmentGuidesOverlay guides={guides} />
          <RemoteCursorsLayer peers={peers} shapeNodes={shapeNodes} />
          <PenDrawingOverlay anchors={draftAnchors} dragPreview={penDrag} />
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
                onMarkerMouseDown={handleAnchorMarkerMouseDown}
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
          onOpenShapeGallery={() => setShapeGalleryOpen(true)}
          isPlacingBasicShape={!!placingShapeKind && placingShapeKind !== 'hotspot' && placingShapeKind !== 'image'}
          penMode={penMode}
          onTogglePen={handleTogglePen}
          connectMode={connectMode}
          onToggleConnect={handleToggleConnect}
          isPlacingHotspot={placingShapeKind === 'hotspot'}
          onStartPlacingHotspot={() => beginPlacingShape('hotspot')}
          onUploadImage={handleUploadImage}
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
          onSelect={kind => beginPlacingShape(kind)}
        />
      )}
      {!isPresent && (
        <ShapeStampCursor kind={placingShapeKind} imageUrl={pendingImagePlacement?.imageUrl} pos={stampScreenPos} />
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
      <PageNavigatorRail
        diagramId={diagramId}
        pages={pages} pageOrigins={pageOrigins} pageDimensions={pageDimensions}
        rightOffset={(singleSelectedShape || dataPanelOpen || animationPanelOpen) ? 316 : 16}
        onSelectPage={pageId => fitToPage(pageId, { duration: 300 })}
      />


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
