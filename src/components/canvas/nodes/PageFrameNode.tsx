import { memo, useState, useRef } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { HeaderFooterZones, PageNumberPosition, PageNumberStyle } from '../../../types/document';

const PX_PER_MM = 96 / 25.4;

// `{page}`/`{pages}` tokens let the same header/footer text work across
// every page in the document rather than needing to hand-edit a page number
// into each page individually.
function substituteTokens(text: string, pageIndex: number, pageCount: number): string {
  return text.replace(/\{page\}/g, String(pageIndex)).replace(/\{pages\}/g, String(pageCount));
}

function formatPageNumber(style: PageNumberStyle | undefined, pageIndex: number, pageCount: number): string {
  if (style === 'page-prefix') return `Page ${pageIndex}`;
  if (style === 'of-total') return `${pageIndex} of ${pageCount}`;
  return String(pageIndex);
}

// Maps a corner/edge choice to absolute inset styles — same 8px inset the
// header/footer text already uses, so a page number placed in a corner
// lines up visually with header/footer text placed along an edge.
function pageNumberInsetStyle(position: PageNumberPosition | undefined): React.CSSProperties {
  const [vertical, horizontal] = (position ?? 'bottom-right').split('-') as ['top' | 'bottom', 'left' | 'center' | 'right'];
  const style: React.CSSProperties = { position: 'absolute', pointerEvents: 'none' };
  style[vertical] = 8;
  if (horizontal === 'center') { style.left = 8; style.right = 8; style.textAlign = 'center'; }
  else if (horizontal === 'left') { style.left = 8; style.textAlign = 'left'; }
  else { style.right = 8; style.textAlign = 'right'; }
  return style;
}

export interface PageFrameNodeData extends Record<string, unknown> {
  pageName: string;
  pageId?: string;
  width: number;
  height: number;
  onRename?: (pageId: string, name: string) => void;
  onDeselectAll?: () => void;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  headerText?: string;
  footerText?: string;
  headerConfig?: HeaderFooterZones;
  footerConfig?: HeaderFooterZones;
  pageIndex?: number;
  pageCount?: number;
  backgroundColor?: string;
  pageNumberEnabled?: boolean;
  pageNumberStyle?: PageNumberStyle;
  pageNumberPosition?: PageNumberPosition;
}

// Falls back to the legacy single-string field (mapped into `center`) when
// no 3-zone config is set at all, so a page saved before headerConfig/
// footerConfig existed keeps rendering exactly as before.
function resolveZones(config: HeaderFooterZones | undefined, legacyText: string | undefined): HeaderFooterZones | undefined {
  if (config) return config;
  if (legacyText) return { center: legacyText };
  return undefined;
}

function HeaderFooterRow({ zones, edge, pageIndex, pageCount }: {
  zones: HeaderFooterZones; edge: 'top' | 'bottom'; pageIndex: number; pageCount: number;
}) {
  const style: React.CSSProperties = {
    position: 'absolute', left: 8, right: 8, pointerEvents: 'none',
    fontSize: zones.fontSize ?? 11, color: zones.color ?? '#8a93a6',
    display: 'flex', justifyContent: 'space-between', gap: 8,
  };
  style[edge] = 8;
  return (
    <div className="nopan nodrag" style={style}>
      <span style={{ textAlign: 'left', flex: 1 }}>{zones.left ? substituteTokens(zones.left, pageIndex, pageCount) : ''}</span>
      <span style={{ textAlign: 'center', flex: 1 }}>{zones.center ? substituteTokens(zones.center, pageIndex, pageCount) : ''}</span>
      <span style={{ textAlign: 'right', flex: 1 }}>{zones.right ? substituteTokens(zones.right, pageIndex, pageCount) : ''}</span>
    </div>
  );
}

