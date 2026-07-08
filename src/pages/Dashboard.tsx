import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Spin, Tag, Tooltip, Modal, Input, message, Dropdown } from 'antd';
import {
  PlusOutlined, LogoutOutlined, DeleteOutlined, ShareAltOutlined, FolderAddOutlined,
  FolderOutlined, FolderOpenOutlined, DownOutlined, RightOutlined, TeamOutlined, MoreOutlined,
  EditOutlined, PictureOutlined, FileAddOutlined,
} from '@ant-design/icons';
import { useAuth } from '../AuthContext';
import {
  subscribeUserDiagrams, isDiagramOwner, deleteDiagram, renameDiagram,
  subscribeUserFolders, createFolder, deleteFolder, renameFolder, addDiagramToFolder, removeDiagramFromFolder,
  generateEditorInvite, saveDiagramAsTemplate,
} from '../store';
import { uploadFolderLogo, deleteFolderLogo } from '../utils/folderLogoUpload';
import type { DiagramDocument, DiagramFolder } from '../types/document';
import { FolderMembersModal } from '../components/FolderMembersModal';
import { TemplateGalleryModal } from '../components/TemplateGalleryModal';

const UNGROUPED_KEY = '__ungrouped__';

export function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [diagrams, setDiagrams] = useState<DiagramDocument[]>([]);
  const [folders, setFolders] = useState<DiagramFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderBusy, setFolderBusy] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<DiagramFolder | null>(null);
  const [renamingFolderName, setRenamingFolderName] = useState('');
  const [membersFolderId, setMembersFolderId] = useState<string | null>(null);
  const [uploadingIconForFolder, setUploadingIconForFolder] = useState<string | null>(null);
  const pendingFolderIconUpload = useRef<string | null>(null);
  const folderIconFileRef = useRef<HTMLInputElement>(null);

  const [renamingDiagram, setRenamingDiagram] = useState<DiagramDocument | null>(null);
  const [renamingDiagramName, setRenamingDiagramName] = useState('');

  useEffect(() => {
    if (!user) return;
    let pending = 2;
    const done = () => { pending -= 1; if (pending <= 0) setLoading(false); };
    const unsub1 = subscribeUserDiagrams(user.uid, ds => { setDiagrams(ds); done(); });
    const unsub2 = subscribeUserFolders(user.uid, fs => { setFolders(fs); done(); });
    return () => { unsub1(); unsub2(); };
  }, [user]);

  const realDiagrams = diagrams.filter(d => !d.isTemplate);
  const editableFolders = user ? folders.filter(f => f.ownerId === user.uid || (f.editorIds ?? []).includes(user.uid)) : [];

  function getFolderRole(folder: DiagramFolder): 'owner' | 'editor' | 'viewer' {
    if (!user) return 'viewer';
    if (folder.ownerId === user.uid) return 'owner';
    return (folder.editorIds ?? []).includes(user.uid) ? 'editor' : 'viewer';
  }

  function toggleCollapse(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function handleDelete(diagram: DiagramDocument) {
    try {
      await deleteDiagram(diagram);
    } catch {
      message.error('Failed to delete diagram');
    }
  }

  function handleCopyInvite(diagram: DiagramDocument) {
    const url = `${window.location.origin}/simple-presentation/invite/${diagram.inviteToken}`;
    navigator.clipboard.writeText(url);
    message.success('Invite link copied');
  }

  async function handleRenameDiagram() {
    if (!renamingDiagram || !renamingDiagramName.trim()) return;
    try {
      await renameDiagram(renamingDiagram.id, renamingDiagramName.trim());
      setRenamingDiagram(null);
      setRenamingDiagramName('');
    } catch {
      message.error('Failed to rename diagram');
    }
  }

  async function handleSaveAsTemplate(diagram: DiagramDocument) {
    try {
      await saveDiagramAsTemplate(diagram);
      message.success('Saved as template — find it under "My templates" next time you create a diagram');
    } catch {
      message.error('Failed to save as template');
    }
  }

  // ── Folder handlers ──────────────────────────────────────────────────────

  async function handleCreateFolder() {
    if (!user || !newFolderName.trim()) return;
    setFolderBusy(true);
    try {
      await createFolder(user.uid, newFolderName.trim(), user.email ?? undefined);
      setNewFolderOpen(false);
      setNewFolderName('');
    } catch {
      message.error('Failed to create folder');
    } finally {
      setFolderBusy(false);
    }
  }

  async function handleDeleteFolder(folder: DiagramFolder) {
    try {
      await deleteFolder(folder);
    } catch {
      message.error('Failed to delete folder');
    }
  }

  async function handleRenameFolder() {
    if (!renamingFolder || !renamingFolderName.trim()) return;
    setFolderBusy(true);
    try {
      await renameFolder(renamingFolder, renamingFolderName.trim());
      setRenamingFolder(null);
      setRenamingFolderName('');
    } catch {
      message.error('Failed to rename folder');
    } finally {
      setFolderBusy(false);
    }
  }

  async function handleAddToFolder(folder: DiagramFolder, diagramId: string) {
    const currentFolder = folders.find(f => f.id !== folder.id && f.diagramIds.includes(diagramId));
    if (currentFolder) {
      await removeDiagramFromFolder(currentFolder, diagramId).catch(() => {});
    }
    try {
      await addDiagramToFolder(folder, diagramId, diagrams);
    } catch {
      message.error('Failed to move diagram');
    }
  }

  async function handleRemoveFromFolder(folder: DiagramFolder, diagramId: string) {
    try {
      await removeDiagramFromFolder(folder, diagramId);
    } catch {
      message.error('Failed to remove from folder');
    }
  }

  async function handleFolderIconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const folderId = pendingFolderIconUpload.current;
    e.target.value = '';
    if (!file || !folderId) return;
    setUploadingIconForFolder(folderId);
    try {
      await uploadFolderLogo(folderId, file);
      message.success('Folder icon uploaded');
    } catch {
      message.error('Upload failed');
    } finally {
      setUploadingIconForFolder(null);
      pendingFolderIconUpload.current = null;
    }
  }

  async function handleDeleteFolderIcon(folderId: string) {
    setUploadingIconForFolder(folderId);
    try {
      await deleteFolderLogo(folderId);
      message.success('Folder icon removed');
    } catch {
      message.error('Failed to remove icon');
    } finally {
      setUploadingIconForFolder(null);
    }
  }

  async function handleCopyFolderInviteAs(folder: DiagramFolder, role: 'editor' | 'viewer') {
    const token = role === 'editor' ? (folder.editorInviteToken ?? await generateEditorInvite(folder)) : folder.inviteToken;
    const url = `${window.location.origin}/simple-presentation/folder-invite/${token}`;
    navigator.clipboard.writeText(url);
    message.success(`${role === 'editor' ? 'Editor' : 'Viewer'} invite link copied`);
  }

  function diagramCard(d: DiagramDocument, folder: DiagramFolder | null) {
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
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'rename', icon: <EditOutlined />, label: 'Rename' },
                  { key: 'template', icon: <FileAddOutlined />, label: 'Save as template' },
                  ...(editableFolders.length > 0 ? [{
                    key: 'move', icon: <FolderOutlined />, label: 'Move to folder',
                    children: [
                      ...editableFolders.map(f => ({ key: `move:${f.id}`, label: f.name })),
                      ...(folder ? [{ key: 'move:none', label: 'Remove from folder' }] : []),
                    ],
                  }] : []),
                  { type: 'divider' as const },
                  { key: 'delete', icon: <DeleteOutlined />, label: 'Delete', danger: true },
                ],
                onClick: ({ key }) => {
                  if (key === 'rename') { setRenamingDiagram(d); setRenamingDiagramName(d.name); }
                  else if (key === 'template') handleSaveAsTemplate(d);
                  else if (key === 'delete') handleDelete(d);
                  else if (key === 'move:none' && folder) handleRemoveFromFolder(folder, d.id);
                  else if (key.startsWith('move:')) {
                    const targetFolder = editableFolders.find(f => f.id === key.slice('move:'.length));
                    if (targetFolder) handleAddToFolder(targetFolder, d.id);
                  }
                },
              }}
            >
              <Button size="small" icon={<MoreOutlined />} />
            </Dropdown>
          </div>
        )}
      </div>
    );
  }

  function diagramGrid(ds: DiagramDocument[], folder: DiagramFolder | null) {
    return ds.length === 0 ? (
      <div style={{ color: '#aaa', fontSize: 13, padding: '12px 4px' }}>No diagrams here yet.</div>
    ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {ds.map(d => diagramCard(d, folder))}
      </div>
    );
  }

  const membersFolder = membersFolderId ? folders.find(f => f.id === membersFolderId) ?? null : null;

  return (
    <div style={{ minHeight: '100vh', background: '#EEF0F5', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        background: '#1a1a2e', padding: '0 24px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 18, letterSpacing: '-0.3px' }}>
          Simple Presentation <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.55)', fontSize: 15 }}>by Oestler</span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>{user?.email}</span>
          <Button icon={<LogoutOutlined />} size="small" type="text" onClick={signOut} style={{ color: 'rgba(255,255,255,0.5)' }} />
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '32px 24px', maxWidth: 1100, width: '100%', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>Your Diagrams</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<FolderAddOutlined />} onClick={() => setNewFolderOpen(true)}>New Folder</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setTemplateGalleryOpen(true)}>
              New Diagram
            </Button>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><Spin size="large" /></div>
        ) : realDiagrams.length === 0 && folders.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📐</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 }}>
              Create your first diagram
            </div>
            <div style={{ fontSize: 14, color: '#999', marginBottom: 28, maxWidth: 320, margin: '0 auto 28px' }}>
              Paper-format pages, smart connectors, and a canvas you can actually publish.
            </div>
            <Button type="primary" icon={<PlusOutlined />} size="large" onClick={() => setTemplateGalleryOpen(true)}>
              New Diagram
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {folders.map(folder => {
              const isCollapsed = collapsed.has(folder.id);
              const isOwner = user?.uid === folder.ownerId;
              const folderDiagrams = realDiagrams.filter(d => folder.diagramIds.includes(d.id));
              return (
                <div key={folder.id}>
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      marginBottom: isCollapsed ? 0 : 12, padding: '10px 14px',
                      background: '#E2E4EC', borderRadius: isCollapsed ? 10 : '10px 10px 0 0',
                      cursor: 'pointer', userSelect: 'none',
                    }}
                    onClick={() => toggleCollapse(folder.id)}
                  >
                    <span style={{ color: '#666', fontSize: 12, display: 'inline-flex' }}>
                      {isCollapsed ? <RightOutlined /> : <DownOutlined />}
                    </span>
                    {folder.folderLogoUrl ? (
                      <img src={folder.folderLogoUrl} alt="folder icon" style={{ height: 22, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
                    ) : (
                      isCollapsed ? <FolderOutlined style={{ color: '#555', fontSize: 16 }} /> : <FolderOpenOutlined style={{ color: '#555', fontSize: 16 }} />
                    )}
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#1a1a2e', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {folder.name}
                    </span>
                    <span style={{ fontSize: 12, color: '#999', marginRight: 4 }}>
                      {folderDiagrams.length} diagram{folderDiagrams.length !== 1 ? 's' : ''}
                    </span>
                    {!isOwner && (
                      <Tag color={getFolderRole(folder) === 'editor' ? 'blue' : 'default'} style={{ marginRight: 4 }}>
                        {getFolderRole(folder) === 'editor' ? 'Editor' : 'Viewer'}
                      </Tag>
                    )}
                    {isOwner && (
                      <Dropdown
                        trigger={['click']}
                        menu={{
                          items: [
                            { key: 'editor', icon: <EditOutlined />, label: 'Copy editor invite link' },
                            { key: 'viewer', icon: <ShareAltOutlined />, label: 'Copy viewer invite link' },
                          ],
                          onClick: ({ key, domEvent }) => {
                            domEvent.stopPropagation();
                            handleCopyFolderInviteAs(folder, key as 'editor' | 'viewer');
                          },
                        }}
                      >
                        <Tooltip title="Share folder">
                          <button onClick={e => e.stopPropagation()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', color: '#999', borderRadius: 4, lineHeight: 1, fontSize: 14 }}>
                            <ShareAltOutlined />
                          </button>
                        </Tooltip>
                      </Dropdown>
                    )}
                    {isOwner && (
                      <Tooltip title="Manage members">
                        <button onClick={e => { e.stopPropagation(); setMembersFolderId(folder.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', color: '#999', borderRadius: 4, lineHeight: 1, fontSize: 14 }}>
                          <TeamOutlined />
                        </button>
                      </Tooltip>
                    )}
                    {isOwner && (
                      <Dropdown
                        trigger={['click']}
                        menu={{
                          items: [
                            { key: 'rename', icon: <EditOutlined />, label: 'Rename folder' },
                            { type: 'divider' as const },
                            { key: 'upload-icon', icon: <PictureOutlined />, label: uploadingIconForFolder === folder.id ? 'Uploading…' : 'Upload folder icon' },
                            ...(folder.folderLogoUrl ? [{ key: 'remove-icon', icon: <DeleteOutlined />, label: 'Remove folder icon' }] : []),
                            { type: 'divider' as const },
                            { key: 'delete', icon: <DeleteOutlined />, label: 'Delete folder', danger: true },
                          ],
                          onClick: ({ key, domEvent }) => {
                            domEvent.stopPropagation();
                            if (key === 'rename') { setRenamingFolder(folder); setRenamingFolderName(folder.name); }
                            if (key === 'upload-icon') { pendingFolderIconUpload.current = folder.id; folderIconFileRef.current?.click(); }
                            if (key === 'remove-icon') handleDeleteFolderIcon(folder.id);
                            if (key === 'delete') handleDeleteFolder(folder);
                          },
                        }}
                      >
                        <button onClick={e => e.stopPropagation()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', color: '#999', borderRadius: 4, lineHeight: 1, fontSize: 14 }}>
                          <MoreOutlined />
                        </button>
                      </Dropdown>
                    )}
                  </div>
                  {!isCollapsed && (
                    <div style={{ padding: '12px 14px', background: '#fff', borderRadius: '0 0 10px 10px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                      {diagramGrid(folderDiagrams, folder)}
                    </div>
                  )}
                </div>
              );
            })}

            {(() => {
              const ungrouped = realDiagrams.filter(d => !folders.some(f => f.diagramIds.includes(d.id)));
              const isCollapsed = collapsed.has(UNGROUPED_KEY);
              if (folders.length === 0 && ungrouped.length === realDiagrams.length) {
                // No folders exist at all — skip the "Ungrouped" chrome entirely, just show the flat grid.
                return diagramGrid(ungrouped, null);
              }
              return (
                <div>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isCollapsed ? 0 : 12, padding: '10px 14px', background: '#E2E4EC', borderRadius: isCollapsed ? 10 : '10px 10px 0 0', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleCollapse(UNGROUPED_KEY)}
                  >
                    <span style={{ color: '#666', fontSize: 12, display: 'inline-flex' }}>{isCollapsed ? <RightOutlined /> : <DownOutlined />}</span>
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#1a1a2e', flex: 1 }}>Ungrouped</span>
                    <span style={{ fontSize: 12, color: '#999' }}>{ungrouped.length} diagram{ungrouped.length !== 1 ? 's' : ''}</span>
                  </div>
                  {!isCollapsed && (
                    <div style={{ padding: '12px 14px', background: '#fff', borderRadius: '0 0 10px 10px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                      {diagramGrid(ungrouped, null)}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      <input ref={folderIconFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFolderIconUpload} />

      {user && (
        <TemplateGalleryModal
          open={templateGalleryOpen}
          uid={user.uid}
          email={user.email ?? undefined}
          onClose={() => setTemplateGalleryOpen(false)}
          onCreated={diagramId => { setTemplateGalleryOpen(false); navigate(`/d/${diagramId}`); }}
        />
      )}

      <Modal
        title="New Folder"
        open={newFolderOpen}
        onOk={handleCreateFolder}
        onCancel={() => setNewFolderOpen(false)}
        okText="Create"
        okButtonProps={{ disabled: !newFolderName.trim(), loading: folderBusy }}
        destroyOnClose
      >
        <Input
          placeholder="Folder name"
          value={newFolderName}
          onChange={e => setNewFolderName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
          autoFocus
          style={{ marginTop: 8 }}
        />
      </Modal>

      <Modal
        title="Rename Folder"
        open={!!renamingFolder}
        onOk={handleRenameFolder}
        onCancel={() => setRenamingFolder(null)}
        okText="Save"
        okButtonProps={{ disabled: !renamingFolderName.trim(), loading: folderBusy }}
        destroyOnClose
      >
        <Input
          placeholder="Folder name"
          value={renamingFolderName}
          onChange={e => setRenamingFolderName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleRenameFolder()}
          autoFocus
          style={{ marginTop: 8 }}
        />
      </Modal>

      <Modal
        title="Rename Diagram"
        open={!!renamingDiagram}
        onOk={handleRenameDiagram}
        onCancel={() => setRenamingDiagram(null)}
        okText="Save"
        okButtonProps={{ disabled: !renamingDiagramName.trim() }}
        destroyOnClose
      >
        <Input
          placeholder="Diagram name"
          value={renamingDiagramName}
          onChange={e => setRenamingDiagramName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleRenameDiagram()}
          autoFocus
          style={{ marginTop: 8 }}
        />
      </Modal>

      {membersFolder && (
        <FolderMembersModal open={!!membersFolder} folder={membersFolder} onClose={() => setMembersFolderId(null)} />
      )}
    </div>
  );
}
