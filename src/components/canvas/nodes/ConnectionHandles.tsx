import { Handle, Position } from '@xyflow/react';

const SIDES: { position: Position; style: React.CSSProperties }[] = [
  { position: Position.Top, style: { left: '50%', top: 0, transform: 'translate(-50%, -50%)' } },
  { position: Position.Right, style: { left: '100%', top: '50%', transform: 'translate(-50%, -50%)' } },
  { position: Position.Bottom, style: { left: '50%', top: '100%', transform: 'translate(-50%, -50%)' } },
  { position: Position.Left, style: { left: 0, top: '50%', transform: 'translate(-50%, -50%)' } },
];

// `visible` used to be driven by `selected` — but a selected shape ALSO
// shows NodeResizer's edge-midpoint resize handles at these exact same
// coordinates, so the two competed for the same click. Visibility is now
// driven by the Arrow tool being active instead; hover-to-reveal remains as
// a secondary precision path for anyone who wants to drag straight from a
// handle without turning the tool on.
export function ConnectionHandles({ visible }: { visible: boolean }) {
  return (
    <>
      {SIDES.map(({ position, style }) => (
        <span key={position} style={{ position: 'absolute', ...style, zIndex: 5 }}>
          <Handle
            type="target"
            position={position}
            id={`${position}-target`}
            style={{ width: 20, height: 20, opacity: 0, border: 'none', background: 'transparent' }}
          />
          <Handle
            type="source"
            position={position}
            id={`${position}-source`}
            style={{
              width: 9, height: 9, background: '#1677ff', border: '1.5px solid #fff',
              opacity: visible ? 1 : 0, transition: 'opacity 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={e => { if (!visible) e.currentTarget.style.opacity = '0'; }}
          />
        </span>
      ))}
    </>
  );
}
