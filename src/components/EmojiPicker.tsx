import { useState } from 'react';
import { Popover } from 'antd';

// A small curated set rather than a full emoji library (e.g. emoji-mart) —
// keeps bundle size down and covers the common "react to a comment" and
// "add a quick emoji to a comment" cases without a searchable picker. Ported
// from Simple AIM Kanban's EmojiPicker.tsx (same set, same no-search/
// no-categories scope), adapted to this app's Popover/trigger conventions.
const EMOJIS = [
  '👍', '👎', '❤️', '🎉', '😂', '😮', '😢', '🔥',
  '🚀', '👀', '✅', '❌', '🙏', '💯', '🤔', '👏',
  '😅', '😍', '🤝', '⚠️', '🐛', '💡', '⭐', '☕',
];

interface Props {
  children: React.ReactNode;
  onSelect: (emoji: string) => void;
}

export function EmojiPicker({ children, onSelect }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="top"
      content={
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2, width: 184 }}>
          {EMOJIS.map(emoji => (
            <button
              key={emoji}
              onClick={() => { onSelect(emoji); setOpen(false); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 17, padding: 3, borderRadius: 4, lineHeight: 1 }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              {emoji}
            </button>
          ))}
        </div>
      }
    >
      {children}
    </Popover>
  );
}
