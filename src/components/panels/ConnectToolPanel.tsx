import { Button, Select } from 'antd';
import { IconClose } from '../icons';
import type { ConnectorDefaults } from '../../hooks/useToolDefaults';
import { PeekableDrawer } from './PeekableDrawer';

interface Props {
  defaults: ConnectorDefaults;
  onChange: (patch: Partial<ConnectorDefaults>) => void;
  onClose: () => void;
}

// Same four controls as the floating toolbar that appears when a single
// connector is already selected (Canvas.tsx) — that one edits an existing
// edge's committed data; this one only sets what a brand-new connector is
// born with. Both stay, they edit different things.
export function ConnectToolPanel({ defaults, onChange, onClose }: Props) {
  return (
    <PeekableDrawer>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#1a1a2e' }}>Arrow</span>
        <Button size="small" type="text" icon={<IconClose />} onClick={onClose} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 11, color: '#999' }}>Applies to the next connector you draw.</div>
        <div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Routing</div>
          <Select
            style={{ width: '100%' }}
            value={defaults.routing}
            options={[{ value: 'orthogonal', label: 'Elbow' }, { value: 'curved', label: 'Curved' }, { value: 'straight', label: 'Straight' }]}
            onChange={v => onChange({ routing: v })}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Animation</div>
          <Select
            style={{ width: '100%' }}
            value={defaults.flowAnimation}
            options={[{ value: 'none', label: 'No animation' }, { value: 'dash', label: 'Flow (dash)' }, { value: 'dot', label: 'Flow (dot)' }]}
            onChange={v => onChange({ flowAnimation: v })}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Start arrow</div>
          <Select
            style={{ width: '100%' }}
            value={defaults.startArrow}
            options={[{ value: 'none', label: 'None' }, { value: 'arrow', label: 'Arrow' }, { value: 'arrowClosed', label: 'Filled' }]}
            onChange={v => onChange({ startArrow: v })}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>End arrow</div>
          <Select
            style={{ width: '100%' }}
            value={defaults.endArrow}
            options={[{ value: 'none', label: 'None' }, { value: 'arrow', label: 'Arrow' }, { value: 'arrowClosed', label: 'Filled' }]}
            onChange={v => onChange({ endArrow: v })}
          />
        </div>
      </div>
    </PeekableDrawer>
  );
}
