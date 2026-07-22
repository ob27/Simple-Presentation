import { useState } from 'react';
import type { Node } from '@xyflow/react';
import { Button, Input, Select, Radio, Switch, InputNumber, Popconfirm, Tooltip } from 'antd';
import { IconClose, IconDelete } from '../icons';
import type { DiagramPage, PageNumberPosition, PageNumberStyle } from '../../types/document';
import { FRAME_PRESETS, getPageDimensions } from '../../utils/paperSizes';
import { updatePage, deletePage } from '../../store';
import { ColorPickerField } from './ColorPickerField';
import { PeekableDrawer } from './PeekableDrawer';

const PAGE_NUMBER_STYLE_OPTIONS: { value: PageNumberStyle; label: string }[] = [
  { value: 'plain', label: '1, 2, 3…' },
  { value: 'page-prefix', label: 'Page 1' },
  { value: 'of-total', label: '1 of N' },
];

const POSITION_GRID: PageNumberPosition[] = [
  'top-left', 'top-center', 'top-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

function PositionPicker({ value, onChange }: { value: PageNumberPosition; onChange: (v: PageNumberPosition) => void }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)',
      gap: 4, width: 96, height: 64, padding: 4, border: '1px solid #e6e8ef', borderRadius: 6, background: '#fafbfc',
    }}>
      {POSITION_GRID.map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          title={p.replace('-', ' ')}
          style={{
            border: 'none', borderRadius: 3, cursor: 'pointer', padding: 0,
            background: value === p ? '#1677ff' : '#e4e6ee',
          }}
        />
      ))}
    </div>
  );
}

interface Props {
  diagramId: string;
  page: DiagramPage;
  // Always the real, non-master content pages regardless of which mode is
  // currently being edited (Canvas.tsx passes its viewMode-independent
  // regularPages here) — needed so "used by N pages" and "can't delete the
  // last page" mean the same thing whether you're deleting a regular page
  // or a master.
  pages: DiagramPage[];
  masterPages: DiagramPage[];
  pageOrigin: number;
  pageShapes: Node[];
  onResizePageContent: (pageId: string, scaleX: number, scaleY: number, pageOrigin: number) => void;
  onClose: () => void;
  // Opens "New Master" pre-seeded to a specific format — used by the "no
  // matching master yet" affordance below.
  onCreateMasterForFormat?: (paperSize: string, orientation: 'portrait' | 'landscape', customWidth?: number, customHeight?: number) => void;
}

