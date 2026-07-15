import { useMemo, useState } from 'react';
import type { Node } from '@xyflow/react';
import { Button, Tooltip } from 'antd';
import {
  IconClose, IconGroup, IconImage, IconEyeOpen, IconEyeClosed,
  IconLock, IconUnlock, IconMoveUp, IconMoveDown, IconOutdent, IconIndent,
  IconDisclosureTriangle, IconHotspot, IconPathShape,
} from '../icons';
import type { ShapeKind, ShapeNodeData } from '../../types/shapes';
import { PeekableDrawer } from './PeekableDrawer';

interface LayerTreeNode {
  id: string;
  node: Node;
  children: LayerTreeNode[];
}

function buildLayerTree(pageShapes: Node[]): LayerTreeNode[] {
  const byId = new Map(pageShapes.map(n => [n.id, { id: n.id, node: n, children: [] as LayerTreeNode[] }]));
  const roots: LayerTreeNode[] = [];
  for (const entry of byId.values()) {
    const parentId = entry.node.parentId;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.children.push(entry);
    } else {
      roots.push(entry);
    }
  }
  const byZDesc = (a: LayerTreeNode, b: LayerTreeNode) => (b.node.zIndex ?? 0) - (a.node.zIndex ?? 0);
  function sortRecursive(list: LayerTreeNode[]) {
    list.sort(byZDesc);
    for (const item of list) sortRecursive(item.children);
  }
  sortRecursive(roots);
  return roots;
}

interface FlatRow {
  id: string;
  node: Node;
  depth: number;
  hasChildren: boolean;
}

function flattenTree(tree: LayerTreeNode[], depth: number, collapsed: Set<string>, out: FlatRow[]) {
  for (const item of tree) {
    out.push({ id: item.id, node: item.node, depth, hasChildren: item.children.length > 0 });
    if (item.children.length > 0 && !collapsed.has(item.id)) {
      flattenTree(item.children, depth + 1, collapsed, out);
    }
  }
}

function KindIcon({ kind }: { kind: ShapeKind }) {
  if (kind === 'group') return <IconGroup style={{ color: '#8a93a6' }} />;
  if (kind === 'image') return <IconImage style={{ color: '#8CA3E8' }} />;
  if (kind === 'hotspot') return <IconHotspot style={{ color: '#ff5fc4' }} />;
  if (kind === 'path') return <IconPathShape style={{ color: '#7C93E8' }} />;
  if (kind === 'text') return <span style={{ fontSize: 11, color: '#555', fontWeight: 600 }}>T</span>;
  const style: React.CSSProperties = { width: 10, height: 10, display: 'inline-block', background: '#8CA3E8', flexShrink: 0 };
  if (kind === 'ellipse') style.borderRadius = '50%';
  if (kind === 'diamond') style.clipPath = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
  if (kind === 'stickyNote') { style.background = '#FFF3B0'; style.border = '1px solid #E8D77A'; }
  return <span style={style} />;
}

interface Props {
  shapeNodes: Node[];
  activePageId?: string;
  selectedIds: Set<string>;
  onSelect: (id: string, additive: boolean) => void;
  onRename: (id: string, label: string) => void;
  onToggleHidden: (id: string) => void;
  onToggleLocked: (id: string) => void;
  onReorder: (id: string, direction: -1 | 1) => void;
  onIndent: (id: string) => void;
  onOutdent: (id: string) => void;
  onClose: () => void;
}

