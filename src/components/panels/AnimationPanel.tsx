import { Button, Tooltip, Select, InputNumber } from 'antd';
import {
  IconClose, IconAdd, IconRemoveCircle, IconMoveUp, IconMoveDown,
  IconPlay, IconStepForward, IconStepBack, IconRewindReset,
} from '../icons';
import { PeekableDrawer } from './PeekableDrawer';
export interface SequenceItem {
  id: string;
  kind: 'shape' | 'connector';
  label: string;
  revealOrder?: number;
  pageId?: string;
  animationType?: 'fade' | 'flyIn' | 'zoom';
  animationDuration?: number;
}

interface Props {
  items: SequenceItem[];
  step: number; // -1 = nothing revealed; N = items with revealOrder <= N are visible
  onStepChange: (step: number) => void;
  onToggleSequenced: (id: string, kind: 'shape' | 'connector') => void;
  onReorder: (id: string, kind: 'shape' | 'connector', direction: -1 | 1) => void;
  onChangeAnimation: (id: string, patch: { animationType?: 'fade' | 'flyIn' | 'zoom'; animationDuration?: number }) => void;
  onClose: () => void;
}

const ANIMATION_TYPE_OPTIONS = [
  { value: 'fade', label: 'Fade' },
  { value: 'flyIn', label: 'Fly in' },
  { value: 'zoom', label: 'Zoom' },
];

export function AnimationPanel({ items, step, onStepChange, onToggleSequenced, onReorder, onChangeAnimation, onClose }: Props) {
  const sequenced = items.filter(i => i.revealOrder !== undefined).sort((a, b) => (a.revealOrder ?? 0) - (b.revealOrder ?? 0));
  const unsequenced = items.filter(i => i.revealOrder === undefined);
  const maxStep = sequenced.length - 1;

  return (
    <PeekableDrawer>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#1a1a2e' }}>Animation</span>
        <Button size="small" type="text" icon={<IconClose />} onClick={onClose} />
      </div>

      <div style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Tooltip title="Reset"><Button size="small" icon={<IconRewindReset />} onClick={() => onStepChange(-1)} disabled={sequenced.length === 0} /></Tooltip>
        <Tooltip title="Step back"><Button size="small" icon={<IconStepBack />} onClick={() => onStepChange(Math.max(-1, step - 1))} disabled={step <= -1} /></Tooltip>
        <Tooltip title="Play next step"><Button size="small" type="primary" icon={<IconPlay />} onClick={() => onStepChange(Math.min(maxStep, step + 1))} disabled={step >= maxStep || sequenced.length === 0} /></Tooltip>
        <Tooltip title="Step forward"><Button size="small" icon={<IconStepForward />} onClick={() => onStepChange(Math.min(maxStep, step + 1))} disabled={step >= maxStep} /></Tooltip>
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
                padding: '5px 6px', borderRadius: 6,
                background: i <= step ? '#EEF4FF' : '#fafafa', marginBottom: 4,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: '50%', background: i <= step ? '#1677ff' : '#ccc',
                    color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {i + 1}
                  </span>
                  <span style={{ flex: 1, fontSize: 12, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.label}
                  </span>
                  <Button size="small" type="text" icon={<IconMoveUp />} disabled={i === 0} onClick={() => onReorder(item.id, item.kind, -1)} />
                  <Button size="small" type="text" icon={<IconMoveDown />} disabled={i === sequenced.length - 1} onClick={() => onReorder(item.id, item.kind, 1)} />
                  <Button size="small" type="text" danger icon={<IconRemoveCircle />} onClick={() => onToggleSequenced(item.id, item.kind)} />
                </div>
                {item.kind === 'shape' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, paddingLeft: 24 }}>
                    <Select
                      size="small" style={{ flex: 1 }}
                      value={item.animationType ?? 'fade'}
                      options={ANIMATION_TYPE_OPTIONS}
                      onChange={v => onChangeAnimation(item.id, { animationType: v })}
                    />
                    <InputNumber
                      size="small" style={{ width: 70 }} min={50} max={3000} step={50}
                      value={item.animationDuration ?? 300}
                      onChange={v => onChangeAnimation(item.id, { animationDuration: v ?? 300 })}
                      addonAfter="ms"
                    />
                  </div>
                )}
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
            <Button size="small" type="text" icon={<IconAdd />} onClick={() => onToggleSequenced(item.id, item.kind)} />
          </div>
        ))}
        {items.length === 0 && (
          <div style={{ fontSize: 12, color: '#999', textAlign: 'center', paddingTop: 20 }}>
            Add shapes to this page first.
          </div>
        )}
      </div>
    </PeekableDrawer>
  );
}
