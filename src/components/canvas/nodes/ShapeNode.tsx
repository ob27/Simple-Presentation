import { memo, useState } from 'react';
import { NodeResizer, useReactFlow, type NodeProps } from '@xyflow/react';
import { IconLink } from '../../icons';
import type { ShapeNodeData, PieSegment, ChartDataPoint } from '../../../types/shapes';
import type { ResolvedStyle } from '../../../utils/shapeStyleResolver';
import { getAntdIconComponent } from '../../../utils/iconRegistry';
import { buildGradientCss } from '../../../utils/gradient';
import { DEFAULT_PIE_SEGMENTS } from '../../../utils/pieDefaults';
import { DEFAULT_CHART_DATA } from '../../../utils/chartDefaults';
import { BrushStamps } from '../BrushStamps';
import { useRotateHandle } from './useRotateHandle';
import { RotateHandle } from './RotateHandle';
import { ConnectionHandles } from './ConnectionHandles';
import { EdgeResizeHandles } from './EdgeResizeHandles';
import { useShiftHeld } from './useShiftHeld';
import { RichTextEditor } from './RichTextEditor';
import { RichTextDisplay } from './RichTextDisplay';
import { richTextFromLabel } from '../../../utils/richText';
import { TableGrid } from './TableGrid';

// Kinds whose outline can't be drawn with a plain CSS border — clip-path
// cuts the box down to the polygon shape, which clips the rectangular border
// away to invisible slivers at the few points where the polygon touches the
// original box edge. These render as an SVG <polygon> instead (below), which
// can carry a real fill AND stroke along its actual visible edge.
const POLYGON_KINDS = new Set<ShapeNodeData['kind']>(['diamond', 'triangle', 'parallelogram', 'hexagon', 'cross', 'star']);

const POLYGON_POINTS: Record<string, string> = {
  diamond: '50,0 100,50 50,100 0,50',
  triangle: '50,0 100,100 0,100',
  parallelogram: '20,0 100,0 80,100 0,100',
  hexagon: '25,0 75,0 100,50 75,100 25,100 0,50',
  cross: '35,0 65,0 65,35 100,35 100,65 65,65 65,100 35,100 35,65 0,65 0,35 35,35',
  star: '50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35',
};

// Kinds whose outline needs a curve, not just straight polygon edges — drawn
// as a single SVG <path> instead of a <polygon>, same rationale as above.
const CURVED_KINDS = new Set<ShapeNodeData['kind']>(['cylinder', 'cloud', 'document']);

const CURVED_PATHS: Record<string, string> = {
  cylinder: 'M0,10 C0,4 100,4 100,10 L100,90 C100,96 0,96 0,90 Z',
  cloud: 'M22,82 C6,82 6,54 22,50 C22,20 56,16 68,34 C90,20 108,40 96,58 C114,60 110,82 90,82 Z',
  document: 'M0,0 L100,0 L100,82 L50,100 L0,82 Z',
};

// A stray ellipse companion path for the cylinder's top rim — drawn as a
// second, separate <ellipse> so the rim reads as an ellipse crossing in
// front of the barrel outline, not just a flat top edge.
const CYLINDER_RIM = { cx: 50, cy: 10, rx: 50, ry: 8 };

const ARCHIMATE_LAYER_COLORS: Record<string, string> = {
  business: '#FFD97A',
  application: '#8CD9A8',
  technology: '#8CC6E8',
};

function archimateFamily(type?: string): 'actor' | 'behavior' | 'object' | 'infra' {
  if (type && /Actor|Role/.test(type)) return 'actor';
  if (type && /Process|Function|Service/.test(type)) return 'behavior';
  if (type && /Object|Data/.test(type)) return 'object';
  return 'infra';
}

// A small badge glyph in the corner distinguishes the 4 coarse ArchiMate
// element families at a glance without needing a bespoke pictogram for each
// of the 12 curated element types individually.
function ArchimateBadge({ family, stroke }: { family: 'actor' | 'behavior' | 'object' | 'infra'; stroke: string }) {
  const common = { position: 'absolute' as const, top: 4, left: 4, pointerEvents: 'none' as const };
  if (family === 'actor') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" style={common}>
        <circle cx="7" cy="4" r="2.5" fill="none" stroke={stroke} strokeWidth="1.2" />
        <path d="M2,13 L2,10 C2,8 12,8 12,10 L12,13" fill="none" stroke={stroke} strokeWidth="1.2" />
      </svg>
    );
  }
  if (family === 'behavior') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" style={common}>
        <path d="M1,3 L8,3 L8,0 L13,7 L8,14 L8,11 L1,11 Z" fill={stroke} opacity="0.85" />
      </svg>
    );
  }
  if (family === 'object') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" style={common}>
        <rect x="1" y="1" width="12" height="12" fill="none" stroke={stroke} strokeWidth="1.2" />
        <line x1="1" y1="5" x2="13" y2="5" stroke={stroke} strokeWidth="1.2" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" style={common}>
      <path d="M7,0 L14,4 L7,8 L0,4 Z" fill="none" stroke={stroke} strokeWidth="1.2" />
      <path d="M0,4 L0,10 L7,14 L7,8 Z" fill="none" stroke={stroke} strokeWidth="1.2" />
      <path d="M14,4 L14,10 L7,14 L7,8 Z" fill="none" stroke={stroke} strokeWidth="1.2" />
    </svg>
  );
}

