import { memo } from 'react';
import {
  BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath,
  useInternalNode, type EdgeProps,
} from '@xyflow/react';
import type { SmartEdgeData } from '../../../types/edges';
import { getFloatingEdgeParams, getAnchorAwareEdgeParams } from './edgeRouting';
import { TravelingDot } from './TravelingDot';

interface RuntimeEdgeData {
  __dimmed?: boolean;
  __hidden?: boolean;
}

function SmartEdgeImpl({ id, source, target, style, markerEnd, selected, data }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!sourceNode || !targetNode) return null;

  const edgeData = data as (SmartEdgeData & RuntimeEdgeData) | undefined;
  const hasAnchorDocking = edgeData?.sourceAnchorIndex !== undefined || edgeData?.targetAnchorIndex !== undefined;
  const { sx, sy, sPos, tx, ty, tPos } = hasAnchorDocking
    ? getAnchorAwareEdgeParams(sourceNode, targetNode, edgeData?.sourceAnchorIndex, edgeData?.targetAnchorIndex)
    : getFloatingEdgeParams(sourceNode, targetNode);
  const routing = edgeData?.routing ?? 'orthogonal';
  const opacity = edgeData?.__hidden ? 0 : edgeData?.__dimmed ? 0.2 : 1;

  // When the two connected nodes overlap or sit very close together, their
  // boundary intersection points end up close together too — getSmoothStepPath's
  // rounded-corner routing has no room to work with at that distance and
  // collapses into a degenerate zigzag that can render entirely underneath a
  // node (invisible and unclickable, since nodes paint above edges). A plain
  // straight segment degrades gracefully instead. An anchor-docked edge is
  // always straight too — an interior anchor point has no "side" for
  // orthogonal routing's corner logic to key off.
  const segmentLength = Math.hypot(tx - sx, ty - sy);
  const effectiveRouting = hasAnchorDocking ? 'straight' : segmentLength < 24 ? 'straight' : routing;

  let path: string;
  let labelX: number;
  let labelY: number;

  if (effectiveRouting === 'curved') {
    [path, labelX, labelY] = getBezierPath({ sourceX: sx, sourceY: sy, sourcePosition: sPos, targetX: tx, targetY: ty, targetPosition: tPos });
  } else if (effectiveRouting === 'straight') {
    path = `M ${sx},${sy} L ${tx},${ty}`;
    labelX = (sx + tx) / 2;
    labelY = (sy + ty) / 2;
  } else {
    [path, labelX, labelY] = getSmoothStepPath({ sourceX: sx, sourceY: sy, sourcePosition: sPos, targetX: tx, targetY: ty, targetPosition: tPos, borderRadius: 8 });
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{ stroke: selected ? '#1677ff' : '#8a93a6', strokeWidth: selected ? 2 : 1.5, opacity, transition: 'opacity 0.3s', ...style }}
      />
      {edgeData?.flowAnimation === 'dash' && !edgeData?.__hidden && (
        <path d={path} fill="none" stroke="#1677ff" strokeWidth={2} className="sd-flow-dash" style={{ opacity }} />
      )}
      {edgeData?.flowAnimation === 'dot' && !edgeData?.__hidden && (
        <g style={{ opacity }}>
          <TravelingDot path={path} />
        </g>
      )}
      {edgeData?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute', pointerEvents: 'all',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              background: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 11, color: '#555',
              border: '1px solid #e6e8ef',
            }}
          >
            {edgeData.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const SmartEdge = memo(SmartEdgeImpl);
