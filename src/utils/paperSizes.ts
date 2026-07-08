import type { Orientation, PaperSize } from '../types/document';

export interface FramePreset {
  id: string;
  label: string;
  category: 'Paper' | 'Phone' | 'Tablet' | 'Watch' | 'Web' | 'Presentation' | 'Social' | 'Custom';
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
  { id: 'A3', label: 'A3', category: 'Paper', width: 1122, height: 1587 },
  { id: 'A5', label: 'A5', category: 'Paper', width: 559, height: 794 },
  { id: 'business-card', label: 'Business Card', category: 'Paper', width: 336, height: 192 },
  { id: 'iphone-15', label: 'iPhone 15 / 14 / 13', category: 'Phone', width: 393, height: 852 },
  { id: 'iphone-se', label: 'iPhone SE', category: 'Phone', width: 375, height: 667 },
  { id: 'android-large', label: 'Android Large', category: 'Phone', width: 360, height: 800 },
  { id: 'ipad-pro-11', label: 'iPad Pro 11"', category: 'Tablet', width: 834, height: 1194 },
  { id: 'ipad-mini', label: 'iPad Mini', category: 'Tablet', width: 744, height: 1133 },
  { id: 'apple-watch-45', label: 'Apple Watch 45mm', category: 'Watch', width: 198, height: 242 },
  { id: 'apple-watch-41', label: 'Apple Watch 41mm', category: 'Watch', width: 176, height: 215 },
  { id: 'desktop-1440', label: 'Desktop 1440', category: 'Web', width: 1440, height: 1024 },
  { id: 'desktop-1920', label: 'Desktop 1920', category: 'Web', width: 1920, height: 1080 },
  { id: 'powerpoint-16-9', label: 'PowerPoint 16:9', category: 'Presentation', width: 1280, height: 720 },
  { id: 'powerpoint-4-3', label: 'PowerPoint 4:3', category: 'Presentation', width: 960, height: 720 },
  { id: 'instagram-post', label: 'Instagram Post', category: 'Social', width: 1080, height: 1080 },
  { id: 'instagram-story', label: 'Instagram Story', category: 'Social', width: 1080, height: 1920 },
  { id: 'twitter-post', label: 'Twitter/X Post', category: 'Social', width: 1600, height: 900 },
  { id: 'Custom', label: 'Custom', category: 'Custom', width: 794, height: 1123 },
];

export const FRAME_PRESET_CATEGORIES = ['Paper', 'Phone', 'Tablet', 'Watch', 'Web', 'Presentation', 'Social', 'Custom'] as const;

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