function strokeDasharrayFor(strokeStyle: ShapeNodeData['strokeStyle'], strokeWidth: number): string | undefined {
  if (strokeStyle === 'dashed') return `${strokeWidth * 3} ${strokeWidth * 2}`;
  if (strokeStyle === 'dotted') return `${strokeWidth} ${strokeWidth * 1.5}`;
  return undefined;
}

function borderStyleFor(strokeStyle: ShapeNodeData['strokeStyle']): React.CSSProperties['borderStyle'] {
  return strokeStyle === 'dashed' ? 'dashed' : strokeStyle === 'dotted' ? 'dotted' : 'solid';
}

// Curated presets rather than free-form shadow-color/blur controls, matching
// the same "pick from a few good-looking options" pattern already used for
// presentation frame styling. The position/glow-intensity oscillation itself
// is animated (see sd-effect-* classes in index.css) — a real light source
// flickers and something floating gently bobs, neither sits at one fixed
// value — but the shadow that grounds "float" stays a plain static value;
// only the height it's cast from moves.
function effectBoxShadow(effect: ShapeNodeData['effect']): string | undefined {
  if (effect === 'shadow') return '0 6px 14px rgba(0,0,0,0.22), 0 2px 4px rgba(0,0,0,0.12)';
  if (effect === 'float') return '0 8px 14px rgba(0,0,0,0.16)';
  return undefined;
}

// Polygon shapes render as SVG, so a CSS boxShadow on their (transparent)
// bounding div would draw a rectangular shadow, not one following the actual
// visible outline — an SVG drop-shadow filter follows the real shape instead.
function effectDropShadowFilter(effect: ShapeNodeData['effect']): string | undefined {
  if (effect === 'shadow') return 'drop-shadow(0 6px 10px rgba(0,0,0,0.22)) drop-shadow(0 2px 3px rgba(0,0,0,0.12))';
  if (effect === 'float') return 'drop-shadow(0 6px 10px rgba(0,0,0,0.16))';
  return undefined;
}

function shapeClipStyle(kind: ShapeNodeData['kind'], cornerRadius: number): React.CSSProperties {
  switch (kind) {
    case 'ellipse':
      return { borderRadius: '50%' };
    case 'stickyNote':
      return { borderRadius: cornerRadius };
    case 'text':
      return { background: 'transparent', border: 'none' };
    default:
      return { borderRadius: cornerRadius };
  }
}

function defaultFill(kind: ShapeNodeData['kind']): string {
  if (kind === 'stickyNote') return '#FFF3B0';
  if (kind === 'text' || kind === 'icon' || kind === 'pieChart') return 'transparent';
  // Containers only ever paint this when their theme is 'filled' (plain/
  // header/swimlane force background:transparent regardless of fill), so a
  // normal visible default here doesn't leak into the other three themes.
  return '#E3EAFD';
}

const JUSTIFY_BY_ALIGN: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end', justify: 'flex-start' };
const ALIGN_ITEMS_BY_VERTICAL: Record<string, string> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };

// Extra, non-persisted fields injected by Canvas.tsx at render time so this
// leaf component can trigger a Firestore write / start a connector drag
// without owning the store.
export interface ShapeNodeRuntimeData {
  onCommit?: (id: string, patch: Partial<ShapeNodeData>) => void;
  onNavigateLink?: (id: string) => void;
  onStartConnect?: (id: string, e: React.MouseEvent) => void;
  connectMode?: boolean;
  readOnly?: boolean;
  directSelectMode?: boolean;
}

function ActorFigure({ stroke, strokeWidth }: { stroke: string; strokeWidth: number }) {
  const w = Math.max(1.5, strokeWidth * 1.6);
  return (
    <svg viewBox="0 0 60 92" style={{ width: '100%', flex: 1, minHeight: 0 }} preserveAspectRatio="xMidYMid meet">
      <circle cx="30" cy="14" r="12" fill="none" stroke={stroke} strokeWidth={w} />
      <line x1="30" y1="26" x2="30" y2="62" stroke={stroke} strokeWidth={w} />
      <line x1="8" y1="38" x2="52" y2="38" stroke={stroke} strokeWidth={w} />
      <line x1="30" y1="62" x2="10" y2="90" stroke={stroke} strokeWidth={w} />
      <line x1="30" y1="62" x2="50" y2="90" stroke={stroke} strokeWidth={w} />
    </svg>
  );
}

