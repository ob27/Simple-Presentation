import { useLayoutEffect, useRef, useState } from 'react';
import { Tooltip, Popover } from 'antd';
import {
  IconShapes, IconPenTool, IconDirectSelect, IconConnector, IconHotspot, IconImage,
  IconLayers, IconBranchHighlight, IconAnimationPanel, IconVariables, IconExport, IconContainer,
  IconSelect, IconComment, IconBrush, IconStylePaint, IconUndo, IconRedo, IconHelp,
  IconRulerGrid, IconTags, IconValidation, IconSettingsGear, IconTextTool, IconMore,
} from '../icons';
import type { ToolId } from '../../types/tools';

interface Props {
  // History
  onUndo: () => void;
  onRedo: () => void;

  // Every toggleable button (drawing tool or right-side panel) shares one
  // active slot — see selectTool()/ToolId in Canvas.tsx.
  activeTool: ToolId | null;
  onSelectTool: (id: ToolId) => void;
  directSelectDisabled: boolean;

  // These arm placement with data a plain ToolId can't carry (a file, an
  // icon kind), so they stay their own callbacks rather than going through
  // onSelectTool.
  onStartPlacingHotspot: () => void;
  onStartPlacingText: () => void;
  onUploadMedia: (file: File) => void;
  onInsertContainer: () => void;

  onOpenExport: () => void;
  onOpenShortcuts: () => void;
}

const BUTTON_W = 28;
const GAP = 6;
const DIVIDER_W = 9; // 1px border + ~4px margin each side

// Rough (not pixel-exact) width estimate for a run of N fixed-size icon
// buttons with a `gap: 6` between them — good enough to decide an overflow
// threshold, not meant to be exact to the pixel.
function runWidth(buttonCount: number): number {
  return buttonCount * BUTTON_W + Math.max(0, buttonCount - 1) * GAP;
}

function ToolButton({
  active, disabled, onClick, title, children,
}: { active?: boolean; disabled?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <Tooltip title={title} placement="bottom">
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          width: 28, height: 28, border: `1px solid ${active ? '#1677ff' : '#d4d7e0'}`, cursor: disabled ? 'default' : 'pointer',
          background: active ? '#EEF4FF' : '#fff', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 6, fontSize: 14, color: active ? '#1677ff' : '#555', opacity: disabled ? 0.4 : 1, flexShrink: 0,
        }}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function Divider() {
  return <div style={{ width: 1, background: '#e6e8ef', margin: '4px 2px', flexShrink: 0 }} />;
}

