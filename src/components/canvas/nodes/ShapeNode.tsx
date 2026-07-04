import { memo, useState } from 'react';
import { NodeResizer, useReactFlow, type NodeProps } from '@xyflow/react';
import { LinkOutlined } from '@ant-design/icons';
import type { ShapeNodeData } from '../../../types/shapes';
import type { ResolvedStyle } from '../../../utils/shapeStyleResolver';
import { useRotateHandle } from './useRotateHandle';
import { RotateHandle } from './RotateHandle';
import { ConnectionHandles } from './ConnectionHandles';

// Kinds whose outline can't be drawn with a plain CSS border — clip-path
// cuts the box down to the polygon shape, which clips the rectangular border
// away to invisible slivers at the few points where the polygon touches the
// original box edge. These render as an SVG <polygon> instead (below), which
// can carry a real fill AND stroke along its actual visible edge.
const POLYGON_KINDS = new Set<ShapeNodeData['kind']>(['diamond', 'triangle', 'parallelogram', 'hexagon']);

const POLYGON_POINTS: Record<string, string> = {
  diamond: '50,0 100,50 50,100 0,50',
  triangle: '50,0 100,100 0,100',
  parallelogram: '20,0 100,0 80,100 0,100',
  hexagon: '25,0 75,0 100,50 75,100 25,100 0,50',
};

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
  if (kind === 'text') return 'transparent';
  return '#E3EAFD';
}

const JUSTIFY_BY_ALIGN: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' };

// Extra, non-persisted fields injected by Canvas.tsx at render time so this
// leaf component can trigger a Firestore write / start a connector drag
// without owning the store.
export interface ShapeNodeRuntimeData {
  onCommit?: (id: string, patch: Partial<ShapeNodeData>) => void;
  onNavigateLink?: (id: string) => void;
  onStartConnect?: (id: string, e: React.MouseEvent) => void;
  connectMode?: boolean;
  readOnly?: boolean;
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

function ShapeNodeImpl({ id, data, selected }: NodeProps) {
  const shapeData = data as unknown as ShapeNodeData & ShapeNodeRuntimeData & {
    __resolvedStyle?: ResolvedStyle; __dimmed?: boolean; __hidden?: boolean;
  };
  const { updateNodeData } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(shapeData.label ?? '');

  const resolved = shapeData.__resolvedStyle;
  const fill = resolved?.fill ?? shapeData.fillColor ?? defaultFill(shapeData.kind);
  const stroke = resolved?.strokeColor ?? shapeData.strokeColor ?? '#7C93E8';
  const strokeWidth = resolved?.strokeWidth ?? shapeData.strokeWidth ?? (shapeData.kind === 'text' ? 0 : 1.5);
  const opacity = shapeData.__hidden ? 0 : shapeData.__dimmed ? 0.2 : (resolved?.opacity ?? 1);
  const rotation = shapeData.rotation ?? 0;
  const cornerRadius = shapeData.cornerRadius ?? 4;
  const isText = shapeData.kind === 'text';
  const isImage = shapeData.kind === 'image';
  const isHotspot = shapeData.kind === 'hotspot';
  const isActor = shapeData.kind === 'umlActor';
  const isStickyNote = shapeData.kind === 'stickyNote';
  const isPolygon = POLYGON_KINDS.has(shapeData.kind);
  const locked = !!shapeData.locked;
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

  const onRotateStart = useRotateHandle(id, rotation, shapeData.onCommit);

  const textStyle: React.CSSProperties = {
    fontSize: shapeData.fontSize ?? 13,
    color: shapeData.fontColor ?? '#1a1a2e',
    fontWeight: shapeData.fontWeight ?? 'normal',
    fontFamily: shapeData.fontFamily ?? 'inherit',
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
    <div style={{ width: '100%', height: '100%', position: 'relative' }} onMouseDown={handleMouseDown}>
      <NodeResizer isVisible={selected && !locked} minWidth={24} minHeight={24} lineStyle={{ borderColor: '#1677ff' }} handleStyle={{ width: 8, height: 8, borderRadius: 2 }} />

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
            transition: 'opacity 0.3s',
          }}
        />
      ) : isImage ? (
        <div style={{ width: '100%', height: '100%', transform: `rotate(${rotation}deg)`, opacity, transition: 'opacity 0.3s' }}>
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
      ) : isActor ? (
        <div
          style={{
            width: '100%', height: '100%', opacity, transition: 'opacity 0.3s',
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
      ) : (
        <div
          // Rotation always lives on this outer div (it also carries the
          // label, which must rotate too — even for polygon kinds, where the
          // visible fill/stroke is the separate SVG backdrop below). "float"
          // combines rotate+translateY in one animated transform via
          // --sd-rot so the two don't fight over the same CSS property;
          // "glow" only touches box-shadow, so it composes with a plain
          // static rotate() with no conflict.
          className={effect === 'float' ? 'sd-effect-float' : effect === 'glow' && !isPolygon ? 'sd-effect-glow-box' : undefined}
          style={{
            width: '100%', height: '100%',
            transform: effect === 'float' ? undefined : `rotate(${rotation}deg)`,
            transition: 'background 0.3s, opacity 0.3s',
            opacity,
            display: 'flex', alignItems: 'center', justifyContent: isText ? (JUSTIFY_BY_ALIGN[shapeData.textAlign ?? 'center']) : 'center',
            background: isPolygon ? 'transparent' : fill,
            border: isText || isPolygon ? 'none' : `${strokeWidth}px solid ${stroke}`,
            borderStyle: isText || isPolygon ? undefined : borderStyleFor(shapeData.strokeStyle),
            boxShadow: isPolygon ? undefined : effectShadow,
            boxSizing: 'border-box',
            padding: 6,
            position: 'relative',
            ...(isPolygon ? {} : shapeClipStyle(shapeData.kind, cornerRadius)),
            ...(effect === 'float' ? { ['--sd-rot' as string]: `${rotation}deg` } as React.CSSProperties : {}),
            ...(isPolygon ? {} : effect === 'glow' ? glowCssVars : {}),
          }}
          onDoubleClick={() => { if (shapeData.readOnly || locked) return; setDraft(shapeData.label ?? ''); setEditing(true); }}
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
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={e => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') setEditing(false); }}
              style={{
                width: '100%', textAlign: isText ? (shapeData.textAlign ?? 'center') : 'center', border: 'none', outline: 'none',
                background: 'transparent', fontFamily: 'inherit',
                ...(isText ? textStyle : { fontSize: 13 }),
              }}
            />
          ) : (
            <span style={{
              textAlign: isText ? (shapeData.textAlign ?? 'center') : 'center', wordBreak: 'break-word', userSelect: 'none',
              fontFamily: isStickyNote ? "'Segoe Print', 'Bradley Hand', cursive" : 'inherit',
              ...(isText ? textStyle : { fontSize: 13, color: '#1a1a2e' }),
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
          <LinkOutlined />
        </div>
      )}

      <ConnectionHandles visible={!!shapeData.connectMode} />
    </div>
  );
}

export const ShapeNode = memo(ShapeNodeImpl);
