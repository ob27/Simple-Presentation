import { Button, InputNumber, Select } from 'antd';
import { IconClose } from '../icons';
import type { BrushDefaults } from '../../hooks/useToolDefaults';
import { ColorPickerField } from './ColorPickerField';
import { PeekableDrawer } from './PeekableDrawer';

interface Props {
  defaults: BrushDefaults;
  onChange: (patch: Partial<BrushDefaults>) => void;
  onClose: () => void;
}

export function BrushToolPanel({ defaults, onChange, onClose }: Props) {
  return (
    <PeekableDrawer>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#1a1a2e' }}>Brush</span>
        <Button size="small" type="text" icon={<IconClose />} onClick={onClose} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 11, color: '#999' }}>Applies to the next stroke you draw — doesn't affect existing strokes.</div>
        <div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Style</div>
          <Select
            style={{ width: '100%' }}
            value={defaults.brushStyle}
            options={[
              { value: 'pencil', label: 'Pencil' },
              { value: 'marker', label: 'Marker' },
              { value: 'calligraphy', label: 'Calligraphy' },
            ]}
            onChange={v => onChange({ brushStyle: v })}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Width</div>
          <InputNumber
            min={1} max={40} value={defaults.brushBaseWidth} style={{ width: '100%' }}
            onChange={v => onChange({ brushBaseWidth: v ?? 6 })}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Color</div>
          <ColorPickerField value={defaults.strokeColor} onChangeComplete={hex => onChange({ strokeColor: hex })} />
        </div>
      </div>
    </PeekableDrawer>
  );
}
