import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Spin } from 'antd';
import { ReactFlowProvider } from '@xyflow/react';
import { subscribePages, subscribeDiagram, updatePresentationSettings, updatePresentState } from '../store';
import type { DiagramPage, DiagramDocument } from '../types/document';
import { Canvas } from '../components/canvas/Canvas';
import { PresenterView } from './PresenterView';
import { AMBIENT_GRADIENT } from '../utils/presentationFrame';

export function PresentationView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPresenterMode = searchParams.get('mode') === 'presenter';
  const [pages, setPages] = useState<DiagramPage[]>([]);
  const [diagram, setDiagram] = useState<DiagramDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

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
    return subscribeDiagram(id, setDiagram);
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
    navigate(`/d/${id}`);
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
          diagramId={id!} pages={pages} mode="present" onExitPresent={handleExit}
          presentationSettings={diagram?.presentationSettings}
          onUpdatePresentationSettings={patch => updatePresentationSettings(id!, patch)}
          presentState={diagram?.presentState}
          onPresentStateChange={state => updatePresentState(id!, state)}
        />
      </ReactFlowProvider>
    </div>
  );
}
