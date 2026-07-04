import type { Node, Edge } from '@xyflow/react';
import type { DiagramPage } from '../types/document';
import type { ShapeNodeData } from '../types/shapes';
import type { SmartEdgeData } from '../types/edges';

// A structured, per-page JSON snapshot of the document's geometry/style/text/
// hierarchy/links — meant to be handed to an LLM coding agent to scaffold
// real UI from, as a complement to (not a replacement for) the visual
// PNG/SVG/PDF export. Deliberately not HTML/CSS: the shape data model here
// changes as new kinds are added, and a mechanical JSON dump ages far better
// than a codegen template would.
export function buildDevHandoffSpec(
  pages: DiagramPage[],
  pageDimensions: Map<string, { width: number; height: number }>,
  shapeNodes: Node[],
  connectorEdges: Edge[],
) {
  return {
    pages: pages.map(page => {
      const dims = pageDimensions.get(page.id) ?? { width: 794, height: 1123 };
      const pageShapes = shapeNodes.filter(n => (n.data as ShapeNodeData).pageId === page.id);
      const pageShapeIds = new Set(pageShapes.map(n => n.id));
      const pageConnectors = connectorEdges.filter(e => pageShapeIds.has(e.source));

      return {
        id: page.id,
        name: page.name,
        width: dims.width,
        height: dims.height,
        shapes: pageShapes.map(n => {
          const d = n.data as ShapeNodeData;
          return {
            id: n.id,
            kind: d.kind,
            parentId: n.parentId,
            geometry: {
              x: n.position.x,
              y: n.position.y,
              width: n.width ?? n.measured?.width ?? 0,
              height: n.height ?? n.measured?.height ?? 0,
              rotation: d.rotation ?? 0,
            },
            style: d.kind === 'text' ? undefined : {
              fill: d.fillColor,
              stroke: d.strokeColor,
              strokeWidth: d.strokeWidth,
            },
            text: d.label || undefined,
            imageUrl: d.imageUrl,
            link: d.link,
            dataBinding: d.dataBinding,
            locked: d.locked || undefined,
            hidden: d.hidden || undefined,
            pathAnchors: d.pathAnchors,
            pathClosed: d.pathClosed,
          };
        }),
        connectors: pageConnectors.map(e => {
          const ed = e.data as SmartEdgeData | undefined;
          return {
            id: e.id,
            source: e.source,
            target: e.target,
            routing: ed?.routing,
            label: ed?.label,
          };
        }),
      };
    }),
  };
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
