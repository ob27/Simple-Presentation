import { Modal } from 'antd';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Shortcut {
  keys: string;
  label: string;
}

const GROUPS: { title: string; shortcuts: Shortcut[] }[] = [
  {
    title: 'General',
    shortcuts: [
      { keys: 'Cmd/Ctrl + Z', label: 'Undo' },
      { keys: 'Cmd/Ctrl + Shift + Z', label: 'Redo' },
      { keys: 'Cmd/Ctrl + C', label: 'Copy' },
      { keys: 'Cmd/Ctrl + X', label: 'Cut' },
      { keys: 'Cmd/Ctrl + V', label: 'Paste' },
      { keys: 'Cmd/Ctrl + D', label: 'Duplicate' },
      { keys: 'Delete / Backspace', label: 'Delete selected shape(s)' },
      { keys: 'Escape', label: 'Exit the current tool, or deselect' },
      { keys: '?', label: 'Show this shortcuts list' },
    ],
  },
  {
    title: 'Selection & movement',
    shortcuts: [
      { keys: 'Shift + click', label: 'Add/remove a shape from the selection' },
      { keys: 'Arrow keys', label: 'Nudge the selected shape(s) by 1px' },
      { keys: 'Shift + Arrow keys', label: 'Nudge the selected shape(s) by 10px' },
      { keys: 'WASD / Arrow keys', label: 'Pan the canvas (when nothing is selected)' },
    ],
  },
  {
    title: 'Vector editing',
    shortcuts: [
      { keys: 'A', label: 'Toggle Direct Selection (edit a path’s anchor points)' },
      { keys: 'Arrow keys', label: 'Nudge the focused anchor point by 1px' },
      { keys: 'Shift + Arrow keys', label: 'Nudge the focused anchor point by 10px' },
      { keys: 'Delete / Backspace', label: 'Delete the focused anchor point' },
    ],
  },
  {
    title: 'Presenting',
    shortcuts: [
      { keys: 'Space / →', label: 'Advance to the next step or page' },
      { keys: '←', label: 'Go back a step or page' },
      { keys: 'Escape', label: 'Exit presentation mode' },
    ],
  },
];

export function ShortcutsHelpModal({ open, onClose }: Props) {
  return (
    <Modal title="Keyboard shortcuts" open={open} onCancel={onClose} footer={null} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 8 }}>
        {GROUPS.map(group => (
          <div key={group.title}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#999', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
              {group.title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.shortcuts.map(s => (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 13, color: '#333' }}>{s.label}</span>
                  <kbd style={{
                    fontSize: 11, color: '#555', background: '#f5f6f9', border: '1px solid #e6e8ef',
                    borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap', fontFamily: 'inherit',
                  }}>
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
