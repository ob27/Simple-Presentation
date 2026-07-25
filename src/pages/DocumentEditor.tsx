import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spin, Button, Tooltip, Input, Segmented, Dropdown } from 'antd';
import { IconArrowLeft, IconPlayCircle, IconPresenterNotes, IconHistory, IconShare } from '../components/icons';
import { ReactFlowProvider } from '@xyflow/react';
import {
  subscribePages, subscribeDiagram, addPage, addMasterPage, reorderPages, renameDiagram, getDiagramRole, generateViewerInvite,
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
  // Distinct from `role` itself — `role` defaults to 'edit' until the
  // diagram doc's first snapshot resolves a real value (see the comment
  // above), so gating the redirect effect below on `role !== 'edit'` alone
  // would never fire for a genuine non-editor if it happened to also check
  // too early; this tracks "we've actually heard from the diagram doc at
  // least once" so the redirect only ever acts on a resolved role.
  const [diagramLoaded, setDiagramLoaded] = useState(false);
  const [publicShareToken, setPublicShareToken] = useState<string | undefined>(undefined);
  const [ownerId, setOwnerId] = useState('');
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
        setPublicShareToken(d.publicShareToken ?? undefined);
        setOwnerId(d.ownerId);
        setRole(user ? getDiagramRole(d, user.uid) : 'edit');
        setDiagramLoaded(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.uid]);

  // A viewer/commenter who landed here (e.g. via a viewer invite link)
  // belongs in the real fullscreen Present route, not this editor shell —
  // PresentationView itself now computes the same role and keeps whatever
  // comment/present capability it grants, and its own exit button routes a
  // non-editor back to the Dashboard rather than here, so this redirect
  // can't loop.
  useEffect(() => {
    if (diagramLoaded && role !== 'edit' && id) navigate(`/d/${id}/present`, { replace: true });
  }, [diagramLoaded, role, id, navigate]);

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

  async function handleCopyInviteAs(kind: 'edit' | 'viewer') {
    if (!id) return;
    const token = kind === 'viewer'
      ? (publicShareToken ?? await generateViewerInvite({ id, name: diagramName, ownerId }))
      : inviteToken;
    if (kind === 'viewer') setPublicShareToken(token);
    copyInviteLink(token, kind);
  }

  // `loading` alone only reflects the pages subscription, which resolves
  // independently of (and often before) the diagram doc subscription that
  // `role` depends on — gating on `diagramLoaded && role !== 'edit'` left a
  // real window where pages had loaded but the diagram doc hadn't resolved
  // yet, `role` still sat at its optimistic 'edit' default, and the full
  // edit shell (Share dropdown, Pages/Master Pages toggle) mounted for a
  // visitor who was about to get redirected to Present a moment later.
  // Requiring `diagramLoaded` outright closes that gap.
  if (loading || !diagramLoaded || role !== 'edit') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#EEF0F5' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#EEF0F5' }}>
      <div style={{
        height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 16px', background: '#fff', borderBottom: '1px solid #e6e8ef',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
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
        </div>
        {/* A real flex child (flex:1, minWidth:0) instead of the old
            position:absolute+translateX(-50%) centering trick — that
            centered the toolbar on the WHOLE header regardless of how much
            room the title/right-side controls actually left it, so a long
            title or several right-side buttons made it visually collide
            with both. This gives Toolbar.tsx's own responsive overflow
            (see its ResizeObserver) a genuine, measurable available width
            to react to. */}
        <div
          ref={setToolbarSlotEl}
          style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {role === 'edit' && (
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'edit', label: 'Copy editor invite link' },
                  { key: 'viewer', label: 'Copy viewer invite link' },
                ],
                onClick: ({ key }) => handleCopyInviteAs(key as 'edit' | 'viewer'),
              }}
            >
              <Tooltip title="Share">
                <Button icon={<IconShare />} />
              </Tooltip>
            </Dropdown>
          )}
          {role === 'edit' && (
            <Segmented
              size="small"
              value={viewMode}
              onChange={v => setViewMode(v as 'pages' | 'masters')}
              options={[{ label: 'Pages', value: 'pages' }, { label: 'Master Pages', value: 'masters' }]}
            />
          )}
          {/* Labeled, unlike the icon-only Share/Presenter/Present buttons
              around it — those use near-universal icon conventions (share
              arrow, notes, play triangle), but a clock/history icon doesn't,
              and is easily mistaken for "recent" or notifications (this app
              already has a separate bell icon in a similar family). A
              permanent label fixes discoverability every session, not just
              a first-time nudge that stops helping after one missed visit. */}
          <Button icon={<IconHistory />} onClick={() => setVersionHistoryOpen(true)}>
            Version history
          </Button>
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
