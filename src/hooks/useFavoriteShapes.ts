import { useCallback } from 'react';
import { usePersistedState } from './usePersistedState';

// Favorites are a personal UI preference, not diagram content — stored in
// localStorage (global across every diagram this browser opens) rather than
// Firestore, same reasoning as any other local-only view preference in this
// app (e.g. Toolbar's hidden-tags filter).
const STORAGE_KEY = 'simple-presentation:favoriteShapes';

// A small, deliberately-capped quick-access list — not a second copy of the
// whole 301-entry gallery. Kept low enough that the floating panel stays a
// glance-and-click strip, not another palette to scroll.
export const MAX_FAVORITE_SHAPES = 10;

export interface FavoriteShapeId {
  kind: string;
  label: string;
}

function mergeFavorites(defaults: FavoriteShapeId[], parsed: unknown): FavoriteShapeId[] {
  return Array.isArray(parsed) ? parsed : defaults;
}

export function useFavoriteShapes() {
  const [favorites, setFavorites] = usePersistedState<FavoriteShapeId[]>(STORAGE_KEY, [], mergeFavorites);

  const isFavorite = useCallback(
    (kind: string, label: string) => favorites.some(f => f.kind === kind && f.label === label),
    [favorites],
  );

  const toggleFavorite = useCallback((kind: string, label: string) => {
    setFavorites(prev => {
      if (prev.some(f => f.kind === kind && f.label === label)) {
        return prev.filter(f => !(f.kind === kind && f.label === label));
      }
      if (prev.length >= MAX_FAVORITE_SHAPES) return prev;
      return [...prev, { kind, label }];
    });
  }, [setFavorites]);

  return { favorites, isFavorite, toggleFavorite };
}
