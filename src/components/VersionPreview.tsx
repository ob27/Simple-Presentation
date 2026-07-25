import { useMemo, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls } from '@xyflow/react';
import { Button, Typography } from 'antd';
import { IconChevronLeft, IconChevronRight } from './icons';
import { nodeTypes, edgeTypes } from './canvas/Canvas';
import { getPageDimensions } from '../utils/paperSizes';
import { PAGE_GAP, PAGE_X } from '../constants';
import { resolveStyle } from '../utils/shapeStyleResolver';
import type { DiagramVersion } from '../store';
import type { ShapeNodeData } from '../types/shapes';

interface Props {
  version: DiagramVersion;
}

// Read-only render of a saved version's snapshot data — deliberately NOT a
// cut-down copy of the real editing Canvas.tsx (which subscribes to
// Firestore internally and can't be fed static data without invasive
// surgery). A DiagramVersion is fully self-contained plain data — shape/edge
// objects are already real @xyflow/react Node/Edge shapes, images/videos are
// plain long-lived public Storage URLs — so this just needs the same leaf
// renderers (ShapeNode/SmartEdge/etc., via Canvas.tsx's own nodeTypes/
// edgeTypes) fed directly, one page at a time.
export function VersionPreview({ version }: Props) {
  const [pageIndex, setPageIndex] = useState(0);

  const contentPages = useMemo(() => {
    const pages = version.pages.filter(p => !p.isMaster);
    const orderIndex = new Map(version.pageOrder.map((id, i) => [id, i]));
    return [...pages].sort((a, b) => (orderIndex.get(a.id) ?? a.order) - (orderIndex.get(b.id) ?? b.order));
  }, [version]);

  // Same tiny stacking algorithm as Canvas.tsx's own pageOrigins memo,
  // duplicated rather than imported — it's a few lines, and importing it
  // would mean pulling in Canvas.tsx's live-editing state along with it.
  const { pageOrigins, pageDimensions } = useMemo(() => {
    const origins = new Map<string, number>();
    const dims = new Map<string, { width: number; height: number }>();
    let cursorY = 0;
    for (const page of contentPages) {
      const { width, height } = getPageDimensions(page.paperSize, page.orientation, page.customWidth, page.customHeight);
      origins.set(page.id, cursorY);
      dims.set(page.id, { width, height });
      cursorY += height + PAGE_GAP;
    }
    return { pageOrigins: origins, pageDimensions: dims };
  }, [contentPages]);

  const activePage = contentPages[pageIndex];

  const { nodes, edges } = useMemo(() => {
    if (!activePage) return { nodes: [], edges: [] };
    const origin = pageOrigins.get(activePage.id) ?? 0;
    const dims = pageDimensions.get(activePage.id) ?? { width: 0, height: 0 };
    const master = activePage.masterPageId ? version.pages.find(p => p.id === activePage.masterPageId) : undefined;

    const frameNode = {
      id: `pageFrame-${activePage.id}`,
      type: 'pageFrame',
      position: { x: 0, y: 0 },
      draggable: false,
      selectable: false,
      data: {
        pageName: activePage.name,
        width: dims.width,
        height: dims.height,
        backgroundColor: activePage.backgroundColor ?? master?.backgroundColor,
        headerText: activePage.headerText ?? master?.headerText,
        footerText: activePage.footerText ?? master?.footerText,
        headerConfig: activePage.headerConfig ?? master?.headerConfig,
        footerConfig: activePage.footerConfig ?? master?.footerConfig,
        marginTop: activePage.marginTop, marginRight: activePage.marginRight,
        marginBottom: activePage.marginBottom, marginLeft: activePage.marginLeft,
        pageNumberEnabled: activePage.pageNumberEnabled,
        pageNumberStyle: activePage.pageNumberStyle,
        pageNumberPosition: activePage.pageNumberPosition,
        pageIndex: pageIndex + 1,
        pageCount: contentPages.length,
      },
    };

    const shapeNodes = (version.shapesByPage[activePage.id] ?? []).map(n => {
      const data = n.data as ShapeNodeData;
      const extra: Record<string, unknown> = {};
      if (data.dataBinding) {
        const resolved = resolveStyle(data.dataBinding, version.variables);
        if (resolved) extra.__resolvedStyle = resolved;
      }
      return {
        ...n,
        position: { x: n.position.x - PAGE_X, y: n.position.y - origin },
        data: { ...n.data, ...extra },
        draggable: false,
        selectable: false,
        connectable: false,
      };
    });

    // Edges reference node ids, not absolute coordinates — no offset needed.
    const previewEdges = (version.connectorsByPage[activePage.id] ?? []).map(e => ({
      ...e, selectable: false, focusable: false,
    }));

    return { nodes: [frameNode, ...shapeNodes], edges: previewEdges };
  }, [activePage, pageOrigins, pageDimensions, pageIndex, contentPages.length, version]);

  if (!activePage) {
    return <Typography.Text type="secondary">This version has no pages to preview.</Typography.Text>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button shape="circle" icon={<IconChevronLeft />} disabled={pageIndex <= 0} onClick={() => setPageIndex(i => i - 1)} />
          <span style={{ fontWeight: 600 }}>{activePage.name} — {pageIndex + 1} of {contentPages.length}</span>
          <Button shape="circle" icon={<IconChevronRight />} disabled={pageIndex >= contentPages.length - 1} onClick={() => setPageIndex(i => i + 1)} />
        </div>
        {activePage.masterPageId && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Shapes inherited from this page's master aren't shown in this preview.
          </Typography.Text>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ReactFlowProvider>
          <ReactFlow
            key={activePage.id}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            fitView
            fitViewOptions={{ padding: 0.15 }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}
