import { getFramePreset } from './paperSizes';
import type { PresentationSettings } from '../types/document';

// Shared by PresentationView (the real background) and PresentationFrame
// (the mask hiding canvas content outside the frame) — both must use the
// exact same gradient with `backgroundAttachment: 'fixed'` so the mask
// reveals a slice of one continuous virtual background rather than looking
// like a visibly separate layer.
export const AMBIENT_GRADIENT = `
  radial-gradient(circle at 18% 15%, #6b3fae 0%, transparent 45%),
  radial-gradient(circle at 82% 25%, #c34e9c 0%, transparent 50%),
  radial-gradient(circle at 50% 95%, #4527a0 0%, transparent 55%),
  linear-gradient(135deg, #2a0f52 0%, #170a38 100%)
`;

export const DEFAULT_PRESENTATION_SETTINGS: PresentationSettings = {
  frameMode: 'auto',
  roundedCorners: true,
  frameColor: '#0d0d10',
  pageTransition: 'none',
};

export type FrameKind = 'phone' | 'tablet' | 'watch' | 'monitor' | 'slide';

export interface PresentationLayout {
  fullscreen: boolean;
  frameKind: FrameKind;
  zoom: number;
  bezel: number;
  outerRadius: number;
  bezelColor: string;
  hasNotch: boolean;
  hasHomeIndicator: boolean;
  hasCrown: boolean;
  screenRect: { x: number; y: number; width: number; height: number };
}

// `setCenter` always centers the target point at the exact middle of React
// Flow's (full-window) container — so the frame's screen rect must be
// exactly window-centered too, or the drawn bezel and the actual canvas
// content drift apart. Using the same margin on every side (rather than a
// bigger top reserve for the nav bar) keeps that centering exact; the nav
// bar just floats over the resulting top margin.
const MARGIN = 64;

const BEZEL: Record<FrameKind, number> = { phone: 14, tablet: 16, watch: 18, monitor: 10, slide: 0 };
const RADIUS: Record<FrameKind, number> = { phone: 54, tablet: 36, watch: 64, monitor: 18, slide: 12 };

function frameKindForCategory(category: string | undefined): FrameKind {
  if (category === 'Phone') return 'phone';
  if (category === 'Tablet') return 'tablet';
  if (category === 'Watch') return 'watch';
  if (category === 'Web') return 'monitor';
  return 'slide'; // Paper / Custom — not a "device", presented as a floating slide
}

// A device-shaped page (phone/tablet/watch) always presents inside its own
// frame — even if the numbers happen to land close to the window's aspect
// ratio, showing it edge-to-edge on a laptop would look stretched and wrong.
// A monitor/desktop page is the opposite case — it's meant to be run full
// screen like a PowerPoint slide deck, so it always goes full-bleed
// regardless of aspect ratio (letterboxed if the window doesn't match
// exactly, same as PowerPoint does, never wrapped in a device bezel). A
// plain "slide" (paper/custom) only goes full-bleed when its aspect ratio
// genuinely matches the window, since it isn't inherently screen-shaped.
function alwaysFullscreen(frameKind: FrameKind): boolean {
  return frameKind === 'monitor';
}
function canGoFullscreenIfAspectMatches(frameKind: FrameKind): boolean {
  return frameKind === 'slide';
}

function fullscreenLayout(pageDims: { width: number; height: number }, windowSize: { width: number; height: number }, frameKind: FrameKind): PresentationLayout {
  const scale = Math.min(windowSize.width / pageDims.width, windowSize.height / pageDims.height);
  const screenW = pageDims.width * scale;
  const screenH = pageDims.height * scale;
  return {
    fullscreen: true, frameKind, zoom: scale, bezel: 0, outerRadius: 0, bezelColor: 'transparent',
    hasNotch: false, hasHomeIndicator: false, hasCrown: false,
    screenRect: { x: (windowSize.width - screenW) / 2, y: (windowSize.height - screenH) / 2, width: screenW, height: screenH },
  };
}

export function computePresentationLayout(
  pageDims: { width: number; height: number },
  paperSize: string,
  windowSize: { width: number; height: number },
  settings: PresentationSettings = DEFAULT_PRESENTATION_SETTINGS,
): PresentationLayout {
  const category = getFramePreset(paperSize)?.category;
  const frameKind = frameKindForCategory(category);

  if (settings.frameMode === 'none' || alwaysFullscreen(frameKind)) return fullscreenLayout(pageDims, windowSize, frameKind);

  const pageAspect = pageDims.width / pageDims.height;
  const winAspect = windowSize.width / windowSize.height;
  const aspectCloseMatch = Math.abs(pageAspect - winAspect) / winAspect < 0.12;
  if (canGoFullscreenIfAspectMatches(frameKind) && aspectCloseMatch) return fullscreenLayout(pageDims, windowSize, frameKind);

  const bezel = BEZEL[frameKind];
  const outerRadius = settings.roundedCorners ? RADIUS[frameKind] : 0;
  const availW = windowSize.width - MARGIN * 2;
  const availH = windowSize.height - MARGIN * 2;
  const innerW = Math.max(40, availW - bezel * 2);
  const innerH = Math.max(40, availH - bezel * 2);
  const scale = Math.min(innerW / pageDims.width, innerH / pageDims.height);
  const screenW = pageDims.width * scale;
  const screenH = pageDims.height * scale;

  return {
    fullscreen: false,
    frameKind,
    zoom: scale,
    bezel,
    outerRadius,
    bezelColor: settings.frameColor,
    hasNotch: frameKind === 'phone',
    hasHomeIndicator: frameKind === 'phone' || frameKind === 'tablet',
    hasCrown: frameKind === 'watch',
    screenRect: {
      x: (windowSize.width - screenW) / 2,
      y: (windowSize.height - screenH) / 2,
      width: screenW,
      height: screenH,
    },
  };
}
