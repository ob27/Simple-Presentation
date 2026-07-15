import { Button } from 'antd';
import { IconClose } from '../icons';
import { PeekableDrawer } from './PeekableDrawer';

interface Props {
  title: string;
  description: string;
  onClose: () => void;
  extra?: React.ReactNode;
}

// Shared by every tool that genuinely has nothing to configure yet (Direct
// Selection, Hotspot, Comment) — a plain usage hint rather than fabricating
// controls that don't exist, plus an optional `extra` slot for the one case
// (Direct Selection) that does have something live to show.
export function ToolHintPanel({ title, description, onClose, extra }: Props) {
  return (
    <PeekableDrawer>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#1a1a2e' }}>{title}</span>
        <Button size="small" type="text" icon={<IconClose />} onClick={onClose} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12, color: '#999' }}>{description}</div>
        {extra}
      </div>
    </PeekableDrawer>
  );
}
