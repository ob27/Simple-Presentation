import { useState } from 'react';
import { Button, Tabs, Input, Tooltip } from 'antd';
import { IconClose, IconStar, IconStarFilled } from '../icons';
import type { ShapeKind, ShapeNodeData } from '../../types/shapes';
import { SHAPE_CATALOG, ShapeSwatch, type ShapeCatalogEntry } from '../ShapeSwatch';
import { MAX_FAVORITE_SHAPES } from '../../hooks/useFavoriteShapes';
import { PeekableDrawer } from './PeekableDrawer';

const CATEGORIES = ['Basic', 'Flowchart', 'UML', 'Complex', 'Icons', 'ArchiMate'] as const;

function ShapeCard({ entry, onClick, favorited, favoritesFull, onToggleFavorite }: {
  entry: ShapeCatalogEntry;
  onClick: () => void;
  favorited: boolean;
  favoritesFull: boolean;
  onToggleFavorite: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative', border: '1.5px solid #e6e8ef', borderRadius: 8, padding: '10px 4px', cursor: 'pointer', textAlign: 'center',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#1677ff')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '#e6e8ef')}
    >
      <Tooltip title={favorited ? 'Remove from favorites' : favoritesFull ? `Favorites full (max ${MAX_FAVORITE_SHAPES}) — remove one first` : 'Add to favorites'}>
        <button
          onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
          disabled={!favorited && favoritesFull}
          style={{
            position: 'absolute', top: 2, right: 2, border: 'none', background: 'transparent', padding: 2,
            cursor: !favorited && favoritesFull ? 'default' : 'pointer', color: favorited ? '#f5a623' : '#ccc',
            display: 'flex', opacity: !favorited && favoritesFull ? 0.4 : 1,
          }}
        >
          {favorited ? <IconStarFilled style={{ fontSize: 11 }} /> : <IconStar style={{ fontSize: 11 }} />}
        </button>
      </Tooltip>
      <div style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ShapeSwatch kind={entry.kind} preview={entry.preview} extraData={entry.extraData} />
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{entry.label}</div>
    </div>
  );
}

interface Props {
  onSelect: (kind: ShapeKind, extraData?: Partial<ShapeNodeData>) => void;
  isFavorite: (kind: string, label: string) => boolean;
  favoritesFull: boolean;
  onToggleFavorite: (kind: string, label: string) => void;
  onClose: () => void;
}

// Ported from the old ShapeGalleryModal (an antd Modal) into the same
// right-side PeekableDrawer every other tool now uses. The old "Keep open"
// switch is gone — a Modal had to explicitly close-then-reopen to place more
// than one shape (it has no notion of "stay open while the canvas is also
// interactive"); a non-modal panel just... stays open, matching every other
// panel's own "stays put until its own close button" behavior. Picking a
// shape arms placement (via onSelect) without touching this panel at all, so
// placing several shapes in a row needs no extra toggle.
export function ShapeGalleryPanel({ onSelect, isFavorite, favoritesFull, onToggleFavorite, onClose }: Props) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();

  return (
    <PeekableDrawer width={320}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#1a1a2e' }}>Shapes</span>
        <Button size="small" type="text" icon={<IconClose />} onClick={onClose} />
      </div>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
        <Input.Search
          placeholder="Search shapes and icons"
          value={search}
          onChange={e => setSearch(e.target.value)}
          allowClear
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
        <Tabs
          size="small"
          defaultActiveKey="Basic"
          items={CATEGORIES.map(category => {
            const entries = SHAPE_CATALOG.filter(s => s.category === category && (!query || s.label.toLowerCase().includes(query)));
            return {
              key: category,
              label: category,
              children: (
                <div style={{ maxHeight: 460, overflowY: 'auto', paddingTop: 4 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {entries.map(entry => (
                      <ShapeCard
                        key={`${entry.kind}-${entry.label}`}
                        entry={entry}
                        onClick={() => onSelect(entry.kind, entry.extraData)}
                        favorited={isFavorite(entry.kind, entry.label)}
                        favoritesFull={favoritesFull}
                        onToggleFavorite={() => onToggleFavorite(entry.kind, entry.label)}
                      />
                    ))}
                  </div>
                  {entries.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#999', fontSize: 12, padding: '24px 0' }}>No matches</div>
                  )}
                </div>
              ),
            };
          })}
        />
      </div>
    </PeekableDrawer>
  );
}
