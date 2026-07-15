import PptxGenJS from 'pptxgenjs';
import type { DiagramPage } from '../types/document';
import { exportPageAsImage } from './exportImage';

// PPTX decks (unlike PDF) don't support an arbitrary size per page — there's
// one slide layout per deck by default. pptxgenjs does support multiple
// *named* custom layouts within one file (`defineLayout` + setting `.layout`
// before each `addSlide()`), which is what lets mixed-paper-size documents
// (e.g. a phone mockup page alongside an A4 page) export correctly instead
// of stretching/cropping every page to one fixed size.
const PX_PER_INCH = 96;

// Same raster-image-per-slide approach exportDocumentAsPdf already uses —
// full editable-shape PPTX export (mapping every ShapeKind, gradients,
// tables, charts, path booleans onto PowerPoint's native shape model) is a
// vastly bigger, separate undertaking and out of scope for this pass.
export async function exportDocumentAsPptx(
  pages: DiagramPage[],
  pageOrigins: Map<string, number>,
  pageDimensions: Map<string, { width: number; height: number }>,
  docName: string,
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  const pptx = new PptxGenJS();
  const definedLayouts = new Set<string>();

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const dims = pageDimensions.get(page.id) ?? { width: 794, height: 1123 };
    const origin = pageOrigins.get(page.id) ?? 0;
    onProgress?.(i + 1, pages.length);

    const widthIn = dims.width / PX_PER_INCH;
    const heightIn = dims.height / PX_PER_INCH;
    const layoutName = `L${Math.round(widthIn * 100)}x${Math.round(heightIn * 100)}`;
    if (!definedLayouts.has(layoutName)) {
      pptx.defineLayout({ name: layoutName, width: widthIn, height: heightIn });
      definedLayouts.add(layoutName);
    }
    pptx.layout = layoutName;

    const dataUrl = await exportPageAsImage({ x: 0, y: origin, width: dims.width, height: dims.height }, 'png', 2);
    const slide = pptx.addSlide();
    slide.addImage({ data: dataUrl, x: 0, y: 0, w: widthIn, h: heightIn });
  }

  await pptx.writeFile({ fileName: `${docName}.pptx` });
}
