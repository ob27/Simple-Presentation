import { memo } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import type { ShapeNodeData } from '../../../types/shapes';
import type { ResolvedStyle } from '../../../utils/shapeStyleResolver';
import type { ShapeNodeRuntimeData } from './ShapeNode';
import { useRotateHandle } from './useRotateHandle';
import { RotateHandle } from './RotateHandle';
import { ConnectionHandles } from './ConnectionHandles';
import { EdgeResizeHandles } from './EdgeResizeHandles';
import { buildPathD, computePathViewBox } from '../../../utils/pathAnchorGeometry';

function PathNodeImpl({ id, data, selected }: NodeProps) {
  const shapeData = data as unknown as ShapeNodeData & ShapeNodeRuntimeData & {
    __resolvedStyle?: ResolvedStyle; __dimmed?: boolean; __hidden?: boolean;
  };
  const resolved = shapeData.__resolvedStyle;
  const fill = resolved?.fill ?? shapeData.fillColor ?? '#E3EAFD';
  const stroke = resolved?.strokeColor ?? shapeData.strokeColor ?? '#7C93E8';
  const strokeWidth = resolved?.strokeWidth ?? shapeData.strokeWidth ?? 1.5;
  const opacity = shapeData.__hidden ? 0 : shapeData.__dimmed ? 0.2 : (resolved?.opacity ?? 1);
  const rotation = shapeData.rotation ?? 0;
  const locked = !!shapeData.locked;
  const anchors = shapeData.pathAnchors ?? [];
  const closed = !!shapeData.pathClosed;

  const onRotateStart = useRotateHandle(id, rotation, shapeData.onCommit);
  const { width: vbW, height: vbH } = computePathViewBox(anchors);
  const d = buildPathD(anchors, closed);

  function handleMouseDown(e: React.MouseEvent) {
    if (shapeData.connectMode) {
      e.stopPropagation();
      shapeData.onStartConnect?.(id, e);
    }
  }

  const isDirectSelecting = !!shapeData.directSelectMode;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }} onMouseDown={handleMouseDown}>
      <NodeResizer isVisible={!!selected && !locked && !isDirectSelecting} minWidth={8} minHeight={8} lineStyle={{ borderColor: '#1677ff' }} handleStyle={{ width: 8, height: 8, borderRadius: 2 }} />
      {!!selected && !locked && !isDirectSelecting && <EdgeResizeHandles minWidth={8} minHeight={8} />}
      {selected && !locked && !isDirectSelecting && <RotateHandle onMouseDown={onRotateStart} />}

      <svg
        width="100%" height="100%" viewBox={`0 0 ${vbW} ${vbH}`} preserveAspectRatio="none"
        style={{ display: 'block', transform: `rotate(${rotation}deg)`, opacity, transition: 'opacity 0.3s', overflow: 'visible' }}
      >
        <path
          d={d}
          fill={closed ? fill : 'none'}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <ConnectionHandles visible={!!shapeData.connectMode} />
    </div>
  );
}

export const PathNode = memo(PathNodeImpl);
