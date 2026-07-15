const STORAGE_KEY = 'simple-presentation:recentColors';
const MAX_RECENT = 12;

// A shared "recent colors" swatch list used by every color picker in the
// app (fill, stroke, font color, ...) — before this, each ColorPicker
// instance was a fully standalone hex field with nothing in common between
// them. Deliberately just localStorage (per-browser, not per-diagram): this
// is a personal palette-of-habits, not diagram content, so it doesn't need
// to sync through Firestore or show up for collaborators.
export function getRecentColors(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

export function addRecentColor(hex: string): string[] {
  const next = [hex, ...getRecentColors().filter(c => c.toLowerCase() !== hex.toLowerCase())].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private browsing, quota) — the swatch
    // list just won't persist across reloads, which isn't worth surfacing.
  }
  return next;
}
