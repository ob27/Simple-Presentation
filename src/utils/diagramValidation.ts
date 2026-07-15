import type { Node, Edge } from '@xyflow/react';
import type { ShapeNodeData } from '../types/shapes';
import type { ValidationIssue } from '../components/panels/ValidationPanel';

// Only the flowchart/process-diagram-ish kinds get the "orphaned" check —
// text/image/table/chart/etc. legitimately have zero connectors by design,
// and flagging those would just be noise.
const CONNECTABLE_KINDS = new Set<ShapeNodeData['kind']>([
  'rectangle', 'diamond', 'ellipse', 'triangle', 'parallelogram', 'hexagon',
  'cylinder', 'cloud', 'document', 'umlActor', 'umlClass', 'umlPackage', 'umlComponent', 'umlNote', 'archimateElement',
]);

function shapeLabel(data: ShapeNodeData): string {
  return data.label || data.kind;
}

function isRichTextEmpty(data: ShapeNodeData): boolean {
  if (!data.richText || data.richText.length === 0) return !data.label?.trim();
  return !data.richText.some(p => p.runs.some(r => r.text.trim().length > 0));
}

// Computed on demand (see ValidationPanel's doc comment) — a plain scan over
// the currently-loaded shapes/connectors, not a persisted or reactive check.
export function computeValidationIssues(shapeNodes: Node[], connectorEdges: Edge[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const outgoingCount = new Map<string, number>();
  const connectedIds = new Set<string>();
  for (const e of connectorEdges) {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
    outgoingCount.set(e.source, (outgoingCount.get(e.source) ?? 0) + 1);
  }

  for (const n of shapeNodes) {
    if (n.type !== 'shape') continue;
    const data = n.data as ShapeNodeData;
    const label = shapeLabel(data);

    if (CONNECTABLE_KINDS.has(data.kind) && !connectedIds.has(n.id)) {
      issues.push({ id: `${n.id}-orphan`, shapeId: n.id, label, message: 'Not connected to anything' });
    }
    if (data.kind === 'diamond' && (outgoingCount.get(n.id) ?? 0) < 2) {
      issues.push({ id: `${n.id}-decision`, shapeId: n.id, label, message: 'Decision shape has fewer than 2 outgoing connectors' });
    }
    if (data.kind === 'hotspot' && !data.link) {
      issues.push({ id: `${n.id}-hotspot`, shapeId: n.id, label, message: 'Hotspot has no link set' });
    }
    if (data.kind === 'text' && isRichTextEmpty(data)) {
      issues.push({ id: `${n.id}-emptytext`, shapeId: n.id, label, message: 'Text shape is empty' });
    }
    if (data.kind === 'table' && (data.tableCells ?? []).every(row => row.cells.every(c => c.trim() === ''))) {
      issues.push({ id: `${n.id}-emptytable`, shapeId: n.id, label, message: 'Table has no data entered' });
    }
    if (data.kind === 'chart' && (!data.chartData || data.chartData.length === 0)) {
      issues.push({ id: `${n.id}-emptychart`, shapeId: n.id, label, message: 'Chart still has placeholder data' });
    }
    if (data.kind === 'pieChart' && (!data.pieSegments || data.pieSegments.length === 0)) {
      issues.push({ id: `${n.id}-emptypie`, shapeId: n.id, label, message: 'Pie chart still has placeholder data' });
    }
  }

  return issues;
}
