import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spin, Button, Tooltip } from 'antd';
import { ArrowLeftOutlined, PlusOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { ReactFlowProvider } from '@xyflow/react';
import { subscribePages, subscribeDiagram, addPage, type NewPageOptions } from '../store';
import type { DiagramPage } from '../types/document';
import { Canvas } from '../components/canvas/Canvas';
import { NewPageModal } from '../components/NewPageModal';

export function DocumentEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [pages, setPages] = useState<DiagramPage[]>([]);
  const [diagramName, setDiagramName] = useState('diagram');
  const [loading, setLoading] = useState(true);
  const [newPageOpen, setNewPageOpen] = useState(false);

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
    return subscribeDiagram(id, d => { if (d) setDiagramName(d.name); });
  }, [id]);

  async function handleAddPage(options: NewPageOptions) {
    if (!id) return;
    const lastOrder = pages.length > 0 ? pages[pages.length - 1].order : -1;
    await addPage(id, lastOrder, options);
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
        height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 16px', background: '#fff', borderBottom: '1px solid #e6e8ef',
      }}>
        <Tooltip title="Back to dashboard">
          <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/')} />
        </Tooltip>
        <div style={{ flex: 1 }} />
        <Tooltip title="Present">
          <Button icon={<PlayCircleOutlined />} onClick={() => window.open(`/simple-presentation/d/${id}/present`, '_blank')} />
        </Tooltip>
        <Tooltip title="Add page">
          <Button icon={<PlusOutlined />} onClick={() => setNewPageOpen(true)}>Page</Button>
        </Tooltip>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ReactFlowProvider>
          <Canvas diagramId={id!} pages={pages} diagramName={diagramName} />
        </ReactFlowProvider>
      </div>
      <NewPageModal open={newPageOpen} onClose={() => setNewPageOpen(false)} onCreate={handleAddPage} />
    </div>
  );
}
