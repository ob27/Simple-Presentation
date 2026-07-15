import { useMemo } from 'react';
import { useViewport } from '@xyflow/react';

// Same 96dpi-equivalent conversion ShapePropertiesPanel.tsx uses for its mm
// fields — keeps ruler units consistent with everything else that shows a
// physical measurement.
const PX_PER_MM = 96 / 25.4;
const TICK_STEPS_MM = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
export const RULER_THICKNESS = 20;

// Picks the smallest step from TICK_STEPS_MM whose on-screen spacing (at the
// current zoom) is still at least MIN_TICK_PX apart, so ticks stay legible
// whether zoomed way in or way out rather than at a fixed mm interval.
const MIN_TICK_PX = 50;
function pickStep(zoom: number): number {
  for (const step of TICK_STEPS_MM) {
    if (step * PX_PER_MM * zoom >= MIN_TICK_PX) return step;
  }
  return TICK_STEPS_MM[TICK_STEPS_MM.length - 1];
}

interface Props {
  orientation: 'horizontal' | 'vertical';
  viewport: { x: number; y: number; zoom: number };
  // Screen position (along the ruler's OWN measuring axis) where its strip
  // starts — both where its ticks begin counting from and its CSS offset
  // along that same axis.
  measureStart: number;
  // CSS inset along the PERPENDICULAR axis — e.g. the vertical ruler's
  // `left`, pushed right to clear the page-navigator rail. Unrelated to tick
  // math, which only cares about the measuring axis above.
  crossInset: number;
}

export function Ruler({ orientation, viewport, measureStart, crossInset }: Props) {
  const step = pickStep(viewport.zoom);
  const panOffset = orientation === 'horizontal' ? viewport.x : viewport.y;
  const stepPx = step * PX_PER_MM * viewport.zoom;

  const ticks = useMemo(() => {
    // mm value that would land at screen position `measureStart` (the
    // ruler's own start), then walk forward in whole `step` increments so
    // tick marks line up on round numbers rather than wherever panning
    // happened to land.
    const startWorldMm = (measureStart - panOffset) / (PX_PER_MM * viewport.zoom);
    const firstTick = Math.floor(startWorldMm / step) * step;
    const result: { mm: number; screenPos: number }[] = [];
    // A generous, fixed upper bound (200 ticks) rather than measuring the
    // real container length — this is a thin decorative overlay, and
    // `overflow: hidden` below already clips anything beyond the strip.
    for (let i = 0; i < 200; i++) {
      const mm = firstTick + i * step;
      const screenPos = mm * PX_PER_MM * viewport.zoom + panOffset;
      if (screenPos > 4000) break;
      if (screenPos >= measureStart - stepPx) result.push({ mm, screenPos });
    }
    return result;
  }, [measureStart, panOffset, step, stepPx, viewport.zoom]);

  const isHorizontal = orientation === 'horizontal';

  return (
    <div
      style={{
        position: 'absolute',
        ...(isHorizontal
          ? { top: 0, left: measureStart, right: 0, height: RULER_THICKNESS, borderBottom: '1px solid #e6e8ef' }
          : { top: measureStart, left: crossInset, bottom: 0, width: RULER_THICKNESS, borderRight: '1px solid #e6e8ef' }),
        background: '#fafbfc', overflow: 'hidden', pointerEvents: 'none', zIndex: 5,
      }}
    >
      {ticks.map(({ mm, screenPos }) => (
        <div
          key={mm}
          style={{
            position: 'absolute',
            ...(isHorizontal
              ? { left: screenPos - measureStart, top: 0, bottom: 0, borderLeft: '1px solid #c7cbd6' }
              : { top: screenPos - measureStart, left: 0, right: 0, borderTop: '1px solid #c7cbd6' }),
          }}
        >
          <span
            style={{
              position: 'absolute', fontSize: 9, color: '#8a93a6', left: 2, top: 1,
              ...(isHorizontal ? {} : { writingMode: 'vertical-rl' as const }),
            }}
          >
            {mm}
          </span>
        </div>
      ))}
    </div>
  );
}

// Subscribes to the live viewport itself (via useViewport, which re-renders
// on every pan/zoom frame) so that churn stays contained to this small
// component instead of the much larger Canvas.tsx re-rendering on every
// pan/zoom tick too.
export function RulerOverlay({ railWidth }: { railWidth: number }) {
  const viewport = useViewport();
  return (
    <>
      {/* Corner square where the two rulers meet, so neither strip's ticks run into the other's. */}
      <div style={{
        position: 'absolute', top: 0, left: railWidth, width: RULER_THICKNESS, height: RULER_THICKNESS,
        background: '#fafbfc', borderBottom: '1px solid #e6e8ef', borderRight: '1px solid #e6e8ef',
        zIndex: 6, pointerEvents: 'none',
      }} />
      <Ruler orientation="horizontal" viewport={viewport} measureStart={railWidth + RULER_THICKNESS} crossInset={0} />
      <Ruler orientation="vertical" viewport={viewport} measureStart={RULER_THICKNESS} crossInset={railWidth} />
    </>
  );
}
