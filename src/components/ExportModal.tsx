import { useState } from 'react';
import { Modal, Radio, Select, Button, message } from 'antd';
import type { Node, Edge } from '@xyflow/react';
import type { DiagramPage } from '../types/document';
import { exportPageAsImage, downloadDataUrl, waitForFullRender } from '../utils/exportImage';
import { exportDocumentAsPdf, type PdfQuality } from '../utils/exportPdf';
import { exportDocumentAsPptx } from '../utils/exportPptx';
import { buildDevHandoffSpec, downloadJson } from '../utils/exportSpec';

interface Props {
  open: boolean;
  onClose: () => void;
  docName: string;
  pages: DiagramPage[];
  pageOrigins: Map<string, number>;
  pageDimensions: Map<string, { width: number; height: number }>;
  shapeNodes: Node[];
  connectorEdges: Edge[];
  // Lets Canvas.tsx temporarily disable React Flow's onlyRenderVisibleElements
  // for the duration of the capture — otherwise any page/shape not under the
  // CURRENT camera position never mounted into the DOM at all, so exporting
  // "all pages" (or a single page other than whichever one the user was
  // looking at) silently produced blank output for everything else.
  onExportingChange: (exporting: boolean) => void;
}

export function ExportModal({ open, onClose, docName, pages, pageOrigins, pageDimensions, shapeNodes, connectorEdges, onExportingChange }: Props) {
  const [scope, setScope] = useState<'page' | 'all' | 'pptx' | 'json'>('page');
  const [pageId, setPageId] = useState(pages[0]?.id);
  const [format, setFormat] = useState<'png' | 'svg'>('png');
  const [pdfQuality, setPdfQuality] = useState<PdfQuality>('print');
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    onExportingChange(true);
    try {
      await waitForFullRender();
      if (scope === 'all') {
        await exportDocumentAsPdf(pages, pageOrigins, pageDimensions, docName, pdfQuality, shapeNodes);
      } else if (scope === 'pptx') {
        await exportDocumentAsPptx(pages, pageOrigins, pageDimensions, docName);
      } else if (scope === 'json') {
        const spec = buildDevHandoffSpec(pages, pageDimensions, shapeNodes, connectorEdges);
        downloadJson(spec, `${docName}-spec.json`);
      } else {
        const page = pages.find(p => p.id === pageId) ?? pages[0];
        const dims = pageDimensions.get(page.id) ?? { width: 794, height: 1123 };
        const origin = pageOrigins.get(page.id) ?? 0;
        const dataUrl = await exportPageAsImage({ x: 0, y: origin, width: dims.width, height: dims.height }, format, 2);
        downloadDataUrl(dataUrl, `${docName}-${page.name}.${format}`);
      }
      message.success('Export ready');
      onClose();
    } catch {
      message.error('Export failed');
    } finally {
      setExporting(false);
      onExportingChange(false);
    }
  }

  return (
    <Modal title="Export" open={open} onCancel={onClose} footer={null} destroyOnClose>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
        <Radio.Group value={scope} onChange={e => setScope(e.target.value)}>
          <Radio.Button value="page">Single page</Radio.Button>
          <Radio.Button value="all">All pages (PDF)</Radio.Button>
          <Radio.Button value="pptx">All pages (PPTX)</Radio.Button>
          <Radio.Button value="json">Dev handoff (JSON)</Radio.Button>
        </Radio.Group>

        {scope === 'page' && (
          <>
            <Select
              value={pageId}
              options={pages.map(p => ({ value: p.id, label: p.name }))}
              onChange={setPageId}
            />
            <Radio.Group value={format} onChange={e => setFormat(e.target.value)}>
              <Radio.Button value="png">PNG</Radio.Button>
              <Radio.Button value="svg">SVG</Radio.Button>
            </Radio.Group>
          </>
        )}
        {scope === 'all' && (
          <>
            <Radio.Group value={pdfQuality} onChange={e => setPdfQuality(e.target.value)}>
              <Radio.Button value="print">Print quality</Radio.Button>
              <Radio.Button value="compact">Compact (smaller file)</Radio.Button>
            </Radio.Group>
            <div style={{ fontSize: 12, color: '#888' }}>
              {pdfQuality === 'print'
                ? `Renders all ${pages.length} page${pages.length !== 1 ? 's' : ''} at print quality into one PDF, each at its true paper size. Files can run several MB.`
                : `Renders all ${pages.length} page${pages.length !== 1 ? 's' : ''} at a smaller, compressed size — a fraction of the file size, ideal for email or sharing rather than printing.`}
            </div>
          </>
        )}
        {scope === 'pptx' && (
          <div style={{ fontSize: 12, color: '#888' }}>
            Renders all {pages.length} page{pages.length !== 1 ? 's' : ''} into one PowerPoint deck, one slide per page — each slide is a full-bleed image (same rendering as PDF export), not editable native shapes/text.
          </div>
        )}
        {scope === 'json' && (
          <div style={{ fontSize: 12, color: '#888' }}>
            Downloads a structured JSON spec (geometry, style, text, hierarchy, links) for every page — meant for handing to an LLM coding agent to scaffold real UI from. Complements, not replaces, the visual exports above.
          </div>
        )}

        <Button type="primary" loading={exporting} onClick={handleExport} block>
          Export
        </Button>
      </div>
    </Modal>
  );
}
