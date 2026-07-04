import { UserOutlined } from '@ant-design/icons';
import type { ShapeKind } from '../types/shapes';

export interface ShapeCatalogEntry {
  kind: ShapeKind;
  label: string;
  category: 'Basic' | 'Flowchart' | 'UML';
  preview: React.CSSProperties;
}

export const SHAPE_CATALOG: ShapeCatalogEntry[] = [
  { kind: 'rectangle', label: 'Rectangle', category: 'Basic', preview: { borderRadius: 3 } },
  { kind: 'ellipse', label: 'Ellipse', category: 'Basic', preview: { borderRadius: '50%' } },
  { kind: 'diamond', label: 'Diamond', category: 'Basic', preview: { clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' } },
  { kind: 'stickyNote', label: 'Sticky note', category: 'Basic', preview: { borderRadius: 2, background: '#FFF3B0', border: '1px solid #E8D77A' } },
  { kind: 'text', label: 'Text', category: 'Basic', preview: {} },
  { kind: 'triangle', label: 'Triangle', category: 'Flowchart', preview: { clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)' } },
  { kind: 'parallelogram', label: 'Parallelogram', category: 'Flowchart', preview: { clipPath: 'polygon(20% 0%, 100% 0%, 80% 100%, 0% 100%)' } },
  { kind: 'hexagon', label: 'Hexagon', category: 'Flowchart', preview: { clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' } },
  { kind: 'umlActor', label: 'Actor', category: 'UML', preview: {} },
];

export function getShapePreviewStyle(kind: ShapeKind): React.CSSProperties {
  return SHAPE_CATALOG.find(e => e.kind === kind)?.preview ?? {};
}

// Text and Actor get a recognizable glyph instead of a near-blank box — the
// old palette's text button rendered as an unclear thin bar.
export function ShapeSwatch({ kind, preview }: { kind: ShapeKind; preview: React.CSSProperties }) {
  if (kind === 'text') return <span style={{ fontSize: 18, fontWeight: 700, color: '#555' }}>T</span>;
  if (kind === 'umlActor') return <UserOutlined style={{ fontSize: 22, color: '#8CA3E8' }} />;
  return <span style={{ width: 26, height: 26, display: 'block', background: '#8CA3E8', ...preview }} />;
}
