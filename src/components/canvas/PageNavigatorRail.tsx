import { useState, Fragment } from 'react';
import { Tooltip, Button, Dropdown } from 'antd';
import { IconAdd, IconDuplicate } from '../icons';
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Node } from '@xyflow/react';
import type { DiagramPage } from '../../types/document';
import type { ShapeNodeData } from '../../types/shapes';
import { useActivePageId } from './useActivePageId';
import { PAGE_X } from '../../constants';

interface Props {
  pages: DiagramPage[];
  pageOrigins: Map<string, number>;
  pageDimensions: Map<string, { width: number; height: number }>;
  shapeNodes: Node[];
  // Client-side-only raster snapshots of pages that have been visited this
  // session (see Canvas.tsx) — never uploaded anywhere, so this costs no
  // bandwidth/storage. Pages not yet in this map fall back to the rough
  // ThumbnailShape SVG approximation below.
  pageSnapshots: Map<string, string>;
  onSelectPage: (pageId: string) => void;
  onInsertPageAt: (afterOrder: number) => void;
  onReorderPages: (pages: DiagramPage[]) => void;
  onOpenPageSettings: (pageId: string) => void;
  onDuplicatePage: (pageId: string) => void;
}

export const THUMB_MAX_WIDTH = 132;
export const THUMB_MAX_HEIGHT = 132;

// Docked to the left, full page height, top-aligned — a traditional
// slide-panel layout (à la PowerPoint) rather than the floating
// vertically-centered rail this replaced. Each thumbnail renders the
// page's actual shapes, scaled into an SVG viewBox sized to that page's
// real paper dimensions, so both the aspect ratio/orientation AND the
// rough visual content stay live and accurate — not just a placeholder
// block standing in for the page.
//
// This same rail now renders EITHER the regular page stack OR the master
// page stack, unchanged — Canvas.tsx decides which set to pass in `pages`
// based on its own viewMode, so master pages get full thumbnails, drag-
// reorder, insert-at-position, and open into the same PageSettingsPanel as
// any other page, with zero separate code path.
export function PageNavigatorRail({ pages, pageOrigins, pageDimensions, shapeNodes, pageSnapshots, onSelectPage, onInsertPageAt, onReorderPages, onOpenPageSettings, onDuplicatePage }: Props) {
  const activePageId = useActivePageId(pages, pageOrigins, pageDimensions);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = pages.findIndex(p => p.id === active.id);
    const newIndex = pages.findIndex(p => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorderPages(arrayMove(pages, oldIndex, newIndex));
  }

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, bottom: 0, width: 168, zIndex: 10,
      background: '#fff', borderRight: '1px solid #e6e8ef',
      display: 'flex', flexDirection: 'column', padding: '4px 8px',
      overflowY: 'auto',
    }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={pages.map(p => p.id)} strategy={verticalListSortingStrategy}>
          <PageGap afterOrder={-1} onInsert={onInsertPageAt} />
          {pages.map((page, i) => {
            const dims = pageDimensions.get(page.id) ?? { width: 794, height: 1123 };
            const origin = pageOrigins.get(page.id) ?? 0;
            const scale = Math.min(THUMB_MAX_WIDTH / dims.width, THUMB_MAX_HEIGHT / dims.height);
            const thumbW = Math.round(dims.width * scale);
            const thumbH = Math.round(dims.height * scale);
            const pageShapes = shapeNodes.filter(n => (n.data as ShapeNodeData).pageId === page.id);

            return (
              <Fragment key={page.id}>
                <SortablePageThumb
                  page={page} index={i} activePageId={activePageId}
                  thumbW={thumbW} thumbH={thumbH} dims={dims} origin={origin} pageShapes={pageShapes}
                  snapshot={pageSnapshots.get(page.id)}
                  onSelectPage={onSelectPage}
                  onOpenPageSettings={onOpenPageSettings}
                  onDuplicatePage={onDuplicatePage}
                />
                <PageGap afterOrder={page.order} onInsert={onInsertPageAt} />
              </Fragment>
            );
          })}
        </SortableContext>
      </DndContext>
    </div>
  );
}

// A thin, mostly-invisible strip between (and around) thumbnails that
// reveals a small "insert page here" button on hover — lets a new page
// land at any exact position instead of only ever being appended.
function PageGap({ afterOrder, onInsert }: { afterOrder: number; onInsert: (afterOrder: number) => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        // The "+" button (and its tooltip) is naturally taller than this
        // 14px gap, so it overflows into the thumbnails immediately above
        // and below it — without a stacking context of its own, that
        // overflow paints BEHIND those thumbnails' own backgrounds (later
        // siblings win ties in the default stacking order), clipping it.
        position: 'relative', zIndex: 12,
      }}
    >
      {hovered && (
        <Tooltip title="Insert page here" placement="right">
          <Button
            size="small" shape="circle" icon={<IconAdd style={{ fontSize: 10 }} />}
            onClick={() => onInsert(afterOrder)}
          />
        </Tooltip>
      )}
    </div>
  );
}

