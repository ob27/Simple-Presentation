import { Button, Tooltip } from 'antd';
import {
  CloseOutlined, PlusOutlined, MinusCircleOutlined, UpOutlined, DownOutlined,
  CaretRightOutlined, StepForwardOutlined, StepBackwardOutlined, RedoOutlined,
} from '@ant-design/icons';
export interface SequenceItem {
  id: string;
  kind: 'shape' | 'connector';
  label: string;
  revealOrder?: number;
  pageId?: string;
}

interface Props {
  items: SequenceItem[];
  step: number; // -1 = nothing revealed; N = items with revealOrder <= N are visible
  onStepChange: (step: number) => void;
  onToggleSequenced: (id: string, kind: 'shape' | 'connector') => void;
  onReorder: (id: string, kind: 'shape' | 'connector', direction: -1 | 1) => void;
  onClose: () => void;
}

export function AnimationPanel({ items, step, onStepChange, onToggleSequenced, onReorder, onClose }: Props) {
  const sequenced = items.filter(i => i.revealOrder !== undefined).sort((a, b) => (a.revealOrder ?? 0) - (b.revealOrder ?? 0));
  const unsequenced = items.filter(i => i.revealOrder === undefined);
  const maxStep = sequenced.length - 1;

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 300, zIndex: 15,
      background: '#fff', borderLeft: '1px solid #e6e8ef', boxShadow: '-2px 0 8px rgba(0,0,0,0.05)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#1a1a2e' }}>Animation</span>
        <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClose} />
      </div>

      <div style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Tooltip title="Reset"><Button size="small" icon={<RedoOutlined />} onClick={() => onStepChange(-1)} disabled={sequenced.length === 0} /></Tooltip>
        <Tooltip title="Step back"><Button size="small" icon={<StepBackwardOutlined />} onClick={() => onStepChange(Math.max(-1, step - 1))} disabled={step <= -1} /></Tooltip>
        <Tooltip title="Play next step"><Button size="small" type="primary" icon={<CaretRightOutlined />} onClick={() => onStepChange(Math.min(maxStep, step + 1))} disabled={step >= maxStep || sequenced.length === 0} /></Tooltip>
        <Tooltip title="Step forward"><Button size="small" icon={<StepForwardOutlined />} onClick={() => onStepChange(Math.min(maxStep, step + 1))} disabled={step >= maxStep} /></Tooltip>
        <span style={{ fontSize: 11, color: '#999', marginLeft: 4 }}>
          {sequenced.length === 0 ? 'No sequence yet' : `Step ${step + 1} / ${sequenced.length}`}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
        {sequenced.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
              Reveal sequence
            </div>
            {sequenced.map((item, i) => (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 6,
                background: i <= step ? '#EEF4FF' : '#fafafa', marginBottom: 4,
              }}>
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', background: i <= step ? '#1677ff' : '#ccc',
                  color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {i + 1}
                </span>
                <span style={{ flex: 1, fontSize: 12, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.label}
                </span>
                <Button size="small" type="text" icon={<UpOutlined />} disabled={i === 0} onClick={() => onReorder(item.id, item.kind, -1)} />
                <Button size="small" type="text" icon={<DownOutlined />} disabled={i === sequenced.length - 1} onClick={() => onReorder(item.id, item.kind, 1)} />
                <Button size="small" type="text" danger icon={<MinusCircleOutlined />} onClick={() => onToggleSequenced(item.id, item.kind)} />
              </div>
            ))}
          </>
        )}

        <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '12px 0 6px' }}>
          Not sequenced (always visible)
        </div>
        {unsequenced.map(item => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px' }}>
            <span style={{ flex: 1, fontSize: 12, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.label}
            </span>
            <Button size="small" type="text" icon={<PlusOutlined />} onClick={() => onToggleSequenced(item.id, item.kind)} />
          </div>
        ))}
        {items.length === 0 && (
          <div style={{ fontSize: 12, color: '#999', textAlign: 'center', paddingTop: 20 }}>
            Add shapes to this page first.
          </div>
        )}
      </div>
    </div>
  );
}
