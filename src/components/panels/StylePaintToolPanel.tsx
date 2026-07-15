import { Button } from 'antd';
import { IconClose } from '../icons';
import type { ShapeNodeData } from '../../types/shapes';
import { PeekableDrawer } from './PeekableDrawer';

interface Props {
  source: Partial<ShapeNodeData> | null;
  onClear: () => void;
  onClose: () => void;
}

function Swatch({ color, label }: { color: string | undefined; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 20, height: 20, borderRadius: 4, border: '1px solid #e6e8ef', background: color ?? 'transparent' }} />
      <span style={{ fontSize: 12, color: '#666' }}>{label}</span>
    </div>
  );
}

export function StylePaintToolPanel({ source, onClear, onClose }: Props) {
  return (
    <PeekableDrawer>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#1a1a2e' }}>Style Paint</span>
        <Button size="small" type="text" icon={<IconClose />} onClick={onClose} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!source ? (
          <div style={{ fontSize: 12, color: '#999' }}>Click a shape to copy its look, then click others to apply it.</div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: '#666' }}>Style copied — click any shape to apply it.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Swatch color={source.fillColor} label="Fill" />
              <Swatch color={source.strokeColor} label="Stroke" />
            </div>
            <div style={{ fontSize: 11, color: '#999' }}>Also carries corner radius, effect, opacity, and text style.</div>
            <Button size="small" onClick={onClear} style={{ alignSelf: 'flex-start' }}>Clear</Button>
          </>
        )}
      </div>
    </PeekableDrawer>
  );
}
