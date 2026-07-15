import type { FillGradient } from '../types/shapes';

export function buildGradientCss(gradient: FillGradient): string {
  const stops = [...gradient.stops]
    .sort((a, b) => a.offset - b.offset)
    .map(s => `${s.color} ${s.offset}%`)
    .join(', ');
  if (gradient.type === 'radial') return `radial-gradient(circle, ${stops})`;
  return `linear-gradient(${gradient.angle ?? 90}deg, ${stops})`;
}

export function defaultGradient(baseColor: string): FillGradient {
  return { type: 'linear', angle: 90, stops: [{ color: baseColor, offset: 0 }, { color: '#ffffff', offset: 100 }] };
}
