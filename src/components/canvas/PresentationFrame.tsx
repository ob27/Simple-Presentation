import { AMBIENT_GRADIENT, type PresentationLayout } from '../../utils/presentationFrame';

interface Props {
  layout: PresentationLayout | null;
  windowSize: { width: number; height: number };
}

// One SVG path, evenodd-filled: the full viewport minus a rounded-rect hole
// exactly matching the screen rect. This is what actually hides canvas
// content outside the frame — a mathematically exact hole, not an
// approximation stitched together from rectangles and corner patches (which
// is what this used to be, and why the corners never quite lined up).
function buildMaskPath(windowW: number, windowH: number, r: { x: number; y: number; width: number; height: number }, radius: number) {
  const rad = Math.max(0, Math.min(radius, r.width / 2, r.height / 2));
  const outer = `M0,0 H${windowW} V${windowH} H0 Z`;
  if (rad === 0) {
    const inner = `M${r.x},${r.y} H${r.x + r.width} V${r.y + r.height} H${r.x} Z`;
    return `${outer} ${inner}`;
  }
  const x0 = r.x, y0 = r.y, x1 = r.x + r.width, y1 = r.y + r.height;
  const inner = [
    `M${x0 + rad},${y0}`,
    `H${x1 - rad}`, `A${rad},${rad} 0 0 1 ${x1},${y0 + rad}`,
    `V${y1 - rad}`, `A${rad},${rad} 0 0 1 ${x1 - rad},${y1}`,
    `H${x0 + rad}`, `A${rad},${rad} 0 0 1 ${x0},${y1 - rad}`,
    `V${y0 + rad}`, `A${rad},${rad} 0 0 1 ${x0 + rad},${y0}`,
    'Z',
  ].join(' ');
  return `${outer} ${inner}`;
}

export function PresentationFrame({ layout, windowSize }: Props) {
  if (!layout || layout.fullscreen) return null;
  const { screenRect: r, bezel, outerRadius, frameKind, bezelColor, hasNotch, hasHomeIndicator, hasCrown } = layout;
  const windowW = windowSize.width;
  const windowH = windowSize.height;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 15 }}>
      {/*
        backgroundAttachment: 'fixed' makes this div reveal a slice of one
        continuous virtual gradient (the exact same one PresentationView's
        real background paints), so the masked area reads as "the page
        background showing through," not as a separate colored layer.
      */}
      <div style={{
        position: 'fixed', inset: 0, background: AMBIENT_GRADIENT, backgroundAttachment: 'fixed',
        clipPath: `path(evenodd, "${buildMaskPath(windowW, windowH, r, outerRadius)}")`,
      }} />
      {bezel > 0 && (
        <div style={{
          position: 'absolute', left: r.x, top: r.y, width: r.width, height: r.height,
          borderRadius: outerRadius,
          boxShadow: `0 0 0 ${bezel}px ${bezelColor}, 0 30px 70px -12px rgba(0,0,0,0.6)`,
        }} />
      )}
      {hasNotch && (
        <div style={{
          position: 'absolute', left: r.x + r.width / 2, top: r.y + 6, transform: 'translateX(-50%)',
          width: r.width * 0.32, height: 22, background: bezelColor, borderRadius: 14,
        }} />
      )}
      {hasHomeIndicator && (
        // mix-blend-mode: difference keeps this visible over ANY page
        // content color (white, black, or anything between), rather than
        // going invisible against a plain white mockup page.
        <div style={{
          position: 'absolute', left: r.x + r.width / 2, top: r.y + r.height - 14, transform: 'translateX(-50%)',
          width: r.width * 0.28, height: 5, background: '#888', mixBlendMode: 'difference', borderRadius: 3,
        }} />
      )}
      {hasCrown && (
        <div style={{
          position: 'absolute', left: r.x + r.width + bezel - 3, top: r.y + r.height * 0.3,
          width: 8, height: r.height * 0.16, background: bezelColor, borderRadius: 3,
        }} />
      )}
      {frameKind === 'slide' && bezel === 0 && (
        // No hard bezel for a plain slide — a soft ambient glow under the
        // page reads as "floating," matching a deck/keynote presentation feel.
        <div style={{
          position: 'absolute', left: r.x, top: r.y, width: r.width, height: r.height,
          borderRadius: outerRadius, boxShadow: '0 30px 80px -15px rgba(0,0,0,0.5)',
        }} />
      )}
    </div>
  );
}