// Evenly-spaced divider lines across a container's swimlane theme, plus
// optional per-lane labels. `pointerEvents: 'none'` throughout — this is a
// decoration layer painted on top of the container's own box but underneath
// any child shapes dragged onto it, and must never intercept a click meant
// for either.
function SwimlaneOverlay({
  laneCount, orientation, labels, stroke, accentColor,
}: { laneCount: number; orientation: 'vertical' | 'horizontal'; labels?: string[]; stroke: string; accentColor?: string }) {
  const dividerCount = Math.max(0, laneCount - 1);
  const dividers = Array.from({ length: dividerCount }, (_, i) => ((i + 1) / laneCount) * 100);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {dividers.map((pct, i) => (
        <div
          key={i}
          style={orientation === 'vertical'
            ? { position: 'absolute', top: 0, bottom: 0, left: `${pct}%`, width: 1, background: stroke, opacity: 0.6 }
            : { position: 'absolute', left: 0, right: 0, top: `${pct}%`, height: 1, background: stroke, opacity: 0.6 }}
        />
      ))}
      {labels && labels.some(Boolean) && Array.from({ length: laneCount }, (_, i) => {
        const label = labels[i];
        if (!label) return null;
        const startPct = (i / laneCount) * 100, sizePct = (1 / laneCount) * 100;
        return (
          <div
            key={i}
            style={orientation === 'vertical'
              ? { position: 'absolute', top: 4, left: `${startPct}%`, width: `${sizePct}%`, textAlign: 'center', fontSize: 11, color: accentColor ?? '#555', fontWeight: 600 }
              : { position: 'absolute', left: 4, top: `${startPct}%`, height: `${sizePct}%`, display: 'flex', alignItems: 'center', fontSize: 11, color: accentColor ?? '#555', fontWeight: 600 }}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// Segments default to an evenly-split 3-wedge placeholder so a freshly
// placed pie chart never renders blank before the user has entered any data.
function PieChartSvg({ segments, innerRadiusFrac }: { segments?: PieSegment[]; innerRadiusFrac?: number }) {
  const data = segments && segments.length > 0 ? segments : DEFAULT_PIE_SEGMENTS;
  const total = data.reduce((sum, s) => sum + Math.max(0, s.value), 0) || 1;
  const cx = 50, cy = 50, r = 48;
  const innerR = Math.max(0, Math.min(0.85, innerRadiusFrac ?? 0)) * r;
  let angle = 0;
  const slices = data.map(seg => {
    const sweep = (Math.max(0, seg.value) / total) * 360;
    const start = angle;
    angle += sweep;
    return { seg, start, end: angle };
  });
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0 }}>
      {slices.map(({ seg, start, end }, i) => {
        if (end - start >= 359.99) {
          return innerR > 0 ? (
            <g key={seg.id ?? i}>
              <circle cx={cx} cy={cy} r={r} fill={seg.color} />
              <circle cx={cx} cy={cy} r={innerR} fill="#fff" />
            </g>
          ) : <circle key={seg.id ?? i} cx={cx} cy={cy} r={r} fill={seg.color} />;
        }
        const outerStart = polarToCartesian(cx, cy, r, start);
        const outerEnd = polarToCartesian(cx, cy, r, end);
        const largeArc = end - start > 180 ? 1 : 0;
        if (innerR <= 0) {
          const d = `M${cx},${cy} L${outerStart.x},${outerStart.y} A${r},${r} 0 ${largeArc} 1 ${outerEnd.x},${outerEnd.y} Z`;
          return <path key={seg.id ?? i} d={d} fill={seg.color} stroke="#fff" strokeWidth={0.5} />;
        }
        const innerStart = polarToCartesian(cx, cy, innerR, end);
        const innerEnd = polarToCartesian(cx, cy, innerR, start);
        const d = `M${outerStart.x},${outerStart.y} A${r},${r} 0 ${largeArc} 1 ${outerEnd.x},${outerEnd.y} L${innerStart.x},${innerStart.y} A${innerR},${innerR} 0 ${largeArc} 0 ${innerEnd.x},${innerEnd.y} Z`;
        return <path key={seg.id ?? i} d={d} fill={seg.color} stroke="#fff" strokeWidth={0.5} />;
      })}
    </svg>
  );
}

// Hand-rolled SVG, same convention as PieChartSvg above — bars/a polyline
// are strictly simpler than the arc math pie charts already need, so a
// charting library isn't warranted here either. Static data only (no live
// variable binding — see ChartDataPoint's doc comment for why).
function ChartSvg({ chartType, data }: { chartType?: 'bar' | 'line'; data?: ChartDataPoint[] }) {
  const points = data && data.length > 0 ? data : DEFAULT_CHART_DATA;
  const maxValue = Math.max(1, ...points.map(p => Math.max(0, p.value)));
  const padding = 6;
  const plotW = 100 - padding * 2;
  const plotH = 100 - padding * 2;
  const n = points.length;

  if (chartType === 'line') {
    const stepX = n > 1 ? plotW / (n - 1) : 0;
    const coords = points.map((p, i) => ({
      x: padding + i * stepX,
      y: padding + plotH * (1 - Math.max(0, p.value) / maxValue),
      p,
    }));
    const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');
    return (
      <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0 }}>
        <line x1={padding} y1={100 - padding} x2={100 - padding} y2={100 - padding} stroke="#e6e8ef" strokeWidth={0.5} />
        <path d={path} fill="none" stroke={coords[0]?.p.color ?? '#7C93E8'} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {coords.map((c, i) => <circle key={points[i].id} cx={c.x} cy={c.y} r={2} fill={c.p.color} />)}
      </svg>
    );
  }

  const gap = plotW / n * 0.2;
  const barW = plotW / n - gap;
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0 }}>
      <line x1={padding} y1={100 - padding} x2={100 - padding} y2={100 - padding} stroke="#e6e8ef" strokeWidth={0.5} />
      {points.map((p, i) => {
        const h = plotH * (Math.max(0, p.value) / maxValue);
        const x = padding + i * (barW + gap) + gap / 2;
        const y = 100 - padding - h;
        return <rect key={p.id} x={x} y={y} width={barW} height={h} fill={p.color} />;
      })}
    </svg>
  );
}

