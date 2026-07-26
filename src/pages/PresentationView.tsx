import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Spin } from 'antd';
import { ReactFlowProvider } from '@xyflow/react';
import { subscribePages, subscribeDiagram, updatePresentationSettings, updatePresentState, getDiagramRole } from '../store';
import type { DiagramPage, DiagramDocument } from '../types/document';
import type { DiagramAccessRole } from '../store';
import { Canvas } from '../components/canvas/Canvas';
import { PresenterView } from './PresenterView';
import { AMBIENT_GRADIENT } from '../utils/presentationFrame';
import { useAuth } from '../AuthContext';

export function PresentationView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isPresenterMode = searchParams.get('mode') === 'presenter';
  const [pages, setPages] = useState<DiagramPage[]>([]);
  const [diagram, setDiagram] = useState<DiagramDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // A viewer redirected here (see DocumentEditor's own redirect) should keep
  // whatever access tier they actually have — most importantly, a
  // 'commenter' viewer needs commentsEnabled to stay true, which hardcoding
  // mode="present" below used to silently strip from everyone regardless of
  // their real role.
  //
  // getDiagramRole answers "what CAN this uid do" — for the diagram's own
  // owner/editor that's unconditionally 'edit', regardless of context. That
  // was fine for gating (e.g. DocumentEditor deciding whether to redirect
  // someone here), but using it directly as THIS route's own render mode
  // broke the ordinary case: the owner clicking their own editor's Present
  // button got mode='edit' here too, which made Canvas render the full
  // editing shell (page-name label, no device frame, etc.) instead of an
  // actual presentation — this route has no editing wiring at all, so
  // 'edit' never made sense as ITS mode. An editor visiting `/present` is
  // choosing to VIEW the presentation, same as anyone else who lands here;
  // only handleExit below still needs to know they're actually an editor,
  // so it can route them back to the editor instead of the Dashboard.
  const resolvedRole: DiagramAccessRole = user && diagram ? getDiagramRole(diagram, user.uid) : 'present';
  const isEditorViewing = resolvedRole === 'edit';
  const mode: DiagramAccessRole = isEditorViewing ? 'present' : resolvedRole;

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
    // Keeps the tight 3s poll this mechanism was originally built for —
    // see subscribeDiagram's own comment: a live audience view lagging a
    // stale slide behind the presenter is far more visible than the
    // general edit-view case the relaxed default now covers.
    return subscribeDiagram(id, setDiagram, 3000);
  }, [id]);

  useEffect(() => {
    // Presenter View is a plain windowed layout meant to sit on the
    // presenter's own screen, not fullscreen like the audience view.
    if (isPresenterMode) return;
    containerRef.current?.requestFullscreen?.().catch(() => {});
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [isPresenterMode]);

  function handleExit() {
    // A non-editor landing here was redirected in by DocumentEditor's own
    // role-based routing — sending them back to /d/:id would just bounce
    // them straight back to /present again (DocumentEditor redirects any
    // role !== 'edit' visitor here), an infinite loop. Only an editor
    // (who navigated in via the header's own Present button) goes back to
    // the editor; anyone else goes to the Dashboard, where their diagram
    // already appears via the existing viewer-tier query. Checks
    // isEditorViewing, not mode — mode itself is now always non-'edit' here.
    navigate(isEditorViewing ? `/d/${id}` : '/');
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#111' }}>
        <Spin size="large" />
      </div>
    );
  }

  const regularPages = pages.filter(p => !p.isMaster);

  if (isPresenterMode) {
    return (
      <PresenterView
        pages={regularPages}
        currentPageId={diagram?.presentState?.pageId ?? regularPages[0]?.id}
        onNavigate={pageId => updatePresentState(id!, { pageId, step: -1 })}
        onExit={handleExit}
      />
    );
  }

  return (
    <div ref={containerRef} style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: AMBIENT_GRADIENT }}>
      <ReactFlowProvider>
        <Canvas
          diagramId={id!} pages={pages} mode={mode} onExitPresent={handleExit}
          presentationSettings={diagram?.presentationSettings}
          onUpdatePresentationSettings={patch => updatePresentationSettings(id!, patch)}
          presentState={diagram?.presentState}
          onPresentStateChange={state => updatePresentState(id!, state)}
        />
      </ReactFlowProvider>
    </div>
  );
}
