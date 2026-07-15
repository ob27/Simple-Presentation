import { ViewportPortal } from '@xyflow/react';
import type { Node } from '@xyflow/react';
import type { PresenceRecord } from '../../types/presence';
import { useUserProfiles } from '../../utils/userProfiles';

interface Props {
  peers: PresenceRecord[];
  shapeNodes: Node[];
}

export function RemoteCursorsLayer({ peers, shapeNodes }: Props) {
  // Resolve by uid at render time rather than trusting each peer's own
  // broadcast `displayName` — that string is still written for backward
  // compat with any client not yet on this code, but a nickname (once set)
  // should win regardless of what the broadcaster itself sent.
  const profiles = useUserProfiles(peers.map(p => p.uid));

  return (
    <ViewportPortal>
      <>
        {peers.map(peer => {
          const label = profiles[peer.uid]?.nickname || peer.displayName;
          return (
            <div key={peer.uid + peer.displayName}>
              {peer.cursor && (
                <div style={{
                  position: 'absolute', left: peer.cursor.x, top: peer.cursor.y,
                  pointerEvents: 'none', zIndex: 1000, transform: 'translate(-2px, -2px)',
                }}>
                  <svg width="18" height="18" viewBox="0 0 18 18" style={{ display: 'block' }}>
                    <path d="M1 1 L1 14 L5 11 L7.5 16 L9.5 15 L7 10 L12 10 Z" fill={peer.color} stroke="#fff" strokeWidth={1} />
                  </svg>
                  <div style={{
                    background: peer.color, color: '#fff', fontSize: 10, fontWeight: 600,
                    padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap', marginTop: 2,
                  }}>
                    {label}
                  </div>
                </div>
              )}

              {peer.dragPreview && peer.dragPreview.shapeIds.map(shapeId => {
                const shape = shapeNodes.find(n => n.id === shapeId);
                if (!shape) return null;
                const w = shape.width ?? shape.measured?.width ?? 100;
                const h = shape.height ?? shape.measured?.height ?? 70;
                return (
                  <div
                    key={shapeId}
                    style={{
                      position: 'absolute',
                      left: shape.position.x + peer.dragPreview!.dx,
                      top: shape.position.y + peer.dragPreview!.dy,
                      width: w, height: h,
                      border: `2px dashed ${peer.color}`,
                      borderRadius: 4,
                      pointerEvents: 'none',
                      zIndex: 999,
                      opacity: 0.7,
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </>
    </ViewportPortal>
  );
}
