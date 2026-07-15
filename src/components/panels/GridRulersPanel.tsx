import { Button, Select, Switch } from 'antd';
import { IconClose } from '../icons';
import { PeekableDrawer } from './PeekableDrawer';

interface Props {
  snapEnabled: boolean;
  onToggleSnap: (value: boolean) => void;
  gridSize: number;
  onGridSizeChange: (value: number) => void;
  showRulers: boolean;
  onToggleRulers: (value: boolean) => void;
  onClose: () => void;
}

export function GridRulersPanel({ snapEnabled, onToggleSnap, gridSize, onGridSizeChange, showRulers, onToggleRulers, onClose }: Props) {
  return (
    <PeekableDrawer>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#1a1a2e' }}>Grid &amp; Rulers</span>
        <Button size="small" type="text" icon={<IconClose />} onClick={onClose} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13 }}>Snap to grid</span>
          <Switch size="small" checked={snapEnabled} onChange={onToggleSnap} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13 }}>Grid size</span>
          <Select
            size="small" style={{ width: 90 }} value={gridSize} onChange={onGridSizeChange}
            options={[4, 8, 16, 24, 32].map(v => ({ value: v, label: `${v}px` }))}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13 }}>Show rulers</span>
          <Switch size="small" checked={showRulers} onChange={onToggleRulers} />
        </div>
      </div>
    </PeekableDrawer>
  );
}
