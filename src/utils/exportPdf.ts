import { jsPDF } from 'jspdf';
import type { Node } from '@xyflow/react';
import type { DiagramPage } from '../types/document';
import type { ShapeNodeData } from '../types/shapes';
import { exportPageAsImage } from './exportImage';

export type PdfQuality = 'print' | 'compact';

// Kinds whose visible text (if any) isn't a plain user-authored label — image/
// video/brushStroke have none, table/pieChart/chart/icon render their own
// structured content rather than `data.label` — so none of them get an
// invisible text-layer entry.
const NO_LABEL_TEXT_KINDS = new Set(['image', 'video', 'brushStroke', 'table', 'pieChart', 'chart', 'icon']);

// Draws a real, selectable/screen-reader-visible but 100% invisible text
// layer on top of the already-rasterized page image — the standard
// "searchable PDF" (OCR-layer) technique. `data.label` is reused as-is
// rather than re-walking `richText` paragraphs/runs: it's already
// maintained as the flattened, newline-joined plain-text mirror of
// richText (see ShapeNodeData.richText's own doc comment), so this covers
// rich multi-paragraph/bulleted text for free. Position/line-wrap fidelity
// with the visible render doesn't need to be pixel-exact — this layer is
// never seen, only selected/read — so jsPDF's own `maxWidth` auto-wrap is
// good enough rather than reimplementing the browser's text layout.
function addInvisibleTextLayer(pdf: jsPDF, pageNodes: Node[], origin: number): void {
  for (const node of pageNodes) {
    const data = node.data as ShapeNodeData;
    if (!data.label || NO_LABEL_TEXT_KINDS.has(data.kind)) continue;
    const fontSize = data.fontSize ?? 14;
    const lineHeight = fontSize * (data.lineHeight ?? 1.2);
    pdf.setFontSize(fontSize);
    const lines = data.label.split('\n');
    lines.forEach((line, i) => {
      if (!line) return;
      const x = node.position.x;
      const y = node.position.y - origin + lineHeight * (i + 1);
      pdf.text(line, x, y, { renderingMode: 'invisible', maxWidth: node.width || undefined });
    });
  }
}

// 'print': lossless PNG at 2x paper-size resolution — matches the original
// (only) export behavior, files can run several MB for a multi-page deck.
// 'compact': 1x resolution JPEG at 80% quality plus jsPDF's own stream
// compression — a fraction of the size, meant for email/sharing rather than
// physical printing.
export async function exportDocumentAsPdf(
  pages: DiagramPage[],
  pageOrigins: Map<string, number>,
  pageDimensions: Map<string, { width: number; height: number }>,
  docName: string,
  quality: PdfQuality = 'print',
  shapeNodes: Node[] = [],
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  const scale = quality === 'print' ? 2 : 1;
  const imageFormat = quality === 'print' ? 'png' : 'jpeg';
  let pdf: jsPDF | null = null;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const dims = pageDimensions.get(page.id) ?? { width: 794, height: 1123 };
    const origin = pageOrigins.get(page.id) ?? 0;
    onProgress?.(i + 1, pages.length);

    const dataUrl = await exportPageAsImage({ x: 0, y: origin, width: dims.width, height: dims.height }, imageFormat, scale, 0.8);

    if (!pdf) {
      pdf = new jsPDF({ unit: 'px', format: [dims.width, dims.height], hotfixes: ['px_scaling'], compress: quality === 'compact' });
    } else {
      pdf.addPage([dims.width, dims.height]);
    }
    pdf.addImage(dataUrl, imageFormat === 'jpeg' ? 'JPEG' : 'PNG', 0, 0, dims.width, dims.height);
    addInvisibleTextLayer(pdf, shapeNodes.filter(n => (n.data as ShapeNodeData).pageId === page.id), origin);
  }

  pdf?.save(`${docName}.pdf`);
}
