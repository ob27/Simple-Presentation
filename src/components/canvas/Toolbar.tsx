import { useRef } from 'react';
import { Tooltip } from 'antd';
import {
  AppstoreOutlined, EditOutlined, NodeIndexOutlined, ArrowRightOutlined, AimOutlined, PictureOutlined,
  BlockOutlined, BranchesOutlined, PlaySquareOutlined, DatabaseOutlined, DownloadOutlined, BorderOuterOutlined,
  SelectOutlined, MessageOutlined, HighlightOutlined,
} from '@ant-design/icons';

interface Props {
  leftOffset?: number;

  // Create
  isSelectMode: boolean;
  onSelectTool: () => void;
  onOpenShapeGallery: () => void;
  isPlacingBasicShape: boolean;
  penMode: boolean;
  onTogglePen: () => void;
  brushMode: boolean;
  onToggleBrush: () => void;
  directSelectMode: boolean;
  onToggleDirectSelect: () => void;
  directSelectDisabled: boolean;
  connectMode: boolean;
  onToggleConnect: () => void;
  isPlacingHotspot: boolean;
  onStartPlacingHotspot: () => void;
  onUploadMedia: (file: File) => void;
  onInsertContainer: () => void;
  isPlacingComment: boolean;
  onStartPlacingComment: () => void;

  // View / data
  layersPanelOpen: boolean;
  onToggleLayers: () => void;
  highlightMode: boolean;
  onToggleHighlight: () => void;
  animationPanelOpen: boolean;
  onToggleAnimation: () => void;
  dataPanelOpen: boolean;
  onToggleData: () => void;
  onOpenExport: () => void;
}

function ToolButton({
  active, disabled, onClick, title, children,
}: { active?: boolean; disabled?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <Tooltip title={title} placement="right">
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          width: 28, height: 28, border: `1px solid ${active ? '#1677ff' : '#d4d7e0'}`, cursor: disabled ? 'default' : 'pointer',
          background: active ? '#EEF4FF' : '#fff', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 6, fontSize: 14, color: active ? '#1677ff' : '#555', opacity: disabled ? 0.4 : 1,
        }}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function Divider() {
  return <div style={{ height: 1, background: '#e6e8ef', margin: '2px 4px' }} />;
}

// Replaces ShapePalette.tsx — merges the old left-side shape palette AND the
// old top-right icon cluster (pen/layers/branch-highlight/animation/data/
// export) into one toolbar. All the underlying state stays owned by
// Canvas.tsx exactly as it was; this component only renders buttons.
export function Toolbar({
  leftOffset = 16,
  isSelectMode, onSelectTool,
  onOpenShapeGallery, isPlacingBasicShape, penMode, onTogglePen, brushMode, onToggleBrush,
  directSelectMode, onToggleDirectSelect, directSelectDisabled,
  connectMode, onToggleConnect,
  isPlacingHotspot, onStartPlacingHotspot, onUploadMedia, onInsertContainer,
  isPlacingComment, onStartPlacingComment,
  layersPanelOpen, onToggleLayers, highlightMode, onToggleHighlight,
  animationPanelOpen, onToggleAnimation, dataPanelOpen, onToggleData, onOpenExport,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{
      position: 'absolute', top: '50%', left: leftOffset, transform: 'translateY(-50%)',
      transition: 'left 0.15s',
      display: 'flex', flexDirection: 'column', gap: 6, zIndex: 10,
      background: 'rgba(255,255,255,0.95)', borderRadius: 10, padding: 8,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    }}>
      <ToolButton title="Select — click shapes, or drag to select multiple" active={isSelectMode} onClick={onSelectTool}>
        <SelectOutlined />
      </ToolButton>
      <ToolButton title="Shapes — click, then click the canvas to place" active={isPlacingBasicShape} onClick={onOpenShapeGallery}>
        <AppstoreOutlined />
      </ToolButton>
      <ToolButton title={penMode ? 'Exit pen tool (Esc)' : 'Pen tool — click to place points, drag to curve, click near start to close'} active={penMode} onClick={onTogglePen}>
        <EditOutlined />
      </ToolButton>
      <ToolButton title={brushMode ? 'Exit brush tool (Esc)' : 'Brush — freehand stroke with pressure-sensitive width'} active={brushMode} onClick={onToggleBrush}>
        <HighlightOutlined />
      </ToolButton>
      <ToolButton
        title={directSelectDisabled ? 'Direct Selection — select a path first (A)' : directSelectMode ? 'Exit Direct Selection (Esc)' : 'Direct Selection — edit anchor points (A)'}
        active={directSelectMode} disabled={directSelectDisabled} onClick={onToggleDirectSelect}
      >
        <NodeIndexOutlined />
      </ToolButton>
      <ToolButton title={connectMode ? 'Exit arrow tool (Esc)' : 'Arrow tool — click-drag from one shape to another to connect them'} active={connectMode} onClick={onToggleConnect}>
        <ArrowRightOutlined />
      </ToolButton>
      <ToolButton title="Hotspot — clickable link region for prototyping" active={isPlacingHotspot} onClick={onStartPlacingHotspot}>
        <AimOutlined />
      </ToolButton>
      <ToolButton title="Container — a themeable box shapes can be grouped inside (select 2+ shapes first to wrap them, or click with nothing selected to place an empty one)" onClick={onInsertContainer}>
        <BorderOuterOutlined />
      </ToolButton>
      <ToolButton title="Comment — click the canvas to drop a comment pin" active={isPlacingComment} onClick={onStartPlacingComment}>
        <MessageOutlined />
      </ToolButton>
      <ToolButton title="Image / Video / SVG" onClick={() => fileRef.current?.click()}>
        <PictureOutlined />
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

      <Divider />

      <ToolButton title="Layers" active={layersPanelOpen} onClick={onToggleLayers}>
        <BlockOutlined />
      </ToolButton>
      <ToolButton title={highlightMode ? 'Exit branch highlight' : 'Branch highlight — click a shape to trace its downstream path'} active={highlightMode} onClick={onToggleHighlight}>
        <BranchesOutlined />
      </ToolButton>
      <ToolButton title="Animation" active={animationPanelOpen} onClick={onToggleAnimation}>
        <PlaySquareOutlined />
      </ToolButton>
      <ToolButton title="Data" active={dataPanelOpen} onClick={onToggleData}>
        <DatabaseOutlined />
      </ToolButton>
      <ToolButton title="Export" onClick={onOpenExport}>
        <DownloadOutlined />
      </ToolButton>
    </div>
  );
}
