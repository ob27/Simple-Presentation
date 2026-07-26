export function RotateHandle({ onMouseDown, style }: { onMouseDown: (e: React.MouseEvent) => void; style?: React.CSSProperties }) {
  return (
    <div
      onMouseDown={onMouseDown}
      title="Drag to rotate"
      style={{
        position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%)',
        width: 14, height: 14, borderRadius: '50%', background: '#1677ff',
        cursor: 'grab', zIndex: 20, border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        ...style,
      }}
    />
  );
}