export function LayersPanel({
  shapeNodes, activePageId, selectedIds, onSelect, onRename, onToggleHidden, onToggleLocked,
  onReorder, onIndent, onOutdent, onClose,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const pageShapes = useMemo(
    () => shapeNodes.filter(n => (n.data as ShapeNodeData).pageId === activePageId),
    [shapeNodes, activePageId],
  );
  const tree = useMemo(() => buildLayerTree(pageShapes), [pageShapes]);
  const rows = useMemo(() => {
    const out: FlatRow[] = [];
    flattenTree(tree, 0, collapsed, out);
    return out;
  }, [tree, collapsed]);

  function toggleCollapse(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function commitRename(id: string) {
    setEditingId(null);
    onRename(id, draft);
  }

  return (
    <PeekableDrawer>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#1a1a2e' }}>Layers</span>
        <Button size="small" type="text" icon={<IconClose />} onClick={onClose} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 4px' }}>
        {rows.length === 0 && (
          <div style={{ fontSize: 12, color: '#999', textAlign: 'center', paddingTop: 20 }}>
            Add shapes to this page first.
          </div>
        )}
        {rows.map(row => {
          const data = row.node.data as ShapeNodeData;
          const isSelected = selectedIds.has(row.id);
          const isGroup = row.node.type === 'group';
          const label = data.label || (isGroup ? 'Group' : data.kind);
          return (
            <div
              key={row.id}
              onClick={e => onSelect(row.id, e.shiftKey || e.metaKey || e.ctrlKey)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', borderRadius: 6,
                paddingLeft: 6 + row.depth * 16, cursor: 'pointer',
                background: isSelected ? '#EEF4FF' : 'transparent',
              }}
            >
              {row.hasChildren ? (
                <span onClick={e => { e.stopPropagation(); toggleCollapse(row.id); }} style={{ fontSize: 10, color: '#999', width: 12, flexShrink: 0 }}>
                  <IconDisclosureTriangle style={collapsed.has(row.id) ? undefined : { transform: 'rotate(90deg)' }} />
                </span>
              ) : (
                <span style={{ width: 12, flexShrink: 0 }} />
              )}
              <KindIcon kind={data.kind} />
              {editingId === row.id ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onBlur={() => commitRename(row.id)}
                  onKeyDown={e => { if (e.key === 'Enter') commitRename(row.id); if (e.key === 'Escape') setEditingId(null); }}
                  onClick={e => e.stopPropagation()}
                  style={{ flex: 1, fontSize: 12, border: '1px solid #1677ff', borderRadius: 3, padding: '0 4px', minWidth: 0 }}
                />
              ) : (
                <span
                  onDoubleClick={e => { e.stopPropagation(); setDraft(label); setEditingId(row.id); }}
                  style={{
                    flex: 1, fontSize: 12, color: data.hidden ? '#bbb' : '#333', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
                  }}
                >
                  {label}
                </span>
              )}
              <div style={{ display: 'flex', gap: 0 }}>
                <Tooltip title="Outdent"><Button size="small" type="text" icon={<IconOutdent />} disabled={!row.node.parentId} onClick={e => { e.stopPropagation(); onOutdent(row.id); }} /></Tooltip>
                <Tooltip title="Indent into folder above"><Button size="small" type="text" icon={<IconIndent />} onClick={e => { e.stopPropagation(); onIndent(row.id); }} /></Tooltip>
                <Tooltip title="Move up"><Button size="small" type="text" icon={<IconMoveUp />} onClick={e => { e.stopPropagation(); onReorder(row.id, -1); }} /></Tooltip>
                <Tooltip title="Move down"><Button size="small" type="text" icon={<IconMoveDown />} onClick={e => { e.stopPropagation(); onReorder(row.id, 1); }} /></Tooltip>
                <Tooltip title={data.locked ? 'Unlock' : 'Lock'}>
                  <Button size="small" type="text" icon={data.locked ? <IconLock /> : <IconUnlock />} onClick={e => { e.stopPropagation(); onToggleLocked(row.id); }} />
                </Tooltip>
                <Tooltip title={data.hidden ? 'Show' : 'Hide'}>
                  <Button size="small" type="text" icon={data.hidden ? <IconEyeClosed /> : <IconEyeOpen />} onClick={e => { e.stopPropagation(); onToggleHidden(row.id); }} />
                </Tooltip>
              </div>
            </div>
          );
        })}
      </div>
    </PeekableDrawer>
  );
}
