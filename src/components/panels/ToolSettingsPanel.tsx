import type { ToolId } from '../../types/tools';
import type { PenDefaults, BrushDefaults, ConnectorDefaults } from '../../hooks/useToolDefaults';
import type { ShapeKind, ShapeNodeData } from '../../types/shapes';
import { PenToolPanel } from './PenToolPanel';
import { BrushToolPanel } from './BrushToolPanel';
import { ConnectToolPanel } from './ConnectToolPanel';
import { StylePaintToolPanel } from './StylePaintToolPanel';
import { ToolHintPanel } from './ToolHintPanel';
import { GridRulersPanel } from './GridRulersPanel';
import { TagsPanel } from './TagsPanel';
import { ShapeGalleryPanel } from './ShapeGalleryPanel';

interface Props {
  activeToolId: ToolId | null;
  hasSingleSelectedShape: boolean;
  onClose: () => void;

  penDefaults: PenDefaults;
  onPenChange: (patch: Partial<PenDefaults>) => void;
  brushDefaults: BrushDefaults;
  onBrushChange: (patch: Partial<BrushDefaults>) => void;
  connectDefaults: ConnectorDefaults;
  onConnectChange: (patch: Partial<ConnectorDefaults>) => void;
  stylePaintSource: Partial<ShapeNodeData> | null;
  onStylePaintClear: () => void;

  shapeGalleryOpen: boolean;
  onSelectShape: (kind: ShapeKind, extraData?: Partial<ShapeNodeData>) => void;
  isFavoriteShape: (kind: string, label: string) => boolean;
  favoritesFull: boolean;
  onToggleFavoriteShape: (kind: string, label: string) => void;

  snapEnabled: boolean;
  onToggleSnap: (value: boolean) => void;
  gridSize: number;
  onGridSizeChange: (value: number) => void;
  showRulers: boolean;
  onToggleRulers: (value: boolean) => void;

  allTags: string[];
  hiddenTags: Set<string>;
  onToggleTagVisibility: (tag: string) => void;
}

// Dispatches the one right-side slot shared by every mode/panel toolbar
// button that's new in this pass. Layers/Animation/Data/Validation/Page
// Settings keep rendering from their own long-standing blocks in Canvas.tsx
// (unchanged) — each already gates on `!singleSelectedShape` and owns real,
// complex domain props (variables, pages, sequence items…) that don't
// belong threaded through a second generic dispatcher just for the sake of
// one shared file.
//
// `shapeGalleryOpen` is checked independently of `activeToolId`, not through
// the switch below — picking a shape from the gallery arms placement
// (activeToolId becomes 'shapes'/'hotspot'/'media'), but the gallery panel
// itself is designed to stay open across multiple placements, so it must
// keep rendering even once `activeToolId` has moved on.
export function ToolSettingsPanel({
  activeToolId, hasSingleSelectedShape, onClose,
  penDefaults, onPenChange, brushDefaults, onBrushChange, connectDefaults, onConnectChange,
  stylePaintSource, onStylePaintClear,
  shapeGalleryOpen, onSelectShape, isFavoriteShape, favoritesFull, onToggleFavoriteShape,
  snapEnabled, onToggleSnap, gridSize, onGridSizeChange, showRulers, onToggleRulers,
  allTags, hiddenTags, onToggleTagVisibility,
}: Props) {
  // A shape being selected hands the slot to ShapePropertiesPanel (rendered
  // separately in Canvas.tsx) for every mode/panel here — same precedence
  // the five pre-existing panels already enforce today. Grid & Rulers and
  // Tags are the deliberate exception: they're plain document-view settings
  // with nothing to do with whatever's selected (their old Popover form
  // never cared about selection either), so ShapePropertiesPanel defers to
  // THEM instead — see its own render condition in Canvas.tsx.
  if (hasSingleSelectedShape && activeToolId !== 'gridRulers' && activeToolId !== 'tags') return null;

  switch (activeToolId) {
    case 'pen':
      return <PenToolPanel defaults={penDefaults} onChange={onPenChange} onClose={onClose} />;
    case 'brush':
      return <BrushToolPanel defaults={brushDefaults} onChange={onBrushChange} onClose={onClose} />;
    case 'connect':
      return <ConnectToolPanel defaults={connectDefaults} onChange={onConnectChange} onClose={onClose} />;
    case 'stylePaint':
      return <StylePaintToolPanel source={stylePaintSource} onClear={onStylePaintClear} onClose={onClose} />;
    case 'directSelect':
      return (
        <ToolHintPanel
          title="Direct Selection"
          description="Select a path to edit its anchor points — drag to move, double-click a segment to insert a point, double-click a point to delete it."
          onClose={onClose}
        />
      );
    case 'hotspot':
      return (
        <ToolHintPanel
          title="Hotspot"
          description="Click the canvas to place a clickable link region. Set its destination afterward in the shape's own Link tab."
          onClose={onClose}
        />
      );
    case 'comment':
      return (
        <ToolHintPanel
          title="Comment"
          description="Click the canvas to drop a comment pin and start a thread."
          onClose={onClose}
        />
      );
    case 'gridRulers':
      return (
        <GridRulersPanel
          snapEnabled={snapEnabled} onToggleSnap={onToggleSnap}
          gridSize={gridSize} onGridSizeChange={onGridSizeChange}
          showRulers={showRulers} onToggleRulers={onToggleRulers}
          onClose={onClose}
        />
      );
    case 'tags':
      return <TagsPanel allTags={allTags} hiddenTags={hiddenTags} onToggleTagVisibility={onToggleTagVisibility} onClose={onClose} />;
    default:
      break;
  }

  if (shapeGalleryOpen) {
    return (
      <ShapeGalleryPanel
        onSelect={onSelectShape}
        isFavorite={isFavoriteShape}
        favoritesFull={favoritesFull}
        onToggleFavorite={onToggleFavoriteShape}
        onClose={onClose}
      />
    );
  }

  return null;
}
