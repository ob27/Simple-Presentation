import { IconPersonFallback } from './icons';
import type { ShapeKind, ShapeNodeData } from '../types/shapes';
import { CURATED_ICON_CATEGORIES, getAntdIconComponent, iconDisplayName } from '../utils/iconRegistry';

export interface ShapeCatalogEntry {
  kind: ShapeKind;
  label: string;
  category: 'Basic' | 'Flowchart' | 'UML' | 'Complex' | 'Icons' | 'ArchiMate';
  preview: React.CSSProperties;
  // Extra ShapeNodeData merged onto the placed shape — used by kinds whose
  // visual identity isn't determined by `kind` alone (which icon glyph,
  // which ArchiMate element type).
  extraData?: Partial<ShapeNodeData>;
}

const BASE_CATALOG: ShapeCatalogEntry[] = [
  { kind: 'rectangle', label: 'Rectangle', category: 'Basic', preview: { borderRadius: 3 } },
  { kind: 'ellipse', label: 'Ellipse', category: 'Basic', preview: { borderRadius: '50%' } },
  { kind: 'diamond', label: 'Diamond', category: 'Basic', preview: { clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' } },
  { kind: 'stickyNote', label: 'Sticky note', category: 'Basic', preview: { borderRadius: 2, background: '#FFF3B0', border: '1px solid #E8D77A' } },
  { kind: 'text', label: 'Text', category: 'Basic', preview: {} },
  { kind: 'triangle', label: 'Triangle', category: 'Flowchart', preview: { clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)' } },
  { kind: 'parallelogram', label: 'Parallelogram', category: 'Flowchart', preview: { clipPath: 'polygon(20% 0%, 100% 0%, 80% 100%, 0% 100%)' } },
  { kind: 'hexagon', label: 'Hexagon', category: 'Flowchart', preview: { clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' } },
  { kind: 'umlActor', label: 'Actor', category: 'UML', preview: {} },
  { kind: 'ellipse', label: 'Use Case', category: 'UML', preview: { borderRadius: '50%' } },
  { kind: 'umlClass', label: 'Class', category: 'UML', preview: {} },
  { kind: 'umlPackage', label: 'Package', category: 'UML', preview: {} },
  { kind: 'umlComponent', label: 'Component', category: 'UML', preview: {} },
  { kind: 'umlNote', label: 'Note', category: 'UML', preview: {} },
  { kind: 'cylinder', label: 'Cylinder', category: 'Complex', preview: {} },
  { kind: 'cloud', label: 'Cloud', category: 'Complex', preview: {} },
  { kind: 'cross', label: 'Cross', category: 'Complex', preview: {} },
  { kind: 'star', label: 'Star', category: 'Complex', preview: {} },
  { kind: 'document', label: 'Document', category: 'Complex', preview: {} },
  { kind: 'pieChart', label: 'Pie chart', category: 'Complex', preview: {} },
  { kind: 'table', label: 'Table', category: 'Complex', preview: {} },
  { kind: 'chart', label: 'Bar/line chart', category: 'Complex', preview: {} },
];

const ICON_CATALOG: ShapeCatalogEntry[] = CURATED_ICON_CATEGORIES.flatMap(({ icons }) =>
  icons.map((name): ShapeCatalogEntry => ({
    kind: 'icon',
    label: iconDisplayName(name),
    category: 'Icons',
    preview: {},
    extraData: { iconName: name },
  })),
);

const ARCHIMATE_ELEMENTS: { layer: 'business' | 'application' | 'technology'; type: string }[] = [
  { layer: 'business', type: 'Business Actor' },
  { layer: 'business', type: 'Business Role' },
  { layer: 'business', type: 'Business Process' },
  { layer: 'business', type: 'Business Object' },
  { layer: 'application', type: 'Application Component' },
  { layer: 'application', type: 'Application Function' },
  { layer: 'application', type: 'Application Service' },
  { layer: 'application', type: 'Data Object' },
  { layer: 'technology', type: 'Node' },
  { layer: 'technology', type: 'Device' },
  { layer: 'technology', type: 'System Software' },
  { layer: 'technology', type: 'Artifact' },
];

const ARCHIMATE_CATALOG: ShapeCatalogEntry[] = ARCHIMATE_ELEMENTS.map(({ layer, type }): ShapeCatalogEntry => ({
  kind: 'archimateElement',
  label: type,
  category: 'ArchiMate',
  preview: {},
  extraData: { archimateLayer: layer, archimateType: type },
}));

export const SHAPE_CATALOG: ShapeCatalogEntry[] = [...BASE_CATALOG, ...ICON_CATALOG, ...ARCHIMATE_CATALOG];

export function getShapePreviewStyle(kind: ShapeKind): React.CSSProperties {
  return SHAPE_CATALOG.find(e => e.kind === kind)?.preview ?? {};
}

const ARCHIMATE_LAYER_COLORS: Record<string, string> = {
  business: '#FFD97A',
  application: '#8CD9A8',
  technology: '#8CC6E8',
};

// Text and Actor get a recognizable glyph instead of a near-blank box — the
// old palette's text button rendered as an unclear thin bar.
export function ShapeSwatch({ kind, preview, extraData }: { kind: ShapeKind; preview: React.CSSProperties; extraData?: Partial<ShapeNodeData> }) {
  if (kind === 'text') return <span style={{ fontSize: 18, fontWeight: 700, color: '#555' }}>T</span>;
  if (kind === 'umlActor') return <IconPersonFallback style={{ fontSize: 22, color: '#8CA3E8' }} />;
  if (kind === 'icon') {
    const IconComponent = extraData?.iconName ? getAntdIconComponent(extraData.iconName) : undefined;
    return IconComponent ? <IconComponent style={{ fontSize: 22, color: '#5B6B99' }} /> : <span style={{ width: 26, height: 26, display: 'block', background: '#8CA3E8' }} />;
  }
  if (kind === 'archimateElement') {
    const color = ARCHIMATE_LAYER_COLORS[extraData?.archimateLayer ?? 'application'];
    return <span style={{ width: 26, height: 20, display: 'block', background: color, border: '1px solid rgba(0,0,0,0.25)', borderRadius: 2 }} />;
  }
  if (kind === 'cylinder') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24">
        <path d="M2 6 C2 4 22 4 22 6 L22 18 C22 20 2 20 2 18 Z" fill="#8CA3E8" stroke="#5B6B99" strokeWidth="1" />
        <ellipse cx="12" cy="6" rx="10" ry="2" fill="#8CA3E8" stroke="#5B6B99" strokeWidth="1" />
      </svg>
    );
  }
  if (kind === 'cloud') {
    return (
      <svg width="26" height="20" viewBox="0 0 26 20">
        <path d="M6 16 C2 16 2 10 6 9.5 C6 5 12 4 14 7 C18 5 22 8 20 11.5 C23 12 22 16 19 16 Z" fill="#8CA3E8" stroke="#5B6B99" strokeWidth="1" />
      </svg>
    );
  }
  if (kind === 'cross') {
    return <span style={{ width: 26, height: 26, display: 'block', background: '#8CA3E8', clipPath: 'polygon(35% 0%, 65% 0%, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0% 65%, 0% 35%, 35% 35%)' }} />;
  }
  if (kind === 'star') {
    return <span style={{ width: 26, height: 26, display: 'block', background: '#8CA3E8', clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' }} />;
  }
  if (kind === 'document') {
    return <span style={{ width: 24, height: 26, display: 'block', background: '#8CA3E8', clipPath: 'polygon(0% 0%, 100% 0%, 100% 85%, 50% 100%, 0% 85%)' }} />;
  }
  if (kind === 'pieChart') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" fill="#e6e8ef" />
        <path d="M12 12 L12 2 A10 10 0 0 1 20.5 17 Z" fill="#8CA3E8" />
      </svg>
    );
  }
  if (kind === 'chart') {
    return (
      <svg width="26" height="22" viewBox="0 0 26 22">
        <line x1="1" y1="21" x2="25" y2="21" stroke="#c4c9d6" strokeWidth="1" />
        <rect x="3" y="12" width="5" height="9" fill="#8CA3E8" />
        <rect x="11" y="6" width="5" height="15" fill="#8CD9A8" />
        <rect x="19" y="9" width="5" height="12" fill="#FFD97A" />
      </svg>
    );
  }
  if (kind === 'table') {
    return (
      <svg width="26" height="22" viewBox="0 0 26 22">
        <rect x="1" y="1" width="24" height="20" fill="none" stroke="#5B6B99" strokeWidth="1.5" />
        <line x1="1" y1="8" x2="25" y2="8" stroke="#5B6B99" strokeWidth="1" />
        <line x1="1" y1="15" x2="25" y2="15" stroke="#5B6B99" strokeWidth="1" />
        <line x1="9.5" y1="1" x2="9.5" y2="21" stroke="#5B6B99" strokeWidth="1" />
        <line x1="17" y1="1" x2="17" y2="21" stroke="#5B6B99" strokeWidth="1" />
      </svg>
    );
  }
  return <span style={{ width: 26, height: 26, display: 'block', background: '#8CA3E8', ...preview }} />;
}