function PageFrameNodeImpl({ data }: NodeProps) {
  const {
    pageName, pageId, width, height, onRename, onDeselectAll,
    marginTop, marginRight, marginBottom, marginLeft, headerText, footerText, headerConfig, footerConfig,
    pageIndex, pageCount, backgroundColor,
    pageNumberEnabled, pageNumberStyle, pageNumberPosition,
  } = data as unknown as PageFrameNodeData;
  const resolvedHeader = resolveZones(headerConfig, headerText);
  const resolvedFooter = resolveZones(footerConfig, footerText);
  const hasMargins = !!(marginTop || marginRight || marginBottom || marginLeft);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(pageName);

  function commit() {
    setEditing(false);
    if (draft.trim() && draft !== pageName && pageId) onRename?.(pageId, draft.trim());
  }

  // A plain onClick fires on mouseup as long as down and up both land on
  // this div — true even after a drag-select marquee that started on the
  // page background, since nothing here ever moves out from under the
  // cursor. That was silently clearing the marquee's selection immediately
  // after RF applied it. Tracking real movement (same threshold convention
  // used for anchor click-vs-drag elsewhere) makes this only fire on an
  // actual click.
  const downPosRef = useRef({ x: 0, y: 0 });
  function handleMouseDown(e: React.MouseEvent) {
    downPosRef.current = { x: e.clientX, y: e.clientY };
  }
  function handleClick(e: React.MouseEvent) {
    const dist = Math.hypot(e.clientX - downPosRef.current.x, e.clientY - downPosRef.current.y);
    if (dist < 3) onDeselectAll?.();
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      style={{
        width, height,
        background: backgroundColor ?? '#fff',
        boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
        border: '1px solid rgba(0,0,0,0.06)',
        position: 'relative',
      }}
    >
      {editing ? (
        <input
          autoFocus
          // React Flow only assigns its own "nopan" class to draggable nodes
          // (see noPanClassName usage in RF's Node component) — this node is
          // intentionally draggable={false}, so without opting back in here,
          // RF's zoomOnDoubleClick swallows the double-click before it ever
          // reaches this label, and a plain click/drag would pan the canvas
          // out from under the input while typing.
          className="nopan nodrag"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(pageName); setEditing(false); }
          }}
          style={{
            position: 'absolute', top: -26, left: 0, fontSize: 12, fontWeight: 600, color: '#8a8fa3',
            border: '1px solid #1677ff', borderRadius: 3, outline: 'none', padding: '1px 4px', background: '#fff',
          }}
        />
      ) : (
        <div
          className="nopan nodrag"
          onDoubleClick={() => { setDraft(pageName); setEditing(true); }}
          style={{
            position: 'absolute', top: -26, left: 0,
            fontSize: 12, fontWeight: 600, color: '#8a8fa3', cursor: 'text',
          }}
        >
          {pageName}
        </div>
      )}

      {hasMargins && (
        <div
          style={{
            position: 'absolute', pointerEvents: 'none',
            top: (marginTop ?? 0) * PX_PER_MM, left: (marginLeft ?? 0) * PX_PER_MM,
            right: (marginRight ?? 0) * PX_PER_MM, bottom: (marginBottom ?? 0) * PX_PER_MM,
            border: '1px dashed #b7bed1',
          }}
        />
      )}
      {resolvedHeader && <HeaderFooterRow zones={resolvedHeader} edge="top" pageIndex={pageIndex ?? 1} pageCount={pageCount ?? 1} />}
      {resolvedFooter && <HeaderFooterRow zones={resolvedFooter} edge="bottom" pageIndex={pageIndex ?? 1} pageCount={pageCount ?? 1} />}
      {pageNumberEnabled && (
        <div
          className="nopan nodrag"
          style={{ ...pageNumberInsetStyle(pageNumberPosition), fontSize: 11, color: '#8a93a6' }}
        >
          {formatPageNumber(pageNumberStyle, pageIndex ?? 1, pageCount ?? 1)}
        </div>
      )}
    </div>
  );
}

export const PageFrameNode = memo(PageFrameNodeImpl);
