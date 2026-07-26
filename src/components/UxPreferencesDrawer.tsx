import { Drawer, Select, Switch } from 'antd';
import type { UxPreferences } from '../hooks/useUxPreferences';

interface Props {
  open: boolean;
  prefs: UxPreferences;
  onChange: (patch: Partial<UxPreferences>) => void;
  onClose: () => void;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <div style={{ fontWeight: 600, fontSize: 13, color: '#555', marginBottom: 10, marginTop: 20 }}>{children}</div>;
}

function ToggleRow({
  label, description, checked, onChange, extra,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  extra?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13 }}>{label}</div>
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{description}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {extra}
        <Switch size="small" checked={checked} onChange={onChange} />
      </div>
    </div>
  );
}

// Every row here is a bare, immediately-applied Switch with no Save step —
// the whole point of this drawer is letting each new gesture/behavior be
// flipped on and off quickly while its feel is still being evaluated, so
// friction between "try it" and "see the effect" defeats the purpose.
export function UxPreferencesDrawer({ open, prefs, onChange, onClose }: Props) {
  return (
    <Drawer title="Preferences" open={open} onClose={onClose} width={380}>
      <SectionHeader>Canvas</SectionHeader>
      <ToggleRow
        label="Snap to grid"
        description="Dragged shapes snap to the grid spacing below."
        checked={prefs.snapToGridEnabled}
        onChange={v => onChange({ snapToGridEnabled: v })}
        extra={
          <Select
            size="small" style={{ width: 80 }} value={prefs.gridSize}
            onChange={v => onChange({ gridSize: v })}
            options={[4, 8, 16, 24, 32].map(v => ({ value: v, label: `${v}px` }))}
          />
        }
      />
      <ToggleRow
        label="Show rulers"
        description="Ruler bars along the top and left of the canvas."
        checked={prefs.showRulers}
        onChange={v => onChange({ showRulers: v })}
      />
      <ToggleRow
        label="Smart guide snapping"
        description="Dragged shapes snap to the edges/center of nearby shapes, not just the grid."
        checked={prefs.smartGuideSnapEnabled}
        onChange={v => onChange({ smartGuideSnapEnabled: v })}
      />

      <SectionHeader>Selection &amp; Transform</SectionHeader>
      <ToggleRow
        label="Constrain rotation to 15° (Shift)"
        description="Hold Shift while rotating a shape to snap to 15° increments."
        checked={prefs.shiftRotateConstrainEnabled}
        onChange={v => onChange({ shiftRotateConstrainEnabled: v })}
      />
      <ToggleRow
        label="Resize from center (Alt)"
        description="Hold Alt/Option while resizing so the shape grows or shrinks around its own center."
        checked={prefs.altResizeFromCenterEnabled}
        onChange={v => onChange({ altResizeFromCenterEnabled: v })}
      />
      <ToggleRow
        label="Rotate multiple shapes together"
        description="Adds a rotate handle to a multi-shape selection."
        checked={prefs.multiSelectRotateEnabled}
        onChange={v => onChange({ multiSelectRotateEnabled: v })}
      />
      <ToggleRow
        label="Align to key object"
        description="Click an already-selected shape again to align the rest of the selection to it."
        checked={prefs.alignToKeyObjectEnabled}
        onChange={v => onChange({ alignToKeyObjectEnabled: v })}
      />

      <SectionHeader>Editing</SectionHeader>
      <ToggleRow
        label="Alt-drag to duplicate"
        description="Hold Alt/Option while dragging a shape to drop a copy and leave the original in place."
        checked={prefs.altDragDuplicateEnabled}
        onChange={v => onChange({ altDragDuplicateEnabled: v })}
      />
      <ToggleRow
        label="Right-click context menu"
        description="Right-click a shape for quick actions like bring-to-front and duplicate."
        checked={prefs.rightClickContextMenuEnabled}
        onChange={v => onChange({ rightClickContextMenuEnabled: v })}
      />

      <SectionHeader>Zoom</SectionHeader>
      <ToggleRow
        label="Show zoom percentage"
        description="Display the current zoom level near the canvas controls."
        checked={prefs.zoomReadoutEnabled}
        onChange={v => onChange({ zoomReadoutEnabled: v })}
      />
    </Drawer>
  );
}
