import { useState, Fragment } from 'react';
import { Tooltip, Popover, Input, Button, Popconfirm } from 'antd';
import { IconSettingsGear, IconAdd, IconInfo, IconDelete } from '../icons';
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
import { updatePage, addMasterPage, deletePage } from '../../store';
import { ColorPickerField } from '../panels/ColorPickerField';
import { PAGE_X } from '../../constants';

interface Props {
  diagramId: string;
  pages: DiagramPage[];
  masterPages: DiagramPage[];
  pageOrigins: Map<string, number>;
  pageDimensions: Map<string, { width: number; height: number }>;
  shapeNodes: Node[];
  onSelectPage: (pageId: string) => void;
  onInsertPageAt: (afterOrder: number) => void;
  onReorderPages: (pages: DiagramPage[]) => void;
  onOpenPageSettings: (pageId: string) => void;
}

const THUMB_MAX_WIDTH = 132;
const THUMB_MAX_HEIGHT = 132;

// Docked to the left, full page height, top-aligned — a traditional
// slide-panel layout (à la PowerPoint) rather than the floating
// vertically-centered rail this replaced. Each thumbnail renders the
// page's actual shapes, scaled into an SVG viewBox sized to that page's
// real paper dimensions, so both the aspect ratio/orientation AND the
// rough visual content stay live and accurate — not just a placeholder
// block standing in for the page.
export function PageNavigatorRail({ diagramId, pages, masterPages, pageOrigins, pageDimensions, shapeNodes, onSelectPage, onInsertPageAt, onReorderPages, onOpenPageSettings }: Props) {
  const activePageId = useActivePageId(pages, pageOrigins, pageDimensions);
  const [masterSettingsOpenFor, setMasterSettingsOpenFor] = useState<string | null>(null);

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

  // Deleting a master doesn't cascade to the pages pointing at it — they'd
  // otherwise keep a dangling masterPageId forever (harmless at render time,
  // since Canvas.tsx's lookup just falls through to "no master found," but
  // it'd silently resurrect if a master with the same id ever existed
  // again). Clearing it here means "Master page" cleanly shows "No master
  // page" for every page that referenced this one.
  function handleDeleteMaster(masterId: string) {
    const referencing = pages.filter(p => p.masterPageId === masterId);
    for (const p of referencing) updatePage(diagramId, p.id, { masterPageId: undefined });
    deletePage(diagramId, masterId);
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
                  onSelectPage={onSelectPage}
                  onOpenPageSettings={onOpenPageSettings}
                />
                <PageGap afterOrder={page.order} onInsert={onInsertPageAt} />
              </Fragment>
            );
          })}
        </SortableContext>
      </DndContext>

      <MastersSection
        diagramId={diagramId} masterPages={masterPages} pages={pages}
        settingsOpenFor={masterSettingsOpenFor} setSettingsOpenFor={setMasterSettingsOpenFor}
        onDeleteMaster={handleDeleteMaster}
      />
    </div>
  );
}

// Master pages are never navigated to, reordered alongside regular pages,
// presented, or exported — they're only ever a target for a regular page's
// "Master page" dropdown (see PageSettingsForm below) — so this is a plain
// list, not a draggable/thumbnail strip like the section above.
function MastersSection({ diagramId, masterPages, pages, settingsOpenFor, setSettingsOpenFor, onDeleteMaster }: {
  diagramId: string;
  masterPages: DiagramPage[];
  pages: DiagramPage[];
  settingsOpenFor: string | null;
  setSettingsOpenFor: (id: string | null) => void;
  onDeleteMaster: (masterId: string) => void;
}) {
  return (
    <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #e6e8ef', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#999', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Masters
        </span>
        <Tooltip
          title="A master isn't a real page in your deck — it's a reusable background, header & footer preset that other pages can pick up in their own page settings, so you can update all of them at once from here."
          placement="right"
        >
          <IconInfo style={{ fontSize: 12, color: '#aaa', cursor: 'help' }} />
        </Tooltip>
      </div>
      {masterPages.map(master => (
        <Popover
          key={master.id}
          open={settingsOpenFor === master.id}
          onOpenChange={open => setSettingsOpenFor(open ? master.id : null)}
          trigger="click"
          placement="right"
          content={settingsOpenFor === master.id
            ? (
              <MasterPageSettingsForm
                diagramId={diagramId} page={master}
                usedByCount={pages.filter(p => p.masterPageId === master.id).length}
                onClose={() => setSettingsOpenFor(null)}
                onDelete={() => { onDeleteMaster(master.id); setSettingsOpenFor(null); }}
              />
            )
            : null}
        >
          <div
            onClick={() => setSettingsOpenFor(master.id)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
              fontSize: 12, color: '#555', cursor: 'pointer', padding: '4px 2px', borderRadius: 4,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{master.name}</span>
            <IconSettingsGear style={{ fontSize: 11, color: '#aaa', flexShrink: 0 }} />
          </div>
        </Popover>
      ))}
      <Button
        size="small" type="dashed" icon={<IconAdd />}
        onClick={() => addMasterPage(diagramId, `Master ${masterPages.length + 1}`)}
      >
        New master
      </Button>
    </div>
  );
}

function MasterPageSettingsForm({ diagramId, page, usedByCount, onClose, onDelete }: {
  diagramId: string;
  page: DiagramPage;
  usedByCount: number;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(page.name);
  const [backgroundColor, setBackgroundColor] = useState(page.backgroundColor ?? '#ffffff');
  const [headerText, setHeaderText] = useState(page.headerText ?? '');
  const [footerText, setFooterText] = useState(page.footerText ?? '');

  function commit() {
    updatePage(diagramId, page.id, {
      name, backgroundColor,
      headerText: headerText || undefined, footerText: footerText || undefined,
    });
    onClose();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 220 }}>
      <Input size="small" value={name} onChange={e => setName(e.target.value)} onPressEnter={commit} placeholder="Master name" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: '#666' }}>Background</span>
        <ColorPickerField value={backgroundColor} onChangeComplete={setBackgroundColor} />
      </div>
      <Input
        size="small" placeholder="Header text (use {page}/{pages})" value={headerText}
        onChange={e => setHeaderText(e.target.value)}
      />
      <Input
        size="small" placeholder="Footer text (use {page}/{pages})" value={footerText}
        onChange={e => setFooterText(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="small" type="primary" onClick={commit} style={{ flex: 1 }}>Save</Button>
        <Popconfirm
          title="Delete this master?"
          description={usedByCount > 0
            ? `${usedByCount} page${usedByCount === 1 ? '' : 's'} using it will fall back to their own background/header/footer.`
            : undefined}
          onConfirm={onDelete}
        >
          <Button size="small" danger icon={<IconDelete />} />
        </Popconfirm>
      </div>
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
  page, index, activePageId, thumbW, thumbH, dims, origin, pageShapes, onSelectPage, onOpenPageSettings,
}: {
  page: DiagramPage;
  index: number;
  activePageId: string | undefined;
  thumbW: number;
  thumbH: number;
  dims: { width: number; height: number };
  origin: number;
  pageShapes: Node[];
  onSelectPage: (pageId: string) => void;
  onOpenPageSettings: (pageId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });

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
      <Tooltip title={`${page.name} — opens page settings in the sidebar`} placement="right">
        <div
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
            {pageShapes.map(n => (
              <ThumbnailShape key={n.id} node={n} pageX={PAGE_X} pageOrigin={origin} />
            ))}
          </svg>
        </div>
      </Tooltip>
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