// Ported from PageNavigatorRail's old floating-Popover `PageSettingsForm` and
// consolidated here as a proper right-hand panel — the Popover version got
// cramped fast once page numbers (style + a 2D location picker) were added
// on top of everything margins/header/footer/master already needed. This
// same panel now also opens for master pages themselves (Master Pages mode
// reuses the entire regular page-editing UI) — see the `page.isMaster`
// branches below for what differs in that case.
export function PageSettingsPanel({ diagramId, page, pages, masterPages, pageOrigin, pageShapes, onResizePageContent, onClose, onCreateMasterForFormat }: Props) {
  const [name, setName] = useState(page.name);
  const [paperSize, setPaperSize] = useState(page.paperSize);
  const [orientation, setOrientation] = useState(page.orientation);
  const [scaleContent, setScaleContent] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const [marginTop, setMarginTop] = useState(page.marginTop ?? 0);
  const [marginRight, setMarginRight] = useState(page.marginRight ?? 0);
  const [marginBottom, setMarginBottom] = useState(page.marginBottom ?? 0);
  const [marginLeft, setMarginLeft] = useState(page.marginLeft ?? 0);
  const [headerText, setHeaderText] = useState(page.headerText ?? '');
  const [footerText, setFooterText] = useState(page.footerText ?? '');
  const [masterPageId, setMasterPageId] = useState(page.masterPageId);
  const [backgroundColor, setBackgroundColor] = useState(page.backgroundColor);
  const [notes, setNotes] = useState(page.notes ?? '');
  const [pageNumberEnabled, setPageNumberEnabled] = useState(page.pageNumberEnabled ?? false);
  const [pageNumberStyle, setPageNumberStyle] = useState<PageNumberStyle>(page.pageNumberStyle ?? 'plain');
  const [pageNumberPosition, setPageNumberPosition] = useState<PageNumberPosition>(page.pageNumberPosition ?? 'bottom-right');

  function commit() {
    if (scaleContent && pageShapes.length > 0) {
      const oldDims = getPageDimensions(page.paperSize, page.orientation, page.customWidth, page.customHeight);
      const newDims = getPageDimensions(paperSize, orientation, page.customWidth, page.customHeight);
      if (oldDims.width !== newDims.width || oldDims.height !== newDims.height) {
        onResizePageContent(page.id, newDims.width / oldDims.width, newDims.height / oldDims.height, pageOrigin);
      }
    }
    updatePage(diagramId, page.id, {
      name, paperSize, orientation,
      marginTop, marginRight, marginBottom, marginLeft,
      headerText: headerText || undefined, footerText: footerText || undefined,
      masterPageId: masterPageId || undefined, backgroundColor: backgroundColor || undefined,
      notes: notes || undefined,
      pageNumberEnabled, pageNumberStyle, pageNumberPosition,
    });
  }

  return (
    <PeekableDrawer>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#1a1a2e' }}>Page settings</span>
        <Button size="small" type="text" icon={<IconClose />} onClick={onClose} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Input size="small" value={name} onChange={e => setName(e.target.value)} onPressEnter={commit} placeholder="Page name" />

        <div style={{ display: 'flex', gap: 8 }}>
          <Select
            size="small" style={{ flex: 1 }}
            value={paperSize}
            options={FRAME_PRESETS.map(p => ({ value: p.id, label: p.label }))}
            onChange={setPaperSize}
          />
          <Radio.Group size="small" value={orientation} onChange={e => setOrientation(e.target.value)}>
            <Radio.Button value="portrait">Portrait</Radio.Button>
            <Radio.Button value="landscape">Landscape</Radio.Button>
          </Radio.Group>
        </div>

        {/* A master can't itself have a master — no nested masters. */}
        {!page.isMaster && (() => {
          const pageDims = getPageDimensions(paperSize, orientation, page.customWidth, page.customHeight);
          const matchingMasters = masterPages.filter(m => {
            const d = getPageDimensions(m.paperSize, m.orientation, m.customWidth, m.customHeight);
            return d.width === pageDims.width && d.height === pageDims.height;
          });
          return (
            <div>
              <Tooltip title="Inherit this master's background, header, footer & shape content — shapes on the master render live and locked here, unless individually detached">
                <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>Master page</div>
              </Tooltip>
              {matchingMasters.length > 0 ? (
                <Select
                  size="small" style={{ width: '100%' }}
                  allowClear
                  placeholder="No master page"
                  value={masterPageId}
                  options={matchingMasters.map(m => ({ value: m.id, label: m.name }))}
                  onChange={v => setMasterPageId(v ?? undefined)}
                />
              ) : (
                <div style={{ fontSize: 12, color: '#999' }}>
                  No {pageDims.width}×{pageDims.height} master pages yet.{' '}
                  <Button
                    size="small" type="link" style={{ padding: 0, height: 'auto' }}
                    onClick={() => onCreateMasterForFormat?.(paperSize, orientation, page.customWidth, page.customHeight)}
                  >
                    Create one
                  </Button>
                </div>
              )}
            </div>
          );
        })()}

        {pageShapes.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Tooltip title="Rescale this page's shapes to fit the new dimensions, instead of leaving them at their old size/position">
              <span style={{ fontSize: 12, color: '#666' }}>Scale content to fit</span>
            </Tooltip>
            <Switch size="small" checked={scaleContent} onChange={setScaleContent} />
          </div>
        )}

        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>Page numbers</span>
            <Switch size="small" checked={pageNumberEnabled} onChange={setPageNumberEnabled} />
          </div>
          {pageNumberEnabled && (
            <>
              <div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>Style</div>
                <Select
                  size="small" style={{ width: '100%' }}
                  value={pageNumberStyle}
                  options={PAGE_NUMBER_STYLE_OPTIONS}
                  onChange={setPageNumberStyle}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>Location</div>
                <PositionPicker value={pageNumberPosition} onChange={setPageNumberPosition} />
              </div>
            </>
          )}
        </div>

        <Button size="small" type="text" onClick={() => setShowMore(o => !o)} style={{ alignSelf: 'flex-start', padding: 0 }}>
          {showMore ? 'Hide' : 'Show'} margins &amp; header/footer
        </Button>
        {showMore && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: '#aaa' }}>Margins (mm)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <InputNumber size="small" addonBefore="T" min={0} value={marginTop} onChange={v => setMarginTop(v ?? 0)} />
              <InputNumber size="small" addonBefore="R" min={0} value={marginRight} onChange={v => setMarginRight(v ?? 0)} />
              <InputNumber size="small" addonBefore="B" min={0} value={marginBottom} onChange={v => setMarginBottom(v ?? 0)} />
              <InputNumber size="small" addonBefore="L" min={0} value={marginLeft} onChange={v => setMarginLeft(v ?? 0)} />
            </div>
            <Input
              size="small" placeholder="Header text (use {page}/{pages})" value={headerText}
              onChange={e => setHeaderText(e.target.value)}
            />
            <Input
              size="small" placeholder="Footer text (use {page}/{pages})" value={footerText}
              onChange={e => setFooterText(e.target.value)}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Tooltip title={masterPageId ? "Leave unset to use the master page's background" : 'Background color'}>
                <span style={{ fontSize: 12, color: '#666' }}>Background</span>
              </Tooltip>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {backgroundColor && (
                  <Button size="small" type="text" onClick={() => setBackgroundColor(undefined)} style={{ fontSize: 11, color: '#999', padding: '0 4px' }}>
                    Clear
                  </Button>
                )}
                <ColorPickerField value={backgroundColor ?? '#ffffff'} onChangeComplete={setBackgroundColor} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#aaa' }}>Speaker notes (Presenter View only)</div>
            <Input.TextArea
              size="small" rows={3} placeholder="Notes for this page" value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '10px 14px', borderTop: '1px solid #f0f0f0' }}>
        <Button size="small" type="primary" onClick={commit} style={{ flex: 1 }}>Save</Button>
        {(() => {
          // "Can't delete the last page" only makes sense for a regular
          // content page — a document can have zero master pages just fine.
          const disabled = !page.isMaster && pages.length <= 1;
          const referencing = page.isMaster ? pages.filter(p => p.masterPageId === page.id) : [];
          function handleDelete() {
            // A deleted master leaves referencing pages with a dangling
            // masterPageId otherwise — harmless at render time (Canvas's
            // lookup just falls through to "no master found"), but it'd
            // silently resurrect if a master with that id ever existed
            // again, and would keep offering a "Detach from master" action
            // for shapes that no longer have a live source.
            for (const p of referencing) updatePage(diagramId, p.id, { masterPageId: undefined });
            deletePage(diagramId, page.id);
            onClose();
          }
          return (
            <Popconfirm
              title={page.isMaster ? 'Delete this master?' : 'Delete this page?'}
              description={page.isMaster && referencing.length > 0
                ? `${referencing.length} page${referencing.length === 1 ? '' : 's'} using this master will lose its shape content, background, header & footer — not just fall back to a default.`
                : undefined}
              disabled={disabled}
              onConfirm={handleDelete}
            >
              <Button size="small" danger icon={<IconDelete />} disabled={disabled} />
            </Popconfirm>
          );
        })()}
      </div>
    </PeekableDrawer>
  );
}
