import { useRef } from 'react';
import { Tooltip } from 'antd';
import {
  AppstoreOutlined, EditOutlined, ArrowRightOutlined, AimOutlined, PictureOutlined,
  BlockOutlined, BranchesOutlined, PlaySquareOutlined, DatabaseOutlined, DownloadOutlined,
} from '@ant-design/icons';

interface Props {
  leftOffset?: number;

  // Create
  onOpenShapeGallery: () => void;
  isPlacingBasicShape: boolean;
  penMode: boolean;
  onTogglePen: () => void;
  connectMode: boolean;
  onToggleConnect: () => void;
  isPlacingHotspot: boolean;
  onStartPlacingHotspot: () => void;
  onUploadImage: (file: File) => void;

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

function ToolButton({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <Tooltip title={title} placement="right">
      <button
        onClick={onClick}
        style={{
          width: 28, height: 28, border: `1px solid ${active ? '#1677ff' : '#d4d7e0'}`, cursor: 'pointer',
          background: active ? '#EEF4FF' : '#fff', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 6, fontSize: 14, color: active ? '#1677ff' : '#555',
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
  onOpenShapeGallery, isPlacingBasicShape, penMode, onTogglePen, connectMode, onToggleConnect,
  isPlacingHotspot, onStartPlacingHotspot, onUploadImage,
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
      <ToolButton title="Shapes — click, then click the canvas to place" active={isPlacingBasicShape} onClick={onOpenShapeGallery}>
        <AppstoreOutlined />
      </ToolButton>
      <ToolButton title={penMode ? 'Exit pen tool (Esc)' : 'Pen tool — click to place points, drag to curve, click near start to close'} active={penMode} onClick={onTogglePen}>
        <EditOutlined />
      </ToolButton>
      <ToolButton title={connectMode ? 'Exit arrow tool (Esc)' : 'Arrow tool — click-drag from one shape to another to connect them'} active={connectMode} onClick={onToggleConnect}>
        <ArrowRightOutlined />
      </ToolButton>
      <ToolButton title="Hotspot — clickable link region for prototyping" active={isPlacingHotspot} onClick={onStartPlacingHotspot}>
        <AimOutlined />
      </ToolButton>
      <ToolButton title="Image / SVG" onClick={() => fileRef.current?.click()}>
        <PictureOutlined />
      </ToolButton>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.svg"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onUploadImage(file);
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
