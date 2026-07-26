import { useEffect, useState } from 'react';

// Shared localStorage load/merge/persist boilerplate, previously hand-rolled
// identically by useToolDefaults.ts, useFavoriteShapes.ts, and (informally)
// utils/colorSwatches.ts. `merge` lets a caller reconcile a partially-shaped
// parsed value against its own defaults (e.g. per-field nested merging for
// ToolDefaults) — callers with a flat shape can omit it and get a shallow
// `{ ...defaults, ...parsed }` merge instead.
export function usePersistedState<T>(
  key: string,
  defaults: T,
  merge: (defaults: T, parsed: unknown) => T = (d, parsed) =>
    parsed && typeof parsed === 'object' ? { ...d, ...(parsed as Partial<T>) } : d,
): [T, (patchOrUpdater: Partial<T> | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return defaults;
      return merge(defaults, JSON.parse(raw));
    } catch {
      return defaults;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Quota exceeded or unavailable (e.g. private browsing) — silently
      // drop the write, the in-memory value for this session is still fine.
    }
  }, [key, state]);

  function update(patchOrUpdater: Partial<T> | ((prev: T) => T)) {
    setState(prev =>
      typeof patchOrUpdater === 'function' ? (patchOrUpdater as (prev: T) => T)(prev) : { ...prev, ...patchOrUpdater },
    );
  }

  return [state, update];
}