function SortablePageThumb({
  page, index, activePageId, thumbW, thumbH, dims, origin, pageShapes, snapshot, onSelectPage, onOpenPageSettings, onDuplicatePage,
}: {
  page: DiagramPage;
  index: number;
  activePageId: string | undefined;
  thumbW: number;
  thumbH: number;
  dims: { width: number; height: number };
  origin: number;
  pageShapes: Node[];
  snapshot: string | undefined;
  onSelectPage: (pageId: string) => void;
  onOpenPageSettings: (pageId: string) => void;
  onDuplicatePage: (pageId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  const [contextMenuOpen, setContextMenuOpen] = useState(false);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        transform: CSS.Transform.toString(transform), transition,
        opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 1 : undefined,
        touchAction: 'none', cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      <Dropdown
        trigger={['contextMenu']}
        onOpenChange={setContextMenuOpen}
        menu={{
          items: [{ key: 'duplicate', icon: <IconDuplicate />, label: 'Duplicate page' }],
          onClick: ({ key }) => { if (key === 'duplicate') onDuplicatePage(page.id); },
        }}
      >
        {/* `open={false}` while the context menu is up — otherwise the
            hover tooltip stays visible (the pointer never actually left
            this element) and its higher stacking order sits on top of the
            dropdown menu, intercepting clicks on "Duplicate page". */}
        <Tooltip title={`${page.name} — opens page settings in the sidebar`} placement="right" open={contextMenuOpen ? false : undefined}>
          <div
            data-page-thumb={page.id}
            onClick={() => { onSelectPage(page.id); onOpenPageSettings(page.id); }}
            onMouseDown={e => e.preventDefault()}
            style={{ position: 'relative', cursor: 'pointer' }}
          >
            <svg
              width={thumbW} height={thumbH} viewBox={`0 0 ${dims.width} ${dims.height}`}
              style={{
                display: 'block', background: '#fff',
                border: page.id === activePageId ? '2px solid #1677ff' : '1px solid #d4d7e0',
                borderRadius: 3, boxShadow: page.id === activePageId ? '0 0 0 2px rgba(22,119,255,0.15)' : undefined,
              }}
            >
              {snapshot
                ? <image href={snapshot} x={0} y={0} width={dims.width} height={dims.height} preserveAspectRatio="xMidYMid slice" />
                : pageShapes.map(n => (
                    <ThumbnailShape key={n.id} node={n} pageX={PAGE_X} pageOrigin={origin} />
                  ))}
            </svg>
          </div>
        </Tooltip>
      </Dropdown>
      <div style={{
        fontSize: 11, color: page.id === activePageId ? '#1677ff' : '#888', fontWeight: page.id === activePageId ? 600 : 400,
        maxWidth: THUMB_MAX_WIDTH, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center',
      }}>
        {index + 1}. {page.name}
      </div>
    </div>
  );
}

// A deliberately rough approximation, not a pixel-faithful mini-render of
// every shape kind's real rendering logic (gradients, lane theming, uml
// glyphs, etc.) — at thumbnail size the useful signal is layout, rough
// geometry, and colour, which this covers for every kind via a small
// handful of SVG primitives.
function ThumbnailShape({ node, pageX, pageOrigin }: { node: Node; pageX: number; pageOrigin: number }) {
  const data = node.data as ShapeNodeData;
  if (data.hidden) return null;
  const x = node.position.x - pageX;
  const y = node.position.y - pageOrigin;
  const w = node.width ?? node.measured?.width ?? 0;
  const h = node.height ?? node.measured?.height ?? 0;
  if (!w || !h) return null;
  const fill = data.kind === 'text' ? 'none' : (data.fillColor || '#e4e6ee');
  const stroke = data.strokeColor || (data.kind === 'text' ? 'none' : undefined);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rotation = data.rotation ? `rotate(${data.rotation}, ${cx}, ${cy})` : undefined;

  let shape: React.ReactNode;
  if (data.kind === 'ellipse' || data.kind === 'cylinder' || data.kind === 'umlActor' || data.kind === 'cloud') {
    shape = <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} fill={fill} stroke={stroke} strokeWidth={1} />;
  } else if (data.kind === 'diamond') {
    shape = <polygon points={`${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`} fill={fill} stroke={stroke} strokeWidth={1} />;
  } else if (data.kind === 'triangle') {
    shape = <polygon points={`${cx},${y} ${x + w},${y + h} ${x},${y + h}`} fill={fill} stroke={stroke} strokeWidth={1} />;
  } else if (data.kind === 'text') {
    shape = null;
  } else {
    shape = <rect x={x} y={y} width={w} height={h} rx={data.cornerRadius ?? 2} fill={fill} stroke={stroke} strokeWidth={1} />;
  }

  return <g transform={rotation}>{shape}</g>;
}

