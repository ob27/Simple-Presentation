import { useEffect, useState } from 'react';
import { Modal, Tabs, Input, Button, Spin, message } from 'antd';
import { FileAddOutlined } from '@ant-design/icons';
import {
  subscribeBuiltInTemplates, subscribeMyTemplates, createDiagram, createDiagramFromTemplate,
} from '../store';
import type { DiagramDocument } from '../types/document';

interface Props {
  open: boolean;
  uid: string;
  email?: string;
  onClose: () => void;
  onCreated: (diagramId: string) => void;
}

type Selection = { type: 'blank' } | { type: 'template'; template: DiagramDocument };

function TemplateCard({ label, description, onClick }: { label: React.ReactNode; description?: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        border: '1px solid #e6e8ef', borderRadius: 10, padding: 14, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 4, minHeight: 84,
        background: '#fff', transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      <span style={{ fontWeight: 600, fontSize: 14, color: '#1a1a2e' }}>{label}</span>
      {description && <span style={{ fontSize: 12, color: '#888' }}>{description}</span>}
    </div>
  );
}

export function TemplateGalleryModal({ open, uid, email, onClose, onCreated }: Props) {
  const [builtIn, setBuiltIn] = useState<DiagramDocument[]>([]);
  const [mine, setMine] = useState<DiagramDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    let pending = 2;
    const done = () => { pending -= 1; if (pending === 0) setLoading(false); };
    const unsub1 = subscribeBuiltInTemplates(ts => { setBuiltIn(ts); done(); });
    const unsub2 = subscribeMyTemplates(uid, ts => { setMine(ts); done(); });
    return () => { unsub1(); unsub2(); };
  }, [open, uid]);

  useEffect(() => {
    if (!open) { setSelection(null); setName(''); }
  }, [open]);

  function chooseBlank() {
    setSelection({ type: 'blank' });
    setName('Untitled diagram');
  }
  function chooseTemplate(template: DiagramDocument) {
    setSelection({ type: 'template', template });
    setName(template.name);
  }

  async function handleCreate() {
    if (!selection || !name.trim()) return;
    setCreating(true);
    try {
      const diagram = selection.type === 'blank'
        ? await createDiagram(uid, name.trim(), email)
        : await createDiagramFromTemplate(selection.template.id, name.trim(), uid, email);
      onCreated(diagram.id);
    } catch {
      message.error('Failed to create diagram');
    } finally {
      setCreating(false);
    }
  }

  const grid = (templates: DiagramDocument[], emptyLabel: string) => (
    loading ? (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}><Spin /></div>
    ) : templates.length === 0 ? (
      <div style={{ textAlign: 'center', color: '#aaa', fontSize: 13, padding: '32px 0' }}>{emptyLabel}</div>
    ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, paddingTop: 4 }}>
        {templates.map(t => (
          <TemplateCard key={t.id} label={t.name} description={t.templateDescription} onClick={() => chooseTemplate(t)} />
        ))}
      </div>
    )
  );

  return (
    <Modal
      title={selection ? 'Name your diagram' : 'New Diagram'}
      open={open}
      onCancel={onClose}
      footer={selection ? [
        <Button key="back" onClick={() => setSelection(null)}>Back</Button>,
        <Button key="create" type="primary" disabled={!name.trim()} loading={creating} onClick={handleCreate}>Create</Button>,
      ] : null}
      width={560}
      destroyOnClose
    >
      {selection ? (
        <Input
          placeholder="Diagram name"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          autoFocus
          style={{ marginTop: 8 }}
        />
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <TemplateCard label={<span><FileAddOutlined /> Start blank</span>} description="A single blank page" onClick={chooseBlank} />
          </div>
          <Tabs
            size="small"
            items={[
              { key: 'builtin', label: 'Built-in templates', children: grid(builtIn, 'No built-in templates yet.') },
              { key: 'mine', label: 'My templates', children: grid(mine, "You haven't saved any templates yet.") },
            ]}
          />
        </>
      )}
    </Modal>
  );
}
