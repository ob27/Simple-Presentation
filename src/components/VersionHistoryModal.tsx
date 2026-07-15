import { useEffect, useState } from 'react';
import { Modal, Button, Input, Popconfirm, Empty, message } from 'antd';
import { IconSave, IconHistory, IconDelete } from './icons';
import { subscribeVersions, saveVersion, restoreVersion, deleteVersion, type DiagramVersion } from '../store';

interface Props {
  open: boolean;
  onClose: () => void;
  diagramId: string;
  uid: string;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  });
}

// A version is an explicit, whole-document snapshot the user takes on demand
// (no automatic/debounced saving — see store.ts's own doc comment on why),
// so this modal is intentionally just a flat list + Save/Restore/Delete,
// with no diffing between versions.
export function VersionHistoryModal({ open, onClose, diagramId, uid }: Props) {
  const [versions, setVersions] = useState<DiagramVersion[]>([]);
  const [saving, setSaving] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    if (!open) return;
    return subscribeVersions(diagramId, setVersions);
  }, [open, diagramId]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveVersion(diagramId, uid, name.trim() || undefined);
      setName('');
      message.success('Version saved');
    } catch {
      message.error('Failed to save version');
    } finally {
      setSaving(false);
    }
  }

  async function handleRestore(version: DiagramVersion) {
    setRestoringId(version.id);
    try {
      await restoreVersion(diagramId, version);
      message.success('Version restored');
      onClose();
    } catch {
      message.error('Failed to restore version');
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <Modal title="Version history" open={open} onCancel={onClose} footer={null} destroyOnClose>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input
            placeholder="Version name (optional)"
            value={name}
            onChange={e => setName(e.target.value)}
            onPressEnter={handleSave}
          />
          <Button type="primary" icon={<IconSave />} loading={saving} onClick={handleSave}>
            Save version
          </Button>
        </div>

        {versions.length === 0 ? (
          <Empty description="No versions saved yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
            {versions.map(v => (
              <div
                key={v.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', border: '1px solid #f0f0f0', borderRadius: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <IconHistory style={{ color: '#999' }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {v.name || formatTimestamp(v.createdAt)}
                    </div>
                    {v.name && <div style={{ fontSize: 11, color: '#999' }}>{formatTimestamp(v.createdAt)}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <Popconfirm
                    title="Restore this version?"
                    description="This overwrites the current document with this version's content."
                    onConfirm={() => handleRestore(v)}
                    okText="Restore"
                  >
                    <Button size="small" loading={restoringId === v.id}>Restore</Button>
                  </Popconfirm>
                  <Popconfirm title="Delete this version?" onConfirm={() => deleteVersion(diagramId, v.id)} okText="Delete" okButtonProps={{ danger: true }}>
                    <Button size="small" type="text" danger icon={<IconDelete />} />
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
