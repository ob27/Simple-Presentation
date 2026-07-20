import { jsPDF } from 'jspdf';
import type { DiagramPage } from '../types/document';
import { exportPageAsImage } from './exportImage';

export type PdfQuality = 'print' | 'compact';

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
  }

  pdf?.save(`${docName}.pdf`);
}
