import { useEffect, useRef } from 'react';
import { Menu } from 'antd';
import {
  IconBringToFront, IconSendToBack, IconMoveUp, IconMoveDown, IconGroup, IconUngroup,
  IconDuplicate, IconDelete, IconAlignLeft, IconAlignCenter, IconAlignRight,
  IconAlignTop, IconAlignMiddle, IconAlignBottom,
} from '../icons';

interface Props {
  x: number;
  y: number;
  selectionCount: number;
  isGroup: boolean;
  onBringToFront: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onSendToBack: () => void;
  onGroupOrUngroup: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onAlign: (edge: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') => void;
  onClose: () => void;
}

// A plain click-point-positioned menu, not antd `Dropdown` with a virtual
// anchor — there's no single real trigger element to anchor to (shape nodes
// are scattered React Flow components across a pannable/zoomable canvas),
// so this follows the same convention already used elsewhere in this file
// for click-point UI (the floating selection toolbar, AlignmentGuidesOverlay)
// rather than fighting Dropdown into anchoring at a synthetic point.
export function ShapeContextMenu({
  x, y, selectionCount, isGroup,
  onBringToFront, onBringForward, onSendBackward, onSendToBack,
  onGroupOrUngroup, onDuplicate, onCopy, onDelete, onAlign, onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('wheel', onClose, { once: true });
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('wheel', onClose);
    };
  }, [onClose]);

  const items = [
    { key: 'bringToFront', label: 'Bring to Front', icon: <IconBringToFront /> },
    { key: 'bringForward', label: 'Bring Forward', icon: <IconMoveUp /> },
    { key: 'sendBackward', label: 'Send Backward', icon: <IconMoveDown /> },
    { key: 'sendToBack', label: 'Send to Back', icon: <IconSendToBack /> },
    { type: 'divider' as const },
    ...(selectionCount >= 2
      ? [{
          key: 'align', label: 'Align', icon: <IconAlignLeft />,
          children: [
            { key: 'align-left', label: 'Left', icon: <IconAlignLeft /> },
            { key: 'align-hcenter', label: 'Center', icon: <IconAlignCenter /> },
            { key: 'align-right', label: 'Right', icon: <IconAlignRight /> },
            { type: 'divider' as const },
            { key: 'align-top', label: 'Top', icon: <IconAlignTop /> },
            { key: 'align-vcenter', label: 'Middle', icon: <IconAlignMiddle /> },
            { key: 'align-bottom', label: 'Bottom', icon: <IconAlignBottom /> },
          ],
        }, { type: 'divider' as const }]
      : []),
    ...(selectionCount >= 2 || isGroup
      ? [{ key: 'groupOrUngroup', label: isGroup ? 'Ungroup' : 'Group', icon: isGroup ? <IconUngroup /> : <IconGroup /> }]
      : []),
    { key: 'duplicate', label: 'Duplicate', icon: <IconDuplicate /> },
    { key: 'copy', label: 'Copy' },
    { type: 'divider' as const },
    { key: 'delete', label: 'Delete', icon: <IconDelete />, danger: true },
  ];

  function handleClick(key: string) {
    onClose();
    if (key === 'bringToFront') onBringToFront();
    else if (key === 'bringForward') onBringForward();
    else if (key === 'sendBackward') onSendBackward();
    else if (key === 'sendToBack') onSendToBack();
    else if (key === 'groupOrUngroup') onGroupOrUngroup();
    else if (key === 'duplicate') onDuplicate();
    else if (key === 'copy') onCopy();
    else if (key === 'delete') onDelete();
    else if (key.startsWith('align-')) onAlign(key.slice('align-'.length) as Parameters<typeof onAlign>[0]);
  }

  return (
    <div ref={ref} style={{ position: 'fixed', top: y, left: x, zIndex: 1000 }}>
      <Menu
        items={items}
        onClick={({ key }) => handleClick(key)}
        style={{ minWidth: 190, borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', border: '1px solid #e6e8ef' }}
      />
    </div>
  );
}
