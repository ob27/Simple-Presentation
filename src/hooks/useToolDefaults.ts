import { useCallback, useEffect, useState } from 'react';
import type { EdgeRouting, FlowAnimation, ArrowStyle } from '../types/edges';

// Personal drawing preferences — not diagram content, so localStorage
// (global across every diagram this browser opens), same reasoning already
// used by useFavoriteShapes.ts and utils/colorSwatches.ts's recentColors.
const STORAGE_KEY = 'simple-presentation:toolDefaults';

export interface PenDefaults {
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: 'solid' | 'dashed' | 'dotted';
}

export interface BrushDefaults {
  brushStyle: 'pencil' | 'marker' | 'calligraphy';
  brushBaseWidth: number;
  strokeColor: string;
}

export interface ConnectorDefaults {
  routing: EdgeRouting;
  flowAnimation: FlowAnimation;
  startArrow: ArrowStyle;
  endArrow: ArrowStyle;
}

export interface ToolDefaults {
  pen: PenDefaults;
  brush: BrushDefaults;
  connector: ConnectorDefaults;
}

// Matches the values every one of these tools already hardcoded at creation
// time before this hook existed, so nothing changes visually until a user
// actually opens a tool panel and changes something.
const DEFAULTS: ToolDefaults = {
  pen: { strokeColor: '#7C93E8', strokeWidth: 1.5, strokeStyle: 'solid' },
  brush: { brushStyle: 'pencil', brushBaseWidth: 6, strokeColor: '#1a1a2e' },
  // 'straight' (not 'orthogonal'/elbow) — a straight connector is the more
  // common default expectation; existing users' already-persisted
  // preference is untouched either way since `load()` merges per-field over
  // this hardcoded default, only a fresh/empty localStorage picks this up.
  connector: { routing: 'straight', flowAnimation: 'none', startArrow: 'none', endArrow: 'arrowClosed' },
};

function load(): ToolDefaults {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      pen: { ...DEFAULTS.pen, ...parsed.pen },
      brush: { ...DEFAULTS.brush, ...parsed.brush },
      connector: { ...DEFAULTS.connector, ...parsed.connector },
    };
  } catch {
    return DEFAULTS;
  }
}

export function useToolDefaults() {
  const [defaults, setDefaults] = useState<ToolDefaults>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
  }, [defaults]);

  const updatePenDefaults = useCallback((patch: Partial<PenDefaults>) => {
    setDefaults(d => ({ ...d, pen: { ...d.pen, ...patch } }));
  }, []);
  const updateBrushDefaults = useCallback((patch: Partial<BrushDefaults>) => {
    setDefaults(d => ({ ...d, brush: { ...d.brush, ...patch } }));
  }, []);
  const updateConnectorDefaults = useCallback((patch: Partial<ConnectorDefaults>) => {
    setDefaults(d => ({ ...d, connector: { ...d.connector, ...patch } }));
  }, []);

  return { defaults, updatePenDefaults, updateBrushDefaults, updateConnectorDefaults };
}
