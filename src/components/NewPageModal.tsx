import { useState } from 'react';
import { Modal, Tabs, Radio, InputNumber, Button } from 'antd';
import { FRAME_PRESETS, FRAME_PRESET_CATEGORIES, type FramePreset } from '../utils/paperSizes';
import type { NewPageOptions } from '../store';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (options: NewPageOptions) => void;
  // Lets this same modal double as "New Master" (title/button copy) and
  // pre-seed a specific format — used by PageSettingsPanel's "no matching
  // master yet — create one" affordance, which needs the modal to open
  // already set to the exact format the user was configuring.
  title?: string;
  createLabel?: string;
  initialPaperSize?: string;
  initialOrientation?: 'portrait' | 'landscape';
  initialCustomWidth?: number;
  initialCustomHeight?: number;
}

export function NewPageModal({
  open, onClose, onCreate, title = 'New Page', createLabel = 'Create page',
  initialPaperSize = 'A4', initialOrientation = 'portrait', initialCustomWidth = 794, initialCustomHeight = 1123,
}: Props) {
  const [selectedId, setSelectedId] = useState(initialPaperSize);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(initialOrientation);
  const [customWidth, setCustomWidth] = useState(initialCustomWidth);
  const [customHeight, setCustomHeight] = useState(initialCustomHeight);

  function handleCreate() {
    const preset = FRAME_PRESETS.find(p => p.id === selectedId);
    onCreate({
      paperSize: selectedId,
      orientation,
      customWidth: selectedId === 'Custom' ? customWidth : undefined,
      customHeight: selectedId === 'Custom' ? customHeight : undefined,
      name: preset?.label,
    });
    onClose();
  }

  return (
    // Widened from the original 520 — 8 category tabs (Paper/Phone/Tablet/
    // Watch/Web/Presentation/Social/Custom) overflow into an easy-to-miss
    // "..." dropdown at the old width, on top of Presentation/Social being
    // long labels.
    <Modal title={title} open={open} onCancel={onClose} footer={null} destroyOnClose width={680}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
        <Tabs
          size="small"
          defaultActiveKey="Paper"
          items={FRAME_PRESET_CATEGORIES.map(category => ({
            key: category,
            label: category,
            children: (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, paddingTop: 8 }}>
                {FRAME_PRESETS.filter(p => p.category === category).map(preset => (
                  <PresetCard key={preset.id} preset={preset} selected={selectedId === preset.id} onClick={() => setSelectedId(preset.id)} />
                ))}
              </div>
            ),
          }))}
        />

        {selectedId === 'Custom' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <InputNumber addonBefore="W" value={customWidth} onChange={v => setCustomWidth(v ?? 794)} />
            <InputNumber addonBefore="H" value={customHeight} onChange={v => setCustomHeight(v ?? 1123)} />
          </div>
        )}

        <Radio.Group value={orientation} onChange={e => setOrientation(e.target.value)}>
          <Radio.Button value="portrait">Portrait</Radio.Button>
          <Radio.Button value="landscape">Landscape</Radio.Button>
        </Radio.Group>

        <Button type="primary" onClick={handleCreate} block>{createLabel}</Button>
      </div>
    </Modal>
  );
}

function PresetCard({ preset, selected, onClick }: { preset: FramePreset; selected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        border: `1.5px solid ${selected ? '#1677ff' : '#e6e8ef'}`,
        borderRadius: 8, padding: '10px 8px', cursor: 'pointer', textAlign: 'center',
        background: selected ? '#EEF4FF' : '#fff',
      }}
    >
      <div style={{
        width: 28, height: Math.min(36, 28 * (preset.height / Math.max(preset.width, 1))),
        background: '#fff', border: '1px solid #b7bed1', margin: '0 auto 6px',
      }} />
      <div style={{ fontSize: 11, fontWeight: 600, color: '#1a1a2e' }}>{preset.label}</div>
      {preset.category !== 'Custom' && (
        <div style={{ fontSize: 10, color: '#999' }}>{preset.width} × {preset.height}</div>
      )}
    </div>
  );
}
