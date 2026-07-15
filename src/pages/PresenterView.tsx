import { IconChevronLeft, IconChevronRight, IconExit } from '../components/icons';
import { Button, Tooltip } from 'antd';
import type { DiagramPage } from '../types/document';

interface Props {
  pages: DiagramPage[];
  currentPageId: string | undefined;
  onNavigate: (pageId: string) => void;
  onExit: () => void;
}

// Presenter View is deliberately a separate, lightweight layout — not a
// second full <Canvas> instance — so it doesn't need its own
// shapes/connectors subscription. It controls PAGE-level navigation only
// (not intra-page reveal steps, which stay driven from the audience window
// or keyboard); a "step" concept would need the same reveal-sequence data
// Canvas.tsx already owns, and duplicating that subscription here just for
// a next/prev button is a bigger, separate change than this first cut
// warrants. See PresentState's doc comment for the real deliverable this
// implements: a synced second tab, not true dual-monitor OS control.
export function PresenterView({ pages, currentPageId, onNavigate, onExit }: Props) {
  const index = pages.findIndex(p => p.id === currentPageId);
  const current = index >= 0 ? pages[index] : pages[0];
  const next = index >= 0 && index + 1 < pages.length ? pages[index + 1] : undefined;

  function goTo(newIndex: number) {
    if (newIndex < 0 || newIndex >= pages.length) return;
    onNavigate(pages[newIndex].id);
  }

  return (
    <div style={{
      width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
      background: '#1a1a1a', color: '#fff', fontFamily: 'inherit',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderBottom: '1px solid #333', flexShrink: 0,
      }}>
        <Tooltip title="Exit presenter view">
          <Button shape="circle" icon={<IconExit />} onClick={onExit} />
        </Tooltip>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {current?.name} · {index + 1} / {pages.length}
        </div>
        <div style={{ width: 32 }} />
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 2, padding: 24, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Speaker notes
          </div>
          <div style={{ flex: 1, fontSize: 20, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowY: 'auto', color: current?.notes ? '#fff' : '#666' }}>
            {current?.notes || 'No notes for this page.'}
          </div>
        </div>
        <div style={{ flex: 1, borderLeft: '1px solid #333', padding: 24, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Next
          </div>
          {next ? (
            <div style={{
              flex: 1, border: '1px solid #444', borderRadius: 8, display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#ccc', textAlign: 'center', padding: 16,
            }}>
              {next.name}
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#666' }}>
              End of deck
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, padding: 16, borderTop: '1px solid #333', flexShrink: 0 }}>
        <Tooltip title="Previous page">
          <Button shape="circle" icon={<IconChevronLeft />} disabled={index <= 0} onClick={() => goTo(index - 1)} />
        </Tooltip>
        <Tooltip title="Next page">
          <Button shape="circle" type="primary" icon={<IconChevronRight />} disabled={index >= pages.length - 1} onClick={() => goTo(index + 1)} />
        </Tooltip>
      </div>
    </div>
  );
}
