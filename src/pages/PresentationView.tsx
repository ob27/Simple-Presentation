import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spin } from 'antd';
import { ReactFlowProvider } from '@xyflow/react';
import { subscribePages, subscribeDiagram, updatePresentationSettings } from '../store';
import type { DiagramPage, DiagramDocument } from '../types/document';
import { Canvas } from '../components/canvas/Canvas';
import { AMBIENT_GRADIENT } from '../utils/presentationFrame';

export function PresentationView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
    containerRef.current?.requestFullscreen?.().catch(() => {});
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

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

  return (
    <div ref={containerRef} style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: AMBIENT_GRADIENT }}>
      <ReactFlowProvider>
        <Canvas
          diagramId={id!} pages={pages} mode="present" onExitPresent={handleExit}
          presentationSettings={diagram?.presentationSettings}
          onUpdatePresentationSettings={patch => updatePresentationSettings(id!, patch)}
        />
      </ReactFlowProvider>
    </div>
  );
}
