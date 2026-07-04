import type { Orientation, PaperSize } from '../types/document';

export interface FramePreset {
  id: string;
  label: string;
  category: 'Paper' | 'Phone' | 'Tablet' | 'Watch' | 'Web' | 'Custom';
  width: number;
  height: number;
}

// Dimensions in diagram px units (96dpi-equivalent), portrait orientation.
// Ids for the original two presets ('A4'/'Letter'/'Custom') deliberately match
// the exact casing already stored on existing DiagramPage docs from before
// this catalog existed, so no data migration is needed.
export const FRAME_PRESETS: FramePreset[] = [
  { id: 'A4', label: 'A4', category: 'Paper', width: 794, height: 1123 },
  { id: 'Letter', label: 'Letter', category: 'Paper', width: 816, height: 1056 },
  { id: 'iphone-15', label: 'iPhone 15 / 14 / 13', category: 'Phone', width: 393, height: 852 },
  { id: 'iphone-se', label: 'iPhone SE', category: 'Phone', width: 375, height: 667 },
  { id: 'android-large', label: 'Android Large', category: 'Phone', width: 360, height: 800 },
  { id: 'ipad-pro-11', label: 'iPad Pro 11"', category: 'Tablet', width: 834, height: 1194 },
  { id: 'ipad-mini', label: 'iPad Mini', category: 'Tablet', width: 744, height: 1133 },
  { id: 'apple-watch-45', label: 'Apple Watch 45mm', category: 'Watch', width: 198, height: 242 },
  { id: 'apple-watch-41', label: 'Apple Watch 41mm', category: 'Watch', width: 176, height: 215 },
  { id: 'desktop-1440', label: 'Desktop 1440', category: 'Web', width: 1440, height: 1024 },
  { id: 'desktop-1920', label: 'Desktop 1920', category: 'Web', width: 1920, height: 1080 },
  { id: 'Custom', label: 'Custom', category: 'Custom', width: 794, height: 1123 },
];

export const FRAME_PRESET_CATEGORIES = ['Paper', 'Phone', 'Tablet', 'Watch', 'Web', 'Custom'] as const;

export function getFramePreset(id: string): FramePreset | undefined {
  return FRAME_PRESETS.find(p => p.id === id);
}

export function getPageDimensions(
  paperSize: PaperSize,
  orientation: Orientation,
  customWidth?: number,
  customHeight?: number,
): { width: number; height: number } {
  let width: number;
  let height: number;
  if (paperSize === 'Custom') {
    width = customWidth ?? 794;
    height = customHeight ?? 1123;
  } else {
    const preset = getFramePreset(paperSize);
    ({ width, height } = preset ?? FRAME_PRESETS[0]);
  }
  if (orientation === 'landscape') {
    [width, height] = [Math.max(width, height), Math.min(width, height)];
  } else {
    [width, height] = [Math.min(width, height), Math.max(width, height)];
  }
  return { width, height };
}
