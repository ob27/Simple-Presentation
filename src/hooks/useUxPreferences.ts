import { useCallback } from 'react';
import { usePersistedState } from './usePersistedState';

// Every toggleable editor-UX behavior lives in one flat object so a single
// settings surface (UxPreferencesDrawer) can list and flip each one
// independently — the whole point is letting the on/off comparison happen
// quickly while the feature set is still being tuned, not a permanent split
// into per-feature storage keys.
export interface UxPreferences {
  // Canvas — migrated from Canvas.tsx's own (previously unpersisted) state.
  snapToGridEnabled: boolean;
  gridSize: number;
  showRulers: boolean;
  smartGuideSnapEnabled: boolean;

  // Selection & Transform
  shiftRotateConstrainEnabled: boolean;
  altResizeFromCenterEnabled: boolean;
  multiSelectRotateEnabled: boolean;
  alignToKeyObjectEnabled: boolean;

  // Editing
  altDragDuplicateEnabled: boolean;
  rightClickContextMenuEnabled: boolean;

  // Zoom
  zoomReadoutEnabled: boolean;
}

const STORAGE_KEY = 'simple-presentation:uxPreferences';

const DEFAULTS: UxPreferences = {
  snapToGridEnabled: true,
  gridSize: 8,
  showRulers: false,
  smartGuideSnapEnabled: true,

  shiftRotateConstrainEnabled: true,
  altResizeFromCenterEnabled: true,
  multiSelectRotateEnabled: true,
  alignToKeyObjectEnabled: true,

  altDragDuplicateEnabled: true,
  rightClickContextMenuEnabled: true,

  zoomReadoutEnabled: true,
};

export function useUxPreferences() {
  const [prefs, setPrefs] = usePersistedState<UxPreferences>(STORAGE_KEY, DEFAULTS);
  const updatePrefs = useCallback((patch: Partial<UxPreferences>) => setPrefs(patch), [setPrefs]);
  return { prefs, updatePrefs };
}
