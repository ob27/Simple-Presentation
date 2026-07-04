import { Modal, Tabs } from 'antd';
import type { ShapeKind } from '../types/shapes';
import { SHAPE_CATALOG, ShapeSwatch, type ShapeCatalogEntry } from './ShapeSwatch';

const CATEGORIES = ['Basic', 'Flowchart', 'UML'] as const;

function ShapeCard({ entry, onClick }: { entry: ShapeCatalogEntry; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        border: '1.5px solid #e6e8ef', borderRadius: 8, padding: '14px 6px', cursor: 'pointer', textAlign: 'center',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#1677ff')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '#e6e8ef')}
    >
      <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ShapeSwatch kind={entry.kind} preview={entry.preview} />
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#1a1a2e' }}>{entry.label}</div>
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (kind: ShapeKind) => void;
}

// Modeled directly on NewPageModal.tsx's category-tabbed preset grid — one
// "Shapes" button opens this instead of a button per shape kind. Picking a
// card doesn't place anything immediately; it hands the kind back to
// Canvas.tsx, which enters click-to-place mode (closer to how a real drawing
// tool works than always plonking the shape at the viewport center).
export function ShapeGalleryModal({ open, onClose, onSelect }: Props) {
  return (
    <Modal title="Add a shape" open={open} onCancel={onClose} footer={null} destroyOnClose width={480}>
      <Tabs
        size="small"
        defaultActiveKey="Basic"
        items={CATEGORIES.map(category => ({
          key: category,
          label: category,
          children: (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, paddingTop: 8 }}>
              {SHAPE_CATALOG.filter(s => s.category === category).map(entry => (
                <ShapeCard key={entry.kind} entry={entry} onClick={() => { onSelect(entry.kind); onClose(); }} />
              ))}
            </div>
          ),
        }))}
      />
    </Modal>
  );
}
