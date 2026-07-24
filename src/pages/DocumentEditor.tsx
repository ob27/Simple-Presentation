import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spin, Button, Tooltip, Input, Segmented } from 'antd';
import { IconArrowLeft, IconPlayCircle, IconPresenterNotes, IconHistory, IconShare } from '../components/icons';
import { ReactFlowProvider } from '@xyflow/react';
import {
  subscribePages, subscribeDiagram, addPage, addMasterPage, reorderPages, renameDiagram, getDiagramRole,
  type NewPageOptions,
} from '../store';
import { copyInviteLink } from '../utils/shareLinks';
import type { DiagramPage } from '../types/document';
import { Canvas } from '../components/canvas/Canvas';
import { NewPageModal } from '../components/NewPageModal';
import { VersionHistoryModal } from '../components/VersionHistoryModal';
import { useAuth } from '../AuthContext';

export function DocumentEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [pages, setPages] = useState<DiagramPage[]>([]);
  const [diagramName, setDiagramName] = useState('diagram');
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  // For @mention autocomplete in comments — the diagram doc is already
  // subscribed below for the title; memberIds/memberEmails were previously
  // fetched and discarded, so this is a new state capture, not a new read.
  const [members, setMembers] = useState<{ uid: string; email: string }[]>([]);
  const [inviteToken, setInviteToken] = useState('');
  // 'edit' unless/until the diagram subscription resolves a lesser role for
  // the current user — defaults to full edit so there's no flash of a
  // restricted UI for the common (editor/owner) case while this is loading.
  const [role, setRole] = useState<'edit' | 'comment' | 'present'>('edit');
  const [loading, setLoading] = useState(true);
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newPageAfterOrder, setNewPageAfterOrder] = useState<number | null>(null);
  const [newMasterOpen, setNewMasterOpen] = useState(false);
  const [newMasterAfterOrder, setNewMasterAfterOrder] = useState<number | null>(null);
  const [newMasterInitialFormat, setNewMasterInitialFormat] = useState<
    { paperSize: string; orientation: 'portrait' | 'landscape'; customWidth?: number; customHeight?: number } | null
  >(null);
  const [viewMode, setViewMode] = useState<'pages' | 'masters'>('pages');
  const [toolbarSlotEl, setToolbarSlotEl] = useState<HTMLDivElement | null>(null);
  const isEditingTitleRef = useRef(false);
  // Last name known to be saved (from Firestore, or our own successful
  // write) — compared against on blur since `diagramName` itself already
  // tracks the in-progress edit via the controlled input.
  const savedNameRef = useRef('diagram');

  useEffect(() => {
    if (!id) return;
    const unsub = subscribePages(id, ps => {
      setPages(ps);
      setLoading(false);
    });
    return unsub;
  }, [id]);

  useEffect(() => {
    if (!id) return;
    // Skip remote updates while the user is actively typing the title so an
    // in-flight edit isn't clobbered by our own not-yet-settled write.
    return subscribeDiagram(id, d => {
      if (d && !isEditingTitleRef.current) {
        setDiagramName(d.name);
        savedNameRef.current = d.name;
      }
      if (d) {
        setMembers(d.memberIds.map(uid => ({ uid, email: d.memberEmails?.[uid] ?? uid })));
        setInviteToken(d.inviteToken);
        setRole(user ? getDiagramRole(d, user.uid) : 'edit');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.uid]);

  function commitTitle(name: string) {
    isEditingTitleRef.current = false;
    if (!id) return;
    const trimmed = name.trim();
    if (trimmed && trimmed !== savedNameRef.current) {
      savedNameRef.current = trimmed;
      setDiagramName(trimmed);
      renameDiagram(id, trimmed);
    } else {
      setDiagramName(savedNameRef.current);
    }
  }

  // `pages` here is every page in the diagram, regular AND master mixed —
  // addPage/addMasterPage's insert-at-position bump logic must only ever
  // touch its own subset's `order` values (each subset is its own gapless
  // 0..n-1 sequence sharing the same underlying field), so both handlers
  // below scope to regularPages/masterPages, never the raw mixed `pages`.
  const regularPages = useMemo(() => pages.filter(p => !p.isMaster), [pages]);
  const masterPages = useMemo(() => pages.filter(p => p.isMaster), [pages]);

  async function handleAddPage(options: NewPageOptions) {
    if (!id) return;
    const afterOrder = newPageAfterOrder ?? (regularPages.length > 0 ? regularPages[regularPages.length - 1].order : -1);
    await addPage(id, regularPages, afterOrder, options);
  }

  function handleInsertPageAt(afterOrder: number) {
    setNewPageAfterOrder(afterOrder);
    setNewPageOpen(true);
  }

  async function handleAddMaster(options: NewPageOptions) {
    if (!id) return;
    const afterOrder = newMasterAfterOrder ?? (masterPages.length > 0 ? masterPages[masterPages.length - 1].order : -1);
    await addMasterPage(id, masterPages, afterOrder, options);
  }

  function handleInsertMasterAt(afterOrder: number) {
    setNewMasterAfterOrder(afterOrder);
    setNewMasterInitialFormat(null);
    setNewMasterOpen(true);
  }

  // "No matching master yet — Create one" (PageSettingsPanel) — appends a
  // new master rather than inserting at a specific position, pre-seeded to
  // the exact format the user was configuring on their page.
  function handleCreateMasterForFormat(paperSize: string, orientation: 'portrait' | 'landscape', customWidth?: number, customHeight?: number) {
    setNewMasterAfterOrder(null);
    setNewMasterInitialFormat({ paperSize, orientation, customWidth, customHeight });
    setNewMasterOpen(true);
  }

  function handleReorderPages(reordered: DiagramPage[]) {
    setPages(reordered);
    if (id) reorderPages(id, reordered.map(p => p.id));
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#EEF0F5' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#EEF0F5' }}>
      <div style={{
        height: 48, flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 16px', background: '#fff', borderBottom: '1px solid #e6e8ef',
      }}>
        <Tooltip title="Back to dashboard">
          <Button icon={<IconArrowLeft />} type="text" onClick={() => navigate('/')} />
        </Tooltip>
        <Input
          value={diagramName}
          placeholder="Untitled diagram"
          variant="borderless"
          onFocus={() => { isEditingTitleRef.current = true; }}
          onChange={e => setDiagramName(e.target.value)}
          onPressEnter={e => (e.target as HTMLInputElement).blur()}
          onBlur={e => commitTitle(e.target.value)}
          style={{ width: 220, fontSize: 15, fontWeight: 500, padding: '4px 8px' }}
        />
        <div
          ref={setToolbarSlotEl}
          style={{
            position: 'absolute', left: '50%', top: 0, bottom: 0, transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center',
          }}
        />
        <div style={{ flex: 1 }} />
        {role === 'edit' && (
          <Tooltip title="Copy invite link">
            <Button icon={<IconShare />} onClick={() => copyInviteLink(inviteToken)}>Share</Button>
          </Tooltip>
        )}
        {role === 'edit' && (
          <Segmented
            size="small"
            value={viewMode}
            onChange={v => setViewMode(v as 'pages' | 'masters')}
            options={[{ label: 'Pages', value: 'pages' }, { label: 'Master Pages', value: 'masters' }]}
          />
        )}
        <Tooltip title="Version history">
          <Button icon={<IconHistory />} onClick={() => setVersionHistoryOpen(true)} />
        </Tooltip>
        {viewMode === 'pages' && (
          <>
            <Tooltip title="Presenter view (notes + next slide — open on your own screen, then Present on the shared one)">
              <Button icon={<IconPresenterNotes />} onClick={() => window.open(`/simple-presentation/d/${id}/present?mode=presenter`, '_blank')} />
            </Tooltip>
            <Tooltip title="Present">
              <Button icon={<IconPlayCircle />} onClick={() => window.open(`/simple-presentation/d/${id}/present`, '_blank')} />
            </Tooltip>
          </>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ReactFlowProvider>
          <Canvas
            diagramId={id!} pages={pages} diagramName={diagramName}
            members={members}
            mode={role}
            toolbarSlot={toolbarSlotEl}
            viewMode={viewMode}
            onInsertPageAt={handleInsertPageAt} onInsertMasterAt={handleInsertMasterAt}
            onCreateMasterForFormat={handleCreateMasterForFormat}
            onReorderPages={handleReorderPages}
          />
        </ReactFlowProvider>
      </div>
      <NewPageModal
        open={newPageOpen}
        onClose={() => { setNewPageOpen(false); setNewPageAfterOrder(null); }}
        onCreate={handleAddPage}
      />
      <NewPageModal
        open={newMasterOpen}
        onClose={() => { setNewMasterOpen(false); setNewMasterAfterOrder(null); setNewMasterInitialFormat(null); }}
        onCreate={handleAddMaster}
        title="New Master"
        createLabel="Create master"
        initialPaperSize={newMasterInitialFormat?.paperSize}
        initialOrientation={newMasterInitialFormat?.orientation}
        initialCustomWidth={newMasterInitialFormat?.customWidth}
        initialCustomHeight={newMasterInitialFormat?.customHeight}
      />
      {id && (
        <VersionHistoryModal
          open={versionHistoryOpen}
          onClose={() => setVersionHistoryOpen(false)}
          diagramId={id}
          uid={user?.uid ?? ''}
        />
      )}
    </div>
  );
}
