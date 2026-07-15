import { Button, InputNumber, Radio } from 'antd';
import { IconClose } from '../icons';
import type { PenDefaults } from '../../hooks/useToolDefaults';
import { ColorPickerField } from './ColorPickerField';
import { PeekableDrawer } from './PeekableDrawer';

interface Props {
  defaults: PenDefaults;
  onChange: (patch: Partial<PenDefaults>) => void;
  onClose: () => void;
}

export function PenToolPanel({ defaults, onChange, onClose }: Props) {
  return (
    <PeekableDrawer>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#1a1a2e' }}>Pen</span>
        <Button size="small" type="text" icon={<IconClose />} onClick={onClose} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 11, color: '#999' }}>Applies to the next path you draw — doesn't affect existing paths.</div>
        <div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Stroke</div>
          <ColorPickerField value={defaults.strokeColor} onChangeComplete={hex => onChange({ strokeColor: hex })} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Stroke width</div>
          <InputNumber
            min={0} max={12} value={defaults.strokeWidth} style={{ width: '100%' }}
            onChange={v => onChange({ strokeWidth: v ?? 0 })}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Outline style</div>
          <Radio.Group
            size="small" value={defaults.strokeStyle}
            onChange={e => onChange({ strokeStyle: e.target.value })}
          >
            <Radio.Button value="solid">Solid</Radio.Button>
            <Radio.Button value="dashed">Dashed</Radio.Button>
            <Radio.Button value="dotted">Dotted</Radio.Button>
          </Radio.Group>
        </div>
      </div>
    </PeekableDrawer>
  );
}
