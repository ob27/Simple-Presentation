import { useState } from 'react';
import { IconChevronLeft } from '../icons';

interface Props {
  width?: number;
  children: React.ReactNode;
}

// Toggling a tool that has its own config panel (Layers/Data/Check Diagram/
// Animation) used to snap the panel straight to full width. This instead
// opens it "peeking" — mostly off-screen, with just enough visible at the
// edge to signal it's there — and a single click anywhere on that sliver
// expands it to full width, where it then stays until closed (no
// auto-collapse on mouse-leave, since these panels hold real form controls
// a user needs to keep interacting with).
//
// The sliver used to be a plain 16px white strip with a small grey pill —
// easy to miss against the canvas's own light-grey background. It's now
// wider, tinted the same accent blue as an active toolbar button, carries a
// chevron instead of an anonymous pill, and nudges the chevron on mount so
// a freshly-opened panel visibly announces itself instead of silently
// docking off-screen.
export function PeekableDrawer({ width = 300, children }: Props) {
  const [expanded, setExpanded] = useState(false);
  const peekWidth = 24;

  return (
    <div
      onClick={() => { if (!expanded) setExpanded(true); }}
      style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width, zIndex: 15,
        transform: expanded ? 'translateX(0)' : `translateX(calc(100% - ${peekWidth}px))`,
        transition: 'transform 0.18s ease-out',
        cursor: expanded ? 'default' : 'pointer',
        display: 'flex',
      }}
    >
      {!expanded && (
        <div style={{
          width: peekWidth, flexShrink: 0, alignSelf: 'stretch', background: '#EEF4FF',
          borderLeft: '2px solid #1677ff', boxShadow: '-3px 0 10px rgba(22,119,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <style>{`
            @keyframes peek-drawer-nudge {
              0%, 100% { transform: translateX(0); }
              25% { transform: translateX(-3px); }
              50% { transform: translateX(1px); }
              75% { transform: translateX(-2px); }
            }
          `}</style>
          <IconChevronLeft style={{
            fontSize: 13, color: '#1677ff',
            animation: 'peek-drawer-nudge 1s ease-in-out 0.2s 2',
          }} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0, background: '#fff', borderLeft: '1px solid #e6e8ef', boxShadow: '-2px 0 8px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}
