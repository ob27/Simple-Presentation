import { VideoCameraOutlined } from '@ant-design/icons';
import { ShapeSwatch, getShapePreviewStyle } from '../ShapeSwatch';
import { getAntdIconComponent } from '../../utils/iconRegistry';
import type { ShapeKind } from '../../types/shapes';

interface Props {
  kind: ShapeKind | null;
  imageUrl?: string;
  iconName?: string;
  pos: { x: number; y: number } | null;
}

// Screen-space (position: fixed, NOT ViewportPortal) so the stamp tracks the
// raw mouse position and never pans/zooms with the canvas — it's a cursor
// replacement, not canvas content. Shown while a shape is armed for
// click-to-place, so it's obvious a shape is about to land and roughly where.
export function ShapeStampCursor({ kind, imageUrl, iconName, pos }: Props) {
  if (!kind || !pos) return null;
  const IconComponent = kind === 'icon' && iconName ? getAntdIconComponent(iconName) : undefined;

  return (
    <div
      style={{
        position: 'fixed', left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)',
        pointerEvents: 'none', zIndex: 1000,
        width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.9)', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}
    >
      {kind === 'image' && imageUrl ? (
        <img src={imageUrl} style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4 }} />
      ) : kind === 'video' ? (
        <VideoCameraOutlined style={{ fontSize: 22, color: '#7C93E8' }} />
      ) : kind === 'hotspot' ? (
        <span style={{ width: 26, height: 20, display: 'block', border: '1.5px dashed #ff5fc4', borderRadius: 3, background: 'rgba(255, 95, 196, 0.12)' }} />
      ) : IconComponent ? (
        <IconComponent style={{ fontSize: 22, color: '#7C93E8' }} />
      ) : (
        <ShapeSwatch kind={kind} preview={getShapePreviewStyle(kind)} />
      )}
    </div>
  );
}
