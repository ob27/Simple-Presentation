import { Tooltip } from 'antd';
import type { ShapeKind, ShapeNodeData } from '../../types/shapes';
import { SHAPE_CATALOG, ShapeSwatch } from '../ShapeSwatch';
import type { FavoriteShapeId } from '../../hooks/useFavoriteShapes';

interface Props {
  favorites: FavoriteShapeId[];
  activeKind: ShapeKind | null;
  onPlace: (kind: ShapeKind, extraData?: Partial<ShapeNodeData>) => void;
}

// Docked just right of the page rail (which owns the full left edge already)
// rather than overlapping it — a small glance-and-click strip for the
// handful of shapes a user reaches for constantly, so they're not stuck
// reopening the full 301-entry gallery for the same few shapes every time.
// Favorites themselves are curated from the gallery's own star toggle (see
// ShapeGalleryModal.tsx) — this panel is read-only quick access, not where
// you manage the set.
export function FavoriteShapesPanel({ favorites, activeKind, onPlace }: Props) {
  if (favorites.length === 0) return null;

  return (
    <div style={{
      position: 'absolute', left: 178, bottom: 16, zIndex: 10,
      background: '#fff', border: '1px solid #e6e8ef', borderRadius: 10,
      boxShadow: '0 2px 10px rgba(0,0,0,0.08)', padding: 6,
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      {favorites.map(fav => {
        const entry = SHAPE_CATALOG.find(e => e.kind === fav.kind && e.label === fav.label);
        if (!entry) return null;
        const active = activeKind === entry.kind;
        return (
          <Tooltip key={`${entry.kind}-${entry.label}`} title={entry.label} placement="right">
            <button
              onClick={() => onPlace(entry.kind, entry.extraData)}
              style={{
                width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `1px solid ${active ? '#1677ff' : '#e6e8ef'}`, borderRadius: 6, cursor: 'pointer',
                background: active ? '#EEF4FF' : '#fff', padding: 0,
              }}
            >
              <div style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShapeSwatch kind={entry.kind} preview={entry.preview} extraData={entry.extraData} />
              </div>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
