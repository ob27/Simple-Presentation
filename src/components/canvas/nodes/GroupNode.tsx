import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';

export interface GroupNodeData extends Record<string, unknown> {
  label?: string;
}

function GroupNodeImpl({ data, selected }: NodeProps) {
  const { label } = data as unknown as GroupNodeData;
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