function ShapeNodeImpl({ id, data, selected, width, height }: NodeProps) {
  const shapeData = data as unknown as ShapeNodeData & ShapeNodeRuntimeData & {
    __resolvedStyle?: ResolvedStyle; __dimmed?: boolean; __hidden?: boolean;
  };
  const { updateNodeData } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(shapeData.label ?? '');

  const isArchimateElement = shapeData.kind === 'archimateElement';
  const resolved = shapeData.__resolvedStyle;
  const fill = resolved?.fill ?? shapeData.fillColor
    ?? (isArchimateElement ? ARCHIMATE_LAYER_COLORS[shapeData.archimateLayer ?? 'application'] : defaultFill(shapeData.kind));
  // A data-binding rule's resolved fill (dynamic, conditional) wins over a
  // manually-set gradient (static) — same precedence as opacity above.
  const fillCss = (!resolved?.fill && shapeData.fillGradient) ? buildGradientCss(shapeData.fillGradient) : fill;
  const stroke = resolved?.strokeColor ?? shapeData.strokeColor ?? '#7C93E8';
  const strokeWidth = resolved?.strokeWidth ?? shapeData.strokeWidth ?? (shapeData.kind === 'text' ? 0 : 1.5);
  const baseOpacity = (shapeData.opacity ?? 100) / 100;
  const opacity = shapeData.__hidden ? 0 : shapeData.__dimmed ? 0.2 : (resolved?.opacity ?? baseOpacity);
  const blurFilter = shapeData.blur ? `blur(${shapeData.blur}px)` : undefined;
  // flyIn/zoom entrance animations add a transform here, on the OUTERMOST
  // wrapper — every kind-specific branch below already has its own opacity
  // transition (each with its own inner rotation transform), so composing
  // an entrance transform on a shared parent avoids touching/duplicating
  // that per-branch logic while still animating in lockstep with the
  // existing opacity fade. 'fade' (the default, matching every shape's
  // pre-existing behavior) adds no transform at all.
  const animationDurationMs = shapeData.animationDuration ?? 300;
  const entranceTransform = shapeData.__hidden
    ? shapeData.animationType === 'flyIn' ? 'translateY(24px)'
      : shapeData.animationType === 'zoom' ? 'scale(0.5)'
        : undefined
    : undefined;
  const entranceTransition = shapeData.animationType && shapeData.animationType !== 'fade'
    ? `transform ${animationDurationMs}ms ease`
    : undefined;
  const rotation = shapeData.rotation ?? 0;
  const isSharpCorneredByDefault = ['umlClass', 'umlPackage', 'umlComponent', 'umlNote', 'archimateElement'].includes(shapeData.kind);
  const cornerRadius = shapeData.cornerRadius ?? (isSharpCorneredByDefault ? 0 : 4);
  const isText = shapeData.kind === 'text';
  const isImage = shapeData.kind === 'image';
  const isVideo = shapeData.kind === 'video';
  const isHotspot = shapeData.kind === 'hotspot';
  const isActor = shapeData.kind === 'umlActor';
  const isStickyNote = shapeData.kind === 'stickyNote';
  const isContainer = shapeData.kind === 'container';
  const isUmlClass = shapeData.kind === 'umlClass';
  const isUmlPackage = shapeData.kind === 'umlPackage';
  const isUmlComponent = shapeData.kind === 'umlComponent';
  const isUmlNote = shapeData.kind === 'umlNote';
  const isIcon = shapeData.kind === 'icon';
  const isPieChart = shapeData.kind === 'pieChart';
  const isChart = shapeData.kind === 'chart';
  const isTable = shapeData.kind === 'table';
  const isBrushStroke = shapeData.kind === 'brushStroke';
  const isCurved = CURVED_KINDS.has(shapeData.kind);
  const IconComponent = isIcon && shapeData.iconName ? getAntdIconComponent(shapeData.iconName) : undefined;
  // Kinds whose visual identity comes entirely from custom content (an icon
  // glyph, a pie's own slices, a vector outline, a table's own per-cell
  // borders) rather than the generic rect fill/border — the plain box
  // underneath must stay invisible so it doesn't show through as a stray
  // rectangle behind/around that content.
  const noBoxDecoration = isText || isIcon || isPieChart || isChart || isTable || POLYGON_KINDS.has(shapeData.kind) || isCurved;
  const containerTheme = shapeData.containerTheme ?? 'plain';
  const isPolygon = POLYGON_KINDS.has(shapeData.kind);
  const locked = !!shapeData.locked;
  const shiftHeld = useShiftHeld(!!selected && !locked);
  const effect = shapeData.effect ?? (isStickyNote ? 'shadow' : 'none');
  const effectShadow = effectBoxShadow(effect);
  // "float"/"glow" are CSS animations (see index.css), not static values — a
  // real light source flickers and something floating gently bobs, neither
  // sits at one fixed intensity/position. Div-based shapes animate
  // box-shadow; SVG-based polygon shapes animate an SVG filter instead,
  // since a boxShadow on their (transparent) bounding div would draw a
  // rectangular shadow rather than one following the actual outline.
  const glowCssVars = effect === 'glow' ? ({ ['--sd-glow-color' as string]: stroke } as React.CSSProperties) : {};

  function commitLabel() {
    setEditing(false);
    if (draft === shapeData.label) return;
    updateNodeData(id, { label: draft });
    shapeData.onCommit?.(id, { label: draft });
  }

  function commitRichText(paragraphs: NonNullable<ShapeNodeData['richText']>, plainText: string) {
    setEditing(false);
    updateNodeData(id, { richText: paragraphs, label: plainText });
    shapeData.onCommit?.(id, { richText: paragraphs, label: plainText });
  }

  const onRotateStart = useRotateHandle(id, rotation, shapeData.onCommit);

  const textStyle: React.CSSProperties = {
    fontSize: shapeData.fontSize ?? 13,
    color: shapeData.fontColor ?? '#1a1a2e',
    fontWeight: shapeData.fontWeight ?? 'normal',
    fontFamily: shapeData.fontFamily ?? 'inherit',
    fontStyle: shapeData.fontStyle ?? 'normal',
    textDecoration: shapeData.textDecoration ?? 'none',
    letterSpacing: shapeData.letterSpacing ?? 0,
    lineHeight: shapeData.lineHeight ?? 1.3,
  };

  // While the Arrow tool is active, the whole shape body is a connect
  // target/source (not just the tiny edge handles) — see Canvas.tsx's
  // connectMode. RF's own nodesDraggable/elementsSelectable are already
  // gated off in that mode, so this is safe to take over without fighting
  // normal node interaction.
  function handleMouseDown(e: React.MouseEvent) {
    if (shapeData.connectMode) {
      e.stopPropagation();
      shapeData.onStartConnect?.(id, e);
    }
  }

  return (
    // `filter` here (not scoped to just the shape's own content) means the
    // resize/rotate handles below blur slightly too while a blurred shape is
    // selected — a minor, worth-it tradeoff against threading blur through
    // every one of this component's many per-kind rendering branches below.
    <div
      style={{
        width: '100%', height: '100%', position: 'relative', filter: blurFilter,
        transform: entranceTransform, transition: entranceTransition,
      }}
      onMouseDown={handleMouseDown}
    >
      <NodeResizer
        isVisible={selected && !locked} minWidth={24} minHeight={24} keepAspectRatio={shiftHeld}
        // zIndex keeps these above the shape's own content div, which sits
        // later in the DOM and would otherwise win the default DOM-order
        // stacking at any point along the border it fully covers (only the
        // corners escaped this by accident, when cornerRadius rounds the
        // content div's hit-testable area away from the exact vertex).
        lineStyle={{ borderColor: '#1677ff', zIndex: 10 }}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, zIndex: 10 }}
      />
      {selected && !locked && <EdgeResizeHandles minWidth={24} minHeight={24} keepAspectRatio={shiftHeld} />}

      {selected && !locked && <RotateHandle onMouseDown={onRotateStart} />}

      {isHotspot ? (
        // A hotspot's whole purpose is carrying a link over a region of a
        // screen mockup — visible as a dashed marker while authoring, fully
        // invisible (but still clickable, since opacity:0 doesn't block
        // pointer events) once presenting so it doesn't show up on the mock.
        <div
          style={{
            width: '100%', height: '100%', borderRadius: 4, boxSizing: 'border-box',
            border: shapeData.readOnly ? 'none' : '1.5px dashed #ff5fc4',
            background: shapeData.readOnly ? 'transparent' : 'rgba(255, 95, 196, 0.12)',
            opacity: shapeData.readOnly ? 0 : opacity,
            transition: `opacity ${animationDurationMs}ms`,
          }}
        />
      ) : isImage ? (
        <div style={{ width: '100%', height: '100%', transform: `rotate(${rotation}deg)`, opacity, transition: `opacity ${animationDurationMs}ms` }}>
          {shapeData.imageUrl ? (
            <img
              src={shapeData.imageUrl}
              alt={shapeData.label ?? ''}
              draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', borderRadius: 4 }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', background: '#f0f1f5', border: '1px dashed #c4c9d6', borderRadius: 4 }} />
          )}
        </div>
      ) : isVideo ? (
        <div style={{ width: '100%', height: '100%', transform: `rotate(${rotation}deg)`, opacity, transition: `opacity ${animationDurationMs}ms` }}>
          {shapeData.videoUrl ? (
            <video
              src={shapeData.videoUrl}
              poster={shapeData.posterUrl}
              // Authoring: a static, draggable node (no controls, no pointer
              // events) — <video controls> otherwise captures mouse events in
              // a way that fights node dragging. Presenting (readOnly): the
              // real playback experience, node dragging is irrelevant there.
              controls={!!shapeData.readOnly && (shapeData.videoControls ?? true)}
              autoPlay={!!shapeData.readOnly && !!shapeData.videoAutoplay}
              loop={!!shapeData.videoLoop}
              muted={shapeData.videoMuted ?? true}
              playsInline
              draggable={false}
              style={{
                width: '100%', height: '100%', objectFit: 'contain', borderRadius: 4,
                pointerEvents: shapeData.readOnly ? 'auto' : 'none',
              }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', background: '#f0f1f5', border: '1px dashed #c4c9d6', borderRadius: 4 }} />
          )}
        </div>
      ) : isActor ? (
        <div
          style={{
            width: '100%', height: '100%', opacity, transition: `opacity ${animationDurationMs}ms`,
            transform: `rotate(${rotation}deg)`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
          }}
          onDoubleClick={() => { if (shapeData.readOnly || locked) return; setDraft(shapeData.label ?? ''); setEditing(true); }}
        >
          <ActorFigure stroke={stroke} strokeWidth={strokeWidth} />
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={e => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') setEditing(false); }}
              style={{ width: '90%', textAlign: 'center', border: 'none', outline: 'none', background: 'transparent', fontSize: 12 }}
            />
          ) : (
            shapeData.label && <span style={{ fontSize: 12, color: '#1a1a2e', userSelect: 'none' }}>{shapeData.label}</span>
          )}
        </div>
      ) : isBrushStroke ? (
        <svg
          width="100%" height="100%" preserveAspectRatio="none"
          viewBox={`0 0 ${shapeData.brushViewBoxWidth ?? 100} ${shapeData.brushViewBoxHeight ?? 100}`}
          style={{ display: 'block', opacity, transition: `opacity ${animationDurationMs}ms` }}
        >
          <BrushStamps
            points={shapeData.brushPoints ?? []}
            style={shapeData.brushStyle ?? 'pencil'}
            baseWidth={shapeData.brushBaseWidth ?? 6}
            color={stroke}
          />
        </svg>
      ) : isContainer ? (
        <div
          style={{
            width: '100%', height: '100%', opacity, transition: `opacity ${animationDurationMs}ms, background 0.3s`,
            transform: `rotate(${rotation}deg)`,
            boxSizing: 'border-box', position: 'relative',
            borderRadius: cornerRadius,
            border: `${strokeWidth}px solid ${stroke}`,
            borderStyle: borderStyleFor(shapeData.strokeStyle),
            background: containerTheme === 'filled' ? fillCss : 'transparent',
            boxShadow: effectShadow,
          }}
          onDoubleClick={() => { if (shapeData.readOnly || locked) return; setDraft(shapeData.label ?? ''); setEditing(true); }}
        >
          {containerTheme === 'header' ? (
            <div
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 28,
                background: shapeData.containerAccentColor ?? stroke,
                borderTopLeftRadius: cornerRadius, borderTopRightRadius: cornerRadius,
                display: 'flex', alignItems: 'center', padding: '0 8px', boxSizing: 'border-box',
                pointerEvents: editing ? 'auto' : 'none',
              }}
            >
              {editing ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onBlur={commitLabel}
                  onKeyDown={e => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') setEditing(false); }}
                  style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', color: '#fff', fontSize: 12, fontWeight: 600 }}
                />
              ) : (
                <span style={{ color: '#fff', fontSize: 12, fontWeight: 600, userSelect: 'none' }}>{shapeData.label}</span>
              )}
            </div>
          ) : (
            <div style={{ position: 'absolute', top: -20, left: 2, fontSize: 12, color: '#555', pointerEvents: editing ? 'auto' : 'none' }}>
              {editing ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onBlur={commitLabel}
                  onKeyDown={e => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') setEditing(false); }}
                  style={{ border: 'none', outline: 'none', background: 'transparent', color: '#555', fontSize: 12 }}
                />
              ) : (
                shapeData.label && <span style={{ userSelect: 'none' }}>{shapeData.label}</span>
              )}
            </div>
          )}
          {containerTheme === 'swimlane' && (
            <SwimlaneOverlay
              laneCount={shapeData.laneCount ?? 3}
              orientation={shapeData.laneOrientation ?? 'vertical'}
              labels={shapeData.laneLabels}
              stroke={stroke}
              accentColor={shapeData.containerAccentColor}
            />
          )}
        </div>
      ) : (
        <div
          // Rotation always lives on this outer div (it also carries the
          // label, which must rotate too — even for polygon kinds, where the
          // visible fill/stroke is the separate SVG backdrop below). "float"
          // combines rotate+translateY in one animated transform via
          // --sd-rot so the two don't fight over the same CSS property;
          // "glow" only touches box-shadow, so it composes with a plain
          // static rotate() with no conflict.
          className={effect === 'float' ? 'sd-effect-float' : effect === 'glow' && !isPolygon && !isCurved ? 'sd-effect-glow-box' : undefined}
          style={{
            width: '100%', height: '100%',
            transform: effect === 'float' ? undefined : `rotate(${rotation}deg)`,
            transition: `background 0.3s, opacity ${animationDurationMs}ms`,
            opacity,
            display: 'flex',
            alignItems: isUmlClass ? 'flex-start' : isText ? (ALIGN_ITEMS_BY_VERTICAL[shapeData.verticalAlign ?? 'middle']) : 'center',
            justifyContent: isText ? (JUSTIFY_BY_ALIGN[shapeData.textAlign ?? 'center']) : 'center',
            background: noBoxDecoration ? 'transparent' : fillCss,
            border: noBoxDecoration ? 'none' : `${strokeWidth}px solid ${stroke}`,
            borderStyle: noBoxDecoration ? undefined : borderStyleFor(shapeData.strokeStyle),
            boxShadow: noBoxDecoration ? undefined : effectShadow,
            boxSizing: 'border-box',
            padding: isUmlClass ? '8px 6px 6px' : isIcon || isPieChart || isChart ? 0 : 6,
            position: 'relative',
            ...(isPolygon || isCurved ? {} : shapeClipStyle(shapeData.kind, cornerRadius)),
            ...(effect === 'float' ? { ['--sd-rot' as string]: `${rotation}deg` } as React.CSSProperties : {}),
            ...(isPolygon || isCurved ? {} : effect === 'glow' ? glowCssVars : {}),
          }}
          onDoubleClick={() => { if (shapeData.readOnly || locked || isTable) return; setDraft(shapeData.label ?? ''); setEditing(true); }}
        >
          {isPolygon && (
            <svg
              className={effect === 'glow' ? 'sd-effect-glow-filter' : undefined}
              width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"
              style={{
                position: 'absolute', inset: 0,
                filter: effectDropShadowFilter(effect),
                ...(effect === 'glow' ? glowCssVars : {}),
              }}
            >
              <polygon
                points={POLYGON_POINTS[shapeData.kind]} fill={fill} stroke={stroke} strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharrayFor(shapeData.strokeStyle, strokeWidth)}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
          {isCurved && (
            <svg
              className={effect === 'glow' ? 'sd-effect-glow-filter' : undefined}
              width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"
              style={{
                position: 'absolute', inset: 0,
                filter: effectDropShadowFilter(effect),
                ...(effect === 'glow' ? glowCssVars : {}),
              }}
            >
              <path
                d={CURVED_PATHS[shapeData.kind]} fill={fill} stroke={stroke} strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharrayFor(shapeData.strokeStyle, strokeWidth)}
                vectorEffect="non-scaling-stroke"
              />
              {shapeData.kind === 'cylinder' && (
                <ellipse
                  cx={CYLINDER_RIM.cx} cy={CYLINDER_RIM.cy} rx={CYLINDER_RIM.rx} ry={CYLINDER_RIM.ry}
                  fill="none" stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
          )}
          {isPieChart && (
            <PieChartSvg segments={shapeData.pieSegments} innerRadiusFrac={shapeData.pieInnerRadius} />
          )}
          {isChart && (
            <ChartSvg chartType={shapeData.chartType} data={shapeData.chartData} />
          )}
          {isTable && (
            <TableGrid
              rows={shapeData.tableRows ?? 1}
              cols={shapeData.tableCols ?? 1}
              cells={shapeData.tableCells ?? []}
              stroke={stroke}
              fontSize={shapeData.fontSize ?? 12}
              locked={locked}
              onCommitCells={cells => {
                updateNodeData(id, { tableCells: cells });
                shapeData.onCommit?.(id, { tableCells: cells });
              }}
            />
          )}
          {isIcon && (
            IconComponent
              ? <IconComponent style={{ fontSize: Math.max(12, Math.min(width ?? 64, height ?? 64) * 0.6), color: stroke, pointerEvents: 'none' }} />
              : <span style={{ fontSize: 11, color: '#b0b6c8', pointerEvents: 'none' }}>Icon</span>
          )}
          {isArchimateElement && <ArchimateBadge family={archimateFamily(shapeData.archimateType)} stroke="#3a3a3a" />}
          {isStickyNote && (
            // A folded-corner "peel" — same fill, darkened, clipped to a
            // triangle at the bottom-right — is what actually reads as
            // "sticky note" rather than "yellow rectangle."
            <div style={{
              position: 'absolute', right: 0, bottom: 0, width: 18, height: 18,
              background: fill, filter: 'brightness(0.8)',
              clipPath: 'polygon(100% 0, 0% 100%, 100% 100%)',
              borderBottomRightRadius: cornerRadius,
            }} />
          )}
          {isUmlClass && (
            // Name/attributes/operations compartments — v1 only divides the
            // box; attribute/operation text entry is a natural fast-follow,
            // not needed for the shape to already read as "UML class."
            <>
              <div style={{ position: 'absolute', left: 0, right: 0, top: '33%', borderTop: `${strokeWidth}px solid ${stroke}`, pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, top: '66%', borderTop: `${strokeWidth}px solid ${stroke}`, pointerEvents: 'none' }} />
            </>
          )}
          {isUmlPackage && (
            // The small tab folder-icon shapes get, sitting flush against
            // the box's own top edge (border-bottom:none so the two read as
            // one continuous outline rather than two stacked boxes).
            <div style={{
              position: 'absolute', top: -10, left: 0, width: '45%', height: 10,
              background: fill, border: `${strokeWidth}px solid ${stroke}`, borderBottom: 'none',
              borderTopLeftRadius: 2, borderTopRightRadius: 2, pointerEvents: 'none',
            }} />
          )}
          {isUmlComponent && (
            // Two small notch rectangles straddling the left edge — the
            // standard UML component "plug" glyph.
            <>
              <div style={{ position: 'absolute', left: -8, top: '22%', width: 16, height: 10, background: fill, border: `${strokeWidth}px solid ${stroke}`, pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', left: -8, top: '60%', width: 16, height: 10, background: fill, border: `${strokeWidth}px solid ${stroke}`, pointerEvents: 'none' }} />
            </>
          )}
          {isUmlNote && (
            // Folded top-right corner, undyed (same fill as the shape,
            // unlike the sticky note's darkened peel) — the classic
            // UML note/comment "dog-ear."
            <svg width="16" height="16" viewBox="0 0 16 16" style={{ position: 'absolute', top: -1, right: -1, pointerEvents: 'none' }}>
              <path d="M0,0 L16,0 L16,16 Z" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
              <path d="M0,0 L16,16" stroke={stroke} strokeWidth={strokeWidth} />
            </svg>
          )}
          {isTable ? null : editing && isText ? (
            <RichTextEditor
              paragraphs={shapeData.richText ?? richTextFromLabel(shapeData.label ?? '')}
              baseStyle={textStyle}
              baseColorHex={shapeData.fontColor ?? '#1a1a2e'}
              textAlign={shapeData.textAlign ?? 'center'}
              onCommit={commitRichText}
              onCancel={() => setEditing(false)}
            />
          ) : editing ? (
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={e => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') setEditing(false); }}
              style={{
                width: '100%', textAlign: 'center', border: 'none', outline: 'none',
                background: 'transparent', fontFamily: 'inherit',
                fontSize: 13,
              }}
            />
          ) : isText ? (
            <RichTextDisplay
              paragraphs={shapeData.richText}
              label={shapeData.label}
              style={textStyle}
              textAlign={shapeData.textAlign ?? 'center'}
            />
          ) : (
            <span style={{
              textAlign: 'center', wordBreak: 'break-word', userSelect: 'none',
              fontFamily: isStickyNote ? "'Segoe Print', 'Bradley Hand', cursive" : 'inherit',
              fontSize: 13, color: '#1a1a2e',
            }}>
              {shapeData.label}
            </span>
          )}
        </div>
      )}

      {shapeData.link && !(isHotspot && shapeData.readOnly) && (
        <div
          onClick={e => { e.stopPropagation(); shapeData.onNavigateLink?.(id); }}
          title="Follow link"
          style={{
            position: 'absolute', bottom: -6, right: -6, width: 18, height: 18, borderRadius: '50%',
            background: '#1677ff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, cursor: 'pointer', zIndex: 6, border: '1.5px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          }}
        >
          <IconLink />
        </div>
      )}

      <ConnectionHandles visible={!!shapeData.connectMode} />
    </div>
  );
}

export const ShapeNode = memo(ShapeNodeImpl);
