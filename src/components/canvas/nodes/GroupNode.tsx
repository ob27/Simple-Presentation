import { memo } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import { EdgeResizeHandles } from './EdgeResizeHandles';
import { useShiftHeld } from './useShiftHeld';

export interface GroupNodeData extends Record<string, unknown> {
  label?: string;
  locked?: boolean;
  onResizeGroup?: (id: string, width: number, height: number, x: number, y: number) => void;
}

function GroupNodeImpl({ id, data, selected }: NodeProps) {
  const { label, locked, onResizeGroup } = data as unknown as GroupNodeData;
  const shiftHeld = useShiftHeld(!!selected && !locked);
  // Wired to BOTH controls below, not just NodeResizer — EdgeResizeHandles'
  // dots are independent resize controls (see its own comment), so a drag
  // that starts there would otherwise never rescale this group's children.
  function handleResizeEnd(_e: unknown, params: { x: number; y: number; width: number; height: number }) {
    onResizeGroup?.(id, params.width, params.height, params.x, params.y);
  }
  return (
    <div
      style={{
        width: '100%', height: '100%',
        border: `1.5px dashed ${selected ? '#1677ff' : '#b7bed1'}`,
        borderRadius: 8,
        background: 'rgba(140, 163, 232, 0.04)',
        position: 'relative',
      }}
    >
      <NodeResizer
        isVisible={!!selected && !locked} minWidth={24} minHeight={24} keepAspectRatio={shiftHeld}
        lineStyle={{ borderColor: '#1677ff' }} handleStyle={{ width: 8, height: 8, borderRadius: 2 }}
        onResizeEnd={handleResizeEnd}
      />
      {!!selected && !locked && (
        <EdgeResizeHandles
          minWidth={24} minHeight={24} keepAspectRatio={shiftHeld} onResizeEnd={handleResizeEnd}
        />
      )}
      {label && (
        <div style={{
          position: 'absolute', top: -20, left: 0, fontSize: 11, fontWeight: 600, color: '#8a93a6',
        }}>
          {label}
        </div>
      )}
    </div>
  );
}

export const GroupNode = memo(GroupNodeImpl);