// Replaces ShapePalette.tsx — merges the old left-side shape palette AND the
// old top-right icon cluster (pen/layers/branch-highlight/animation/data/
// export) into one toolbar. All the underlying state stays owned by
// Canvas.tsx exactly as it was; this component only renders buttons.
//
// Rendered into a slot inside the document header (via portal from
// Canvas.tsx) rather than floating over the canvas, so it needs no
// positioning of its own — just an inline row of buttons.
//
// Responsive: with 24 buttons across 6 groups, this row can easily out-grow
// the space DocumentEditor.tsx's header actually has between the title and
// the right-side controls (Share/Pages-Master toggle/version history/
// Presenter/Present), especially with a long document title. Rather than
// silently overlapping those neighbors, the two least-core groups ("panels"
// and "misc" below) collapse into a single "…" button + popover once a
// ResizeObserver on this row's own container reports too little width —
// first "misc" (branch highlight/grid/tags/export/help), then "panels"
// (layers/animation/data/validation/page settings) if space is tighter
// still. The core interaction groups (history, select, creation tools,
// connector/comment) never collapse.
export function Toolbar({
  onUndo, onRedo,
  activeTool, onSelectTool, directSelectDisabled,
  onStartPlacingHotspot, onStartPlacingText, onUploadMedia, onInsertContainer,
  onOpenExport, onOpenShortcuts,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) setAvailableWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const history = (
    <>
      <ToolButton title="Undo (Cmd/Ctrl+Z)" onClick={onUndo}><IconUndo /></ToolButton>
      <ToolButton title="Redo (Cmd/Ctrl+Shift+Z)" onClick={onRedo}><IconRedo /></ToolButton>
    </>
  );
  const selection = (
    <>
      <ToolButton title="Select — click shapes, or drag to select multiple" active={activeTool === null} onClick={() => onSelectTool('select')}>
        <IconSelect />
      </ToolButton>
      <ToolButton
        title={directSelectDisabled ? 'Direct Selection — select a path first (A)' : activeTool === 'directSelect' ? 'Exit Direct Selection (Esc)' : 'Direct Selection — edit anchor points (A)'}
        active={activeTool === 'directSelect'} disabled={directSelectDisabled} onClick={() => onSelectTool('directSelect')}
      >
        <IconDirectSelect />
      </ToolButton>
    </>
  );
  const creation = (
    <>
      <ToolButton title="Shapes — browse the shape library" active={activeTool === 'shapeGallery' || activeTool === 'shapes'} onClick={() => onSelectTool('shapeGallery')}>
        <IconShapes />
      </ToolButton>
      <ToolButton title="Text — click the canvas to place a text box" active={activeTool === 'text'} onClick={onStartPlacingText}>
        <IconTextTool />
      </ToolButton>
      <ToolButton title={activeTool === 'pen' ? 'Exit pen tool (Esc)' : 'Pen tool — click to place points, drag to curve, click near start to close'} active={activeTool === 'pen'} onClick={() => onSelectTool('pen')}>
        <IconPenTool />
      </ToolButton>
      <ToolButton title={activeTool === 'brush' ? 'Exit brush tool (Esc)' : 'Brush — freehand stroke with pressure-sensitive width'} active={activeTool === 'brush'} onClick={() => onSelectTool('brush')}>
        <IconBrush />
      </ToolButton>
      <ToolButton
        title={activeTool === 'stylePaint' ? 'Exit Style Paint (Esc)' : 'Style Paint — click a shape to copy its look, then click others to apply it'}
        active={activeTool === 'stylePaint'} onClick={() => onSelectTool('stylePaint')}
      >
        <IconStylePaint />
      </ToolButton>
      <ToolButton title="Container — a styleable frame (background, border theme, swimlane) shapes can be grouped inside (select 2+ shapes first to wrap them, or click with nothing selected to place an empty one)" onClick={onInsertContainer}>
        <IconContainer />
      </ToolButton>
      <ToolButton title="Hotspot — clickable link region for prototyping" active={activeTool === 'hotspot'} onClick={onStartPlacingHotspot}>
        <IconHotspot />
      </ToolButton>
      <ToolButton title="Image / Video / SVG" active={activeTool === 'media'} onClick={() => fileRef.current?.click()}>
        <IconImage />
      </ToolButton>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*,.svg"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onUploadMedia(file);
        }}
      />
    </>
  );
  const connect = (
    <>
      <ToolButton title={activeTool === 'connect' ? 'Exit arrow tool (Esc)' : 'Arrow tool — click-drag from one shape to another to connect them'} active={activeTool === 'connect'} onClick={() => onSelectTool('connect')}>
        <IconConnector />
      </ToolButton>
      <ToolButton title="Comment — click the canvas to drop a comment pin" active={activeTool === 'comment'} onClick={() => onSelectTool('comment')}>
        <IconComment />
      </ToolButton>
    </>
  );
  const panels = (
    <>
      <ToolButton title="Layers" active={activeTool === 'layers'} onClick={() => onSelectTool('layers')}>
        <IconLayers />
      </ToolButton>
      <ToolButton title="Animation" active={activeTool === 'animation'} onClick={() => onSelectTool('animation')}>
        <IconAnimationPanel />
      </ToolButton>
      <ToolButton title="Data — named variables (used by data-binding and CSV import)" active={activeTool === 'data'} onClick={() => onSelectTool('data')}>
        <IconVariables />
      </ToolButton>
      <ToolButton title="Check Diagram" active={activeTool === 'validation'} onClick={() => onSelectTool('validation')}>
        <IconValidation />
      </ToolButton>
      <ToolButton title="Page settings — size, margins, master, header/footer, page numbers" active={activeTool === 'pageSettings'} onClick={() => onSelectTool('pageSettings')}>
        <IconSettingsGear />
      </ToolButton>
    </>
  );
  const misc = (
    <>
      <ToolButton title={activeTool === 'highlight' ? 'Exit branch highlight' : 'Branch highlight — click a shape to trace its downstream path'} active={activeTool === 'highlight'} onClick={() => onSelectTool('highlight')}>
        <IconBranchHighlight />
      </ToolButton>
      <ToolButton title="Grid & rulers" active={activeTool === 'gridRulers'} onClick={() => onSelectTool('gridRulers')}>
        <IconRulerGrid />
      </ToolButton>
      <ToolButton title="Tags" active={activeTool === 'tags'} onClick={() => onSelectTool('tags')}>
        <IconTags />
      </ToolButton>
      <ToolButton title="Export" onClick={onOpenExport}>
        <IconExport />
      </ToolButton>
      <ToolButton title="Keyboard shortcuts (?)" onClick={onOpenShortcuts}>
        <IconHelp />
      </ToolButton>
    </>
  );

  // Fixed widths for the always-visible groups (never collapse) plus the
  // dividers between them — history | select | creation | connect.
  const coreWidth = runWidth(2) + DIVIDER_W + runWidth(2) + DIVIDER_W + runWidth(8) + DIVIDER_W + runWidth(2);
  const panelsWidth = runWidth(5);
  const miscWidth = runWidth(5);
  const overflowButtonWidth = BUTTON_W;

  // Unknown width yet (first paint, before the ResizeObserver reports) —
  // show everything rather than flash a collapsed state that immediately
  // expands once the real width is known.
  const showPanels = availableWidth === null || availableWidth >= coreWidth + DIVIDER_W + panelsWidth + DIVIDER_W + miscWidth;
  const showMisc = showPanels;
  // Panels alone (misc collapsed) still fits without needing the overflow
  // button reserved, since it's already accounted for below.
  const showPanelsOnly = !showMisc && (availableWidth === null || availableWidth >= coreWidth + DIVIDER_W + panelsWidth + GAP + overflowButtonWidth);

  const overflowContent: React.ReactNode[] = [];
  if (!showMisc && !showPanelsOnly) overflowContent.push(<div key="panels" style={{ display: 'flex', gap: 6 }}>{panels}</div>);
  if (!showMisc) overflowContent.push(<div key="misc" style={{ display: 'flex', gap: 6 }}>{misc}</div>);

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'row', gap: 6, alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
      {history}
      <Divider />
      {selection}
      <Divider />
      {creation}
      <Divider />
      {connect}
      {(showPanels || showPanelsOnly) && (
        <>
          <Divider />
          {panels}
        </>
      )}
      {showMisc && (
        <>
          <Divider />
          {misc}
        </>
      )}
      {overflowContent.length > 0 && (
        <>
          <Divider />
          <Popover
            trigger="click"
            placement="bottomRight"
            content={<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{overflowContent}</div>}
          >
            <button
              title="More tools"
              style={{
                width: 28, height: 28, border: '1px solid #d4d7e0', cursor: 'pointer', background: '#fff', padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, color: '#555', flexShrink: 0,
              }}
            >
              <IconMore />
            </button>
          </Popover>
        </>
      )}
    </div>
  );
}
