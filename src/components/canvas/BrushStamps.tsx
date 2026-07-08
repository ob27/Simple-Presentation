import type { BrushPoint } from '../../types/shapes';

interface Props {
  points: BrushPoint[];
  style: 'pencil' | 'marker' | 'calligraphy';
  baseWidth: number;
  color: string;
}

// A brush stroke isn't one continuous outline — it's stamped as many
// overlapping circles/ellipses along the captured path, one per sampled
// point, PLUS a round-capped connecting line between each consecutive pair
// — the connectors are what keep the stroke looking continuous when
// samples land far apart (a slow real mouse still fires plenty of
// mousemove events, but this makes the look robust either way rather than
// depending on sampling density). Shared between the live drawing preview
// and the finalized shape's render so both always look identical.
export function BrushStamps({ points, style, baseWidth, color }: Props) {
  if (points.length === 0) return null;

  if (style === 'marker') {
    // Markers/highlighters have a fixed nib width — pressure doesn't taper
    // it — and are translucent so overlapping strokes darken like real ink.
    const r = baseWidth * 1.4;
    return (
      <g opacity={0.5}>
        {points.slice(1).map((p, i) => (
          <line key={`l${i}`} x1={points[i].x} y1={points[i].y} x2={p.x} y2={p.y} stroke={color} strokeWidth={r * 2} strokeLinecap="round" />
        ))}
        {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={r} fill={color} />)}
      </g>
    );
  }

  if (style === 'calligraphy') {
    // A flat nib held at a fixed angle: wide along one axis, narrow along
    // the perpendicular, regardless of stroke direction — the classic
    // calligraphy-pen look. Connectors use the flattened (ry) width so the
    // segment between two stamps doesn't look thicker than the stamps
    // themselves along the nib's narrow axis.
    const angle = -45;
    return (
      <g>
        {points.slice(1).map((p, i) => {
          const prev = points[i];
          const ry = baseWidth * (0.5 + ((prev.pressure + p.pressure) / 2) * 0.6) * 0.3;
          return <line key={`l${i}`} x1={prev.x} y1={prev.y} x2={p.x} y2={p.y} stroke={color} strokeWidth={ry * 2} strokeLinecap="round" />;
        })}
        {points.map((p, i) => {
          const rx = baseWidth * (0.5 + p.pressure * 0.6);
          const ry = rx * 0.3;
          return <ellipse key={i} cx={p.x} cy={p.y} rx={rx} ry={ry} fill={color} transform={`rotate(${angle} ${p.x} ${p.y})`} />;
        })}
      </g>
    );
  }

  // Pencil (default): pressure tapers radius directly, slightly translucent
  // so overlapping passes build up graphite-like density.
  return (
    <g opacity={0.9}>
      {points.slice(1).map((p, i) => {
        const prev = points[i];
        const r = Math.max(0.6, (baseWidth / 2) * (0.4 + ((prev.pressure + p.pressure) / 2) * 0.6));
        return <line key={`l${i}`} x1={prev.x} y1={prev.y} x2={p.x} y2={p.y} stroke={color} strokeWidth={r * 2} strokeLinecap="round" />;
      })}
      {points.map((p, i) => {
        const r = Math.max(0.6, (baseWidth / 2) * (0.4 + p.pressure * 0.6));
        return <circle key={i} cx={p.x} cy={p.y} r={r} fill={color} />;
      })}
    </g>
  );
}
