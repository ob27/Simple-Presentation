import { useRef, useState } from 'react';
import { Drawer, Button, message } from 'antd';
import { IconDelete, IconUpload } from './icons';
import { uploadNavLogo, deleteNavLogo, saveNavBgColor, type WorkspaceSettings } from '../utils/workspaceSettings';

interface Props {
  open: boolean;
  uid: string;
  settings: WorkspaceSettings;
  onChange: (settings: WorkspaceSettings) => void;
  onClose: () => void;
}

// Trimmed port of Simple AIM Kanban's "Workspace" drawer (nav background
// colour + nav logo only) — deliberately leaves out Kanban-specific parts
// of that drawer (the second board-logo slot, the "celebrate card moves"
// toggle, CSV/PDF export) since none of those concepts exist here.
export function WorkspaceSettingsDrawer({ open, uid, settings, onChange, onClose }: Props) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const navBg = settings.navBgColor || '#1a1a2e';

  async function handleColorChange(color: string) {
    onChange({ ...settings, navBgColor: color });
    try {
      await saveNavBgColor(uid, color);
    } catch {
      message.error('Failed to save colour');
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadNavLogo(uid, file);
      onChange({ ...settings, navLogoUrl: url });
    } catch {
      message.error('Failed to upload logo');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    setUploading(true);
    try {
      await deleteNavLogo(uid);
      onChange({ ...settings, navLogoUrl: null });
    } catch {
      message.error('Failed to remove logo');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Drawer title="Workspace" open={open} onClose={onClose} width={380}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#555', marginBottom: 3 }}>Navigation colour</div>
        <div style={{ fontSize: 11, color: '#aaa', marginBottom: 10 }}>Background colour of the top bar on the dashboard.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <div
              style={{ width: 36, height: 36, borderRadius: 8, cursor: 'pointer', background: navBg, border: '2px solid rgba(0,0,0,0.12)' }}
              onClick={() => document.getElementById('presentation-nav-color-input')?.click()}
            />
            <input
              id="presentation-nav-color-input"
              type="color"
              value={navBg}
              onChange={e => handleColorChange(e.target.value)}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
            />
          </div>
          <div style={{ fontSize: 12, color: '#888', fontFamily: 'monospace' }}>{navBg.toUpperCase()}</div>
          <Button size="small" type="text" style={{ color: '#aaa', fontSize: 11 }} onClick={() => handleColorChange('#1a1a2e')}>Reset</Button>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#555', marginBottom: 3 }}>Navigation logo</div>
        <div style={{ fontSize: 11, color: '#aaa', marginBottom: 10 }}>Replaces the "Simple Presentation" text. Use a light version for dark nav backgrounds.</div>
        {settings.navLogoUrl && (
          <div style={{ marginBottom: 10, padding: 10, background: navBg, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={settings.navLogoUrl} alt="logo preview" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
            <Button size="small" danger icon={<IconDelete />} loading={uploading} onClick={handleDelete}>Remove</Button>
          </div>
        )}
        <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.svg,.webp" onChange={handleUpload} style={{ display: 'none' }} />
        <Button icon={<IconUpload />} loading={uploading} onClick={() => fileRef.current?.click()} block>
          {settings.navLogoUrl ? 'Replace' : 'Upload'} logo
        </Button>
      </div>
    </Drawer>
  );
}
