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
  const mode: DiagramAccessRole = user && diagram ? getDiagramRole(diagram, user.uid) : 'present';

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
    // already appears via the existing viewer-tier query.
    navigate(mode === 'edit' ? `/d/${id}` : '/');
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
