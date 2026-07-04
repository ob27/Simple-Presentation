import { jsPDF } from 'jspdf';
import type { DiagramPage } from '../types/document';
import { exportPageAsImage } from './exportImage';

export async function exportDocumentAsPdf(
  pages: DiagramPage[],
  pageOrigins: Map<string, number>,
  pageDimensions: Map<string, { width: number; height: number }>,
  docName: string,
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  let pdf: jsPDF | null = null;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const dims = pageDimensions.get(page.id) ?? { width: 794, height: 1123 };
    const origin = pageOrigins.get(page.id) ?? 0;
    onProgress?.(i + 1, pages.length);

    const dataUrl = await exportPageAsImage({ x: 0, y: origin, width: dims.width, height: dims.height }, 'png', 2);

    if (!pdf) {
      pdf = new jsPDF({ unit: 'px', format: [dims.width, dims.height], hotfixes: ['px_scaling'] });
    } else {
      pdf.addPage([dims.width, dims.height]);
    }
    pdf.addImage(dataUrl, 'PNG', 0, 0, dims.width, dims.height);
  }

  pdf?.save(`${docName}.pdf`);
}
