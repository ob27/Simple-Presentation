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
// driven by the Arrow tool being active instead. A previous version also
// revealed these on hover as a "precision path" for connecting without
// switching tools — that reintroduced the exact same conflict (hovering an
// edge to grab a resize handle would surface a connection handle sitting
// on top of it instead, which silently swallows the drag and does nothing
// since connectMode is off), so hover-reveal was removed: visibility is
// now strictly tied to the Arrow tool actually being active.
//
// pointerEvents has to be set on each `<Handle>` itself, not just the
// wrapping span: React Flow's own stylesheet gives every handle a
// `.connectionindicator { pointer-events: all }` rule, which — being a
// class rule directly on the element — wins over an ancestor's inherited
// `pointer-events: none`. Relying on the span alone left these handles
// fully clickable even while "invisible", silently swallowing clicks meant
// for the resize dots sitting underneath at the same coordinates.
export function ConnectionHandles({ visible }: { visible: boolean }) {
  return (
    <>
      {SIDES.map(({ position, style }) => (
        <span key={position} style={{ position: 'absolute', ...style, zIndex: 5, pointerEvents: visible ? undefined : 'none' }}>
          <Handle
            type="target"
            position={position}
            id={`${position}-target`}
            style={{
              width: 20, height: 20, opacity: 0, border: 'none', background: 'transparent',
              pointerEvents: visible ? undefined : 'none',
            }}
          />
          <Handle
            type="source"
            position={position}
            id={`${position}-source`}
            style={{
              width: 9, height: 9, background: '#1677ff', border: '1.5px solid #fff',
              opacity: visible ? 1 : 0, transition: 'opacity 0.12s',
              pointerEvents: visible ? undefined : 'none',
            }}
          />
        </span>
      ))}
    </>
  );
}
