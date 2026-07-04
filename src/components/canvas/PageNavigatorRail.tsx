import { useState } from 'react';
import { Tooltip, Popover, Input, Select, Radio, Button, Popconfirm } from 'antd';
import { SettingOutlined, DeleteOutlined } from '@ant-design/icons';
import type { DiagramPage } from '../../types/document';
import { useActivePageId } from './useActivePageId';
import { FRAME_PRESETS } from '../../utils/paperSizes';
import { updatePage, deletePage } from '../../store';

interface Props {
  diagramId: string;
  pages: DiagramPage[];
  pageOrigins: Map<string, number>;
  pageDimensions: Map<string, { width: number; height: number }>;
  rightOffset?: number;
  onSelectPage: (pageId: string) => void;
}

export function PageNavigatorRail({ diagramId, pages, pageOrigins, pageDimensions, rightOffset = 16, onSelectPage }: Props) {
  const activePageId = useActivePageId(pages, pageOrigins, pageDimensions);
  const [settingsOpenFor, setSettingsOpenFor] = useState<string | null>(null);

  return (
    <div style={{
      position: 'absolute', top: '50%', right: rightOffset, transform: 'translateY(-50%)',
      transition: 'right 0.15s',
      display: 'flex', flexDirection: 'column', gap: 8, zIndex: 10,
      background: 'rgba(255,255,255,0.9)', borderRadius: 10, padding: 8,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    }}>
      {pages.map(page => (
        <Popover
          key={page.id}
          open={settingsOpenFor === page.id}
          onOpenChange={open => setSettingsOpenFor(open ? page.id : null)}
          trigger="click"
          placement="left"
          // antd's Popover keeps `content` mounted even while closed (for its
          // own show/hide animation), so a form with useState(page.xyz)
          // initial values only ever reads them once, at first open — it
          // goes stale the moment the page is renamed elsewhere and never
          // re-syncs, and worse, silently writes that stale value back on
          // Save. Rendering it only while actually open forces a fresh
          // mount (and fresh state) every time it's reopened.
          content={settingsOpenFor === page.id
            ? <PageSettingsForm diagramId={diagramId} page={page} pages={pages} onClose={() => setSettingsOpenFor(null)} />
            : null}
        >
          <Tooltip title={page.name} placement="left">
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <div
                onClick={() => onSelectPage(page.id)}
                onMouseDown={e => e.preventDefault()}
                style={{
                  width: 20, height: 26, borderRadius: 3, cursor: 'pointer',
                  background: page.id === activePageId ? '#1677ff' : '#e4e6ee',
                  border: page.id === activePageId ? '1px solid #1677ff' : '1px solid #d4d7e0',
                  transition: 'background 0.15s',
                }}
              />
              <SettingOutlined
                onClick={e => { e.stopPropagation(); setSettingsOpenFor(page.id); }}
                style={{
                  position: 'absolute', right: -6, bottom: -6, fontSize: 10, color: '#888',
                  background: '#fff', borderRadius: '50%', padding: 2, boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                }}
              />
            </div>
          </Tooltip>
        </Popover>
      ))}
    </div>
  );
}

function PageSettingsForm({ diagramId, page, pages, onClose }: { diagramId: string; page: DiagramPage; pages: DiagramPage[]; onClose: () => void }) {
  const [name, setName] = useState(page.name);
  const [paperSize, setPaperSize] = useState(page.paperSize);
  const [orientation, setOrientation] = useState(page.orientation);

  function commit() {
    updatePage(diagramId, page.id, { name, paperSize, orientation });
    onClose();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 220 }}>
      <Input size="small" value={name} onChange={e => setName(e.target.value)} onPressEnter={commit} placeholder="Page name" />
      <Select
        size="small"
        value={paperSize}
        options={FRAME_PRESETS.map(p => ({ value: p.id, label: p.label }))}
        onChange={setPaperSize}
      />
      <Radio.Group size="small" value={orientation} onChange={e => setOrientation(e.target.value)}>
        <Radio.Button value="portrait">Portrait</Radio.Button>
        <Radio.Button value="landscape">Landscape</Radio.Button>
      </Radio.Group>
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="small" type="primary" onClick={commit} style={{ flex: 1 }}>Save</Button>
        <Popconfirm
          title="Delete this page?"
          disabled={pages.length <= 1}
          onConfirm={() => { deletePage(diagramId, page.id); onClose(); }}
        >
          <Button size="small" danger icon={<DeleteOutlined />} disabled={pages.length <= 1} />
        </Popconfirm>
      </div>
    </div>
  );
}
