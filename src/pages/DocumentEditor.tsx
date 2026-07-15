import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spin, Button, Tooltip, Input } from 'antd';
import { IconArrowLeft, IconPlayCircle, IconPresenterNotes, IconHistory } from '../components/icons';
import { ReactFlowProvider } from '@xyflow/react';
import { subscribePages, subscribeDiagram, addPage, reorderPages, renameDiagram, type NewPageOptions } from '../store';
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
  const [loading, setLoading] = useState(true);
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newPageAfterOrder, setNewPageAfterOrder] = useState<number | null>(null);
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
      if (d) setMembers(d.memberIds.map(uid => ({ uid, email: d.memberEmails?.[uid] ?? uid })));
    });
  }, [id]);

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

  async function handleAddPage(options: NewPageOptions) {
    if (!id) return;
    const afterOrder = newPageAfterOrder ?? (pages.length > 0 ? pages[pages.length - 1].order : -1);
    await addPage(id, pages, afterOrder, options);
  }

  function handleInsertPageAt(afterOrder: number) {
    setNewPageAfterOrder(afterOrder);
    setNewPageOpen(true);
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
        <Tooltip title="Version history">
          <Button icon={<IconHistory />} onClick={() => setVersionHistoryOpen(true)} />
        </Tooltip>
        <Tooltip title="Presenter view (notes + next slide — open on your own screen, then Present on the shared one)">
          <Button icon={<IconPresenterNotes />} onClick={() => window.open(`/simple-presentation/d/${id}/present?mode=presenter`, '_blank')} />
        </Tooltip>
        <Tooltip title="Present">
          <Button icon={<IconPlayCircle />} onClick={() => window.open(`/simple-presentation/d/${id}/present`, '_blank')} />
        </Tooltip>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ReactFlowProvider>
          <Canvas
            diagramId={id!} pages={pages} diagramName={diagramName}
            members={members}
            toolbarSlot={toolbarSlotEl}
            onInsertPageAt={handleInsertPageAt} onReorderPages={handleReorderPages}
          />
        </ReactFlowProvider>
      </div>
      <NewPageModal
        open={newPageOpen}
        onClose={() => { setNewPageOpen(false); setNewPageAfterOrder(null); }}
        onCreate={handleAddPage}
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
