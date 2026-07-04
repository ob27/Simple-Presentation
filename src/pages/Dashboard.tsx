import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Spin, Tag, Tooltip, Modal, Input, message } from 'antd';
import { PlusOutlined, LogoutOutlined, DeleteOutlined, ShareAltOutlined } from '@ant-design/icons';
import { useAuth } from '../AuthContext';
import { subscribeUserDiagrams, isDiagramOwner, createDiagram, deleteDiagram } from '../store';
import type { DiagramDocument } from '../types/document';

export function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [diagrams, setDiagrams] = useState<DiagramDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeUserDiagrams(user.uid, ds => {
      setDiagrams(ds);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  async function handleCreate() {
    if (!user || !newName.trim()) return;
    setCreating(true);
    try {
      const diagram = await createDiagram(user.uid, newName.trim(), user.email ?? undefined);
      setCreateOpen(false);
      setNewName('');
      navigate(`/d/${diagram.id}`);
    } catch {
      message.error('Failed to create diagram');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(diagram: DiagramDocument) {
    try {
      await deleteDiagram(diagram);
    } catch {
      message.error('Failed to delete diagram');
    }
  }

  function handleCopyInvite(diagram: DiagramDocument) {
    const url = `${window.location.origin}/simple-diagram/invite/${diagram.inviteToken}`;
    navigator.clipboard.writeText(url);
    message.success('Invite link copied');
  }

  return (
    <div style={{ minHeight: '100vh', background: '#EEF0F5', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        background: '#1a1a2e', padding: '0 24px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 18, letterSpacing: '-0.3px' }}>
          Simple Diagram <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.55)', fontSize: 15 }}>by Oestler</span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>{user?.email}</span>
          <Button icon={<LogoutOutlined />} size="small" type="text" onClick={signOut} style={{ color: 'rgba(255,255,255,0.5)' }} />
        </div>
      </div>

      <div style={{ flex: 1, padding: '32px 24px', maxWidth: 1100, width: '100%', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>Your Diagrams</h1>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            New Diagram
          </Button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><Spin size="large" /></div>
        ) : diagrams.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📐</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 }}>
              Create your first diagram
            </div>
            <div style={{ fontSize: 14, color: '#999', marginBottom: 28, maxWidth: 320, margin: '0 auto 28px' }}>
              Paper-format pages, smart connectors, and a canvas you can actually publish.
            </div>
            <Button type="primary" icon={<PlusOutlined />} size="large" onClick={() => setCreateOpen(true)}>
              New Diagram
            </Button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {diagrams.map(d => {
              const isOwner = user && isDiagramOwner(d, user.uid);
              return (
                <div
                  key={d.id}
                  onClick={() => navigate(`/d/${d.id}`)}
                  style={{
                    background: '#fff', borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.07)', padding: '16px 18px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#1a1a2e' }}>{d.name}</span>
                    {!isOwner && <Tag color="blue">Shared</Tag>}
                  </div>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
                    {d.pageOrder.length} page{d.pageOrder.length !== 1 ? 's' : ''}
                  </div>
                  {isOwner && (
                    <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                      <Tooltip title="Copy invite link">
                        <Button size="small" icon={<ShareAltOutlined />} onClick={() => handleCopyInvite(d)} />
                      </Tooltip>
                      <Tooltip title="Delete">
                        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(d)} />
                      </Tooltip>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        title="New Diagram"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        okText="Create"
        okButtonProps={{ disabled: !newName.trim(), loading: creating }}
        destroyOnClose
      >
        <Input
          placeholder="Diagram name"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          autoFocus
          style={{ marginTop: 8 }}
        />
      </Modal>
    </div>
  );
}
