import { useState } from 'react';
import { Tabs, ColorPicker, InputNumber, Select, Radio, Button, Tooltip, Switch } from 'antd';
import {
  LinkOutlined, CloseOutlined, DatabaseOutlined, DeleteOutlined, PlusOutlined, FontSizeOutlined, VideoCameraOutlined,
  BoldOutlined, ItalicOutlined, UnderlineOutlined, StrikethroughOutlined, LineHeightOutlined,
  AlignLeftOutlined, AlignCenterOutlined, AlignRightOutlined, MenuOutlined,
  VerticalAlignTopOutlined, VerticalAlignMiddleOutlined, VerticalAlignBottomOutlined, HighlightOutlined,
} from '@ant-design/icons';
import type { Node, Edge } from '@xyflow/react';
import type { ShapeNodeData } from '../../types/shapes';
import type { DiagramPage } from '../../types/document';
import type { ShapeLink } from '../../types/links';
import type { DiagramVariable, StyleRule, StyleRuleOp } from '../../types/variables';
import { DEFAULT_PIE_SEGMENTS } from '../../utils/pieDefaults';

const OP_OPTIONS: { value: StyleRuleOp; label: string }[] = [
  { value: '<', label: '<' }, { value: '<=', label: '≤' },
  { value: '>', label: '>' }, { value: '>=', label: '≥' },
  { value: '==', label: '=' }, { value: 'between', label: 'between' },
];

// The diagram's px unit is a 96dpi-equivalent unit (matching how page paper
// sizes are defined in utils/paperSizes.ts, e.g. A4 = 794x1123 px for
// 210x297mm) — this is the exact 96px/inch conversion, not derived from a
// rounded preset, so it doesn't compound rounding error.
const PX_PER_MM = 96 / 25.4;

interface Props {
  node: Node;
  pages: DiagramPage[];
  allShapes: Node[];
  variables: DiagramVariable[];
  connectorEdges: Edge[];
  onChange: (patch: Partial<ShapeNodeData>) => void;
  onResize: (width: number, height: number) => void;
  onDeleteEdge: (id: string) => void;
  onClose: () => void;
}

export function ShapePropertiesPanel({ node, pages, allShapes, variables, connectorEdges, onChange, onResize, onDeleteEdge, onClose }: Props) {
  const data = node.data as ShapeNodeData;
  const widthMm = Math.round(((node.width ?? 100) / PX_PER_MM) * 10) / 10;
  const heightMm = Math.round(((node.height ?? 70) / PX_PER_MM) * 10) / 10;
  function handleWidthMmChange(mm: number | null) {
    if (mm === null || mm <= 0) return;
    onResize(mm * PX_PER_MM, node.height ?? 70);
  }
  function handleHeightMmChange(mm: number | null) {
    if (mm === null || mm <= 0) return;
    onResize(node.width ?? 100, mm * PX_PER_MM);
  }
  const [linkType, setLinkType] = useState<'page' | 'shape' | 'none'>(
    data.link?.type === 'shape' ? 'shape' : data.link?.type === 'page' ? 'page' : 'none',
  );

  function updateLink(patch: Partial<ShapeLink> | null) {
    if (patch === null) {
      onChange({ link: undefined });
      return;
    }
    onChange({ link: { type: 'page', ...data.link, ...patch } as ShapeLink });
  }

  const shapesOnTargetPage = allShapes.filter(s =>
    s.id !== node.id && s.type === 'shape' && (s.data as ShapeNodeData).pageId === (data.link?.targetPageId ?? '')
  );

  // A connector's visual path can end up rendered underneath a shape (e.g.
  // two connected nodes overlapping produces a degenerate routed path) —
  // when that happens, clicking the SVG line directly is impossible since
  // nodes render above edges. This list is a click-target-independent way to
  // always find and delete any connector touching the selected shape.
  const connections = connectorEdges.filter(e => e.source === node.id || e.target === node.id);

  function updateRule(index: number, patch: Partial<StyleRule>) {
    const rules = [...(data.dataBinding?.rules ?? [])];
    rules[index] = { ...rules[index], ...patch };
    onChange({ dataBinding: { variableId: data.dataBinding?.variableId ?? '', ...data.dataBinding, rules } });
  }
  function addRule() {
    const rules = [...(data.dataBinding?.rules ?? []), {
      id: crypto.randomUUID(), op: '>' as StyleRuleOp, value: 0, style: { fill: '#ff4d4f' },
    }];
    onChange({ dataBinding: { variableId: data.dataBinding?.variableId ?? '', ...data.dataBinding, rules } });
  }
  function removeRule(index: number) {
    const rules = (data.dataBinding?.rules ?? []).filter((_, i) => i !== index);
    onChange({ dataBinding: { variableId: data.dataBinding?.variableId ?? '', ...data.dataBinding, rules } });
  }

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 260, zIndex: 15,
      background: '#fff', borderLeft: '1px solid #e6e8ef', boxShadow: '-2px 0 8px rgba(0,0,0,0.05)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#1a1a2e' }}>Shape</span>
        <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClose} />
      </div>

      {connections.length > 0 && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Connections ({connections.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {connections.map(e => {
              const outgoing = e.source === node.id;
              const other = allShapes.find(s => s.id === (outgoing ? e.target : e.source));
              const otherData = other?.data as ShapeNodeData | undefined;
              const otherLabel = otherData ? (otherData.label || otherData.kind) : 'Unknown shape';
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: '#aaa', flexShrink: 0 }}>{outgoing ? '→' : '←'}</span>
                  <span style={{ flex: 1, fontSize: 12, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {otherLabel}
                  </span>
                  <Tooltip title="Delete this connector">
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onDeleteEdge(e.id)} />
                  </Tooltip>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Tabs
        size="small"
        style={{ padding: '0 14px', flex: 1, overflowY: 'auto' }}
        items={[
          {
            key: 'style',
            label: 'Style',
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 8 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Width (mm)</div>
                    <InputNumber
                      min={1} step={0.1} value={widthMm} style={{ width: '100%' }}
                      onChange={handleWidthMmChange}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Height (mm)</div>
                    <InputNumber
                      min={1} step={0.1} value={heightMm} style={{ width: '100%' }}
                      onChange={handleHeightMmChange}
                    />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Fill</div>
                  <ColorPicker
                    value={data.fillColor ?? '#E3EAFD'}
                    onChangeComplete={c => onChange({ fillColor: c.toHexString() })}
                    showText
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Stroke</div>
                  <ColorPicker
                    value={data.strokeColor ?? '#7C93E8'}
                    onChangeComplete={c => onChange({ strokeColor: c.toHexString() })}
                    showText
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Stroke width</div>
                  <InputNumber
                    min={0} max={12} value={data.strokeWidth ?? 1.5} style={{ width: '100%' }}
                    onChange={v => onChange({ strokeWidth: v ?? 0 })}
                  />
                </div>
                {(data.kind === 'rectangle' || data.kind === 'stickyNote' || data.kind === 'container') && (
                  <div>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Corner radius</div>
                    <InputNumber
                      min={0} max={50} value={data.cornerRadius ?? 4} style={{ width: '100%' }}
                      onChange={v => onChange({ cornerRadius: v ?? 0 })}
                    />
                  </div>
                )}
                {data.kind !== 'text' && (
                  <div>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Outline style</div>
                    <Radio.Group
                      size="small" value={data.strokeStyle ?? 'solid'}
                      onChange={e => onChange({ strokeStyle: e.target.value })}
                    >
                      <Radio.Button value="solid">Solid</Radio.Button>
                      <Radio.Button value="dashed">Dashed</Radio.Button>
                      <Radio.Button value="dotted">Dotted</Radio.Button>
                    </Radio.Group>
                  </div>
                )}
                {data.kind !== 'text' && (
                  <div>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Effect</div>
                    <Select
                      style={{ width: '100%' }}
                      value={data.effect ?? (data.kind === 'stickyNote' ? 'shadow' : 'none')}
                      options={[
                        { value: 'none', label: 'None' },
                        { value: 'shadow', label: 'Drop shadow' },
                        { value: 'float', label: 'Float' },
                        { value: 'glow', label: 'Glow' },
                      ]}
                      onChange={v => onChange({ effect: v })}
                    />
                  </div>
                )}
                {data.kind === 'container' && (
                  <div>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Theme</div>
                    <Select
                      style={{ width: '100%' }}
                      value={data.containerTheme ?? 'plain'}
                      options={[
                        { value: 'plain', label: 'Plain outline' },
                        { value: 'filled', label: 'Filled panel' },
                        { value: 'header', label: 'Header band' },
                        { value: 'swimlane', label: 'Swimlane' },
                      ]}
                      onChange={v => onChange({ containerTheme: v })}
                    />
                  </div>
                )}
                {data.kind === 'container' && (data.containerTheme === 'header' || data.containerTheme === 'swimlane') && (
                  <div>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Accent color</div>
                    <ColorPicker
                      value={data.containerAccentColor ?? '#7C93E8'}
                      onChangeComplete={c => onChange({ containerAccentColor: c.toHexString() })}
                      showText
                    />
                  </div>
                )}
                {data.kind === 'container' && data.containerTheme === 'swimlane' && (
                  <>
                    <div>
                      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Lane count</div>
                      <InputNumber
                        min={2} max={8} value={data.laneCount ?? 3} style={{ width: '100%' }}
                        onChange={v => onChange({ laneCount: v ?? 3 })}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Lane orientation</div>
                      <Radio.Group
                        size="small" value={data.laneOrientation ?? 'vertical'}
                        onChange={e => onChange({ laneOrientation: e.target.value })}
                      >
                        <Radio.Button value="vertical">Vertical</Radio.Button>
                        <Radio.Button value="horizontal">Horizontal</Radio.Button>
                      </Radio.Group>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Lane labels (comma-separated)</div>
                      <input
                        value={(data.laneLabels ?? []).join(', ')}
                        onChange={e => onChange({ laneLabels: e.target.value.split(',').map(s => s.trim()) })}
                        style={{ width: '100%', padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }}
                      />
                    </div>
                  </>
                )}
                {data.kind === 'pieChart' && (
                  <>
                    <div>
                      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Donut hole (0-85%)</div>
                      <InputNumber
                        min={0} max={85} value={Math.round((data.pieInnerRadius ?? 0) * 100)} style={{ width: '100%' }}
                        onChange={v => onChange({ pieInnerRadius: (v ?? 0) / 100 })}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Segments</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(data.pieSegments ?? DEFAULT_PIE_SEGMENTS).map((seg, i) => {
                          const segments = data.pieSegments ?? DEFAULT_PIE_SEGMENTS;
                          return (
                            <div key={seg.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <ColorPicker
                                value={seg.color}
                                onChangeComplete={c => {
                                  const next = [...segments];
                                  next[i] = { ...next[i], color: c.toHexString() };
                                  onChange({ pieSegments: next });
                                }}
                              />
                              <input
                                value={seg.label}
                                placeholder="Label"
                                onChange={e => {
                                  const next = [...segments];
                                  next[i] = { ...next[i], label: e.target.value };
                                  onChange({ pieSegments: next });
                                }}
                                style={{ flex: 1, minWidth: 0, padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 12, boxSizing: 'border-box' }}
                              />
                              <InputNumber
                                min={0} value={seg.value} style={{ width: 64 }}
                                onChange={v => {
                                  const next = [...segments];
                                  next[i] = { ...next[i], value: v ?? 0 };
                                  onChange({ pieSegments: next });
                                }}
                              />
                              <Button
                                size="small" icon={<DeleteOutlined />} danger
                                onClick={() => onChange({ pieSegments: segments.filter((_, idx) => idx !== i) })}
                              />
                            </div>
                          );
                        })}
                        <Button
                          size="small" icon={<PlusOutlined />}
                          onClick={() => {
                            const segments = data.pieSegments ?? DEFAULT_PIE_SEGMENTS;
                            onChange({ pieSegments: [...segments, { id: crypto.randomUUID(), label: 'New', value: 1, color: '#8CA3E8' }] });
                          }}
                        >
                          Add segment
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ),
          },
          ...(data.kind === 'text' ? [{
            key: 'text',
            label: <span><FontSizeOutlined /> Text</span>,
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#999', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                    Character
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <Select
                      style={{ width: '100%' }}
                      value={data.fontFamily ?? 'inherit'}
                      options={[
                        { value: 'inherit', label: 'Default' },
                        { value: "'Arial', sans-serif", label: 'Sans-serif' },
                        { value: "'Georgia', serif", label: 'Serif' },
                        { value: "'Courier New', monospace", label: 'Monospace' },
                        { value: "'Segoe Print', 'Bradley Hand', cursive", label: 'Handwriting' },
                      ]}
                      onChange={v => onChange({ fontFamily: v })}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Tooltip title="Font size">
                        <InputNumber
                          min={8} max={96} value={data.fontSize ?? 13} style={{ width: '100%' }}
                          prefix={<FontSizeOutlined style={{ color: '#bbb' }} />}
                          onChange={v => onChange({ fontSize: v ?? 13 })}
                        />
                      </Tooltip>
                      <Tooltip title="Line height">
                        <InputNumber
                          min={0.8} max={3} step={0.1} value={data.lineHeight ?? 1.3} style={{ width: '100%' }}
                          prefix={<LineHeightOutlined style={{ color: '#bbb' }} />}
                          onChange={v => onChange({ lineHeight: v ?? 1.3 })}
                        />
                      </Tooltip>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Tracking</div>
                      <InputNumber
                        min={-5} max={40} value={data.letterSpacing ?? 0} style={{ width: '100%' }}
                        onChange={v => onChange({ letterSpacing: v ?? 0 })}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button
                        size="small" type={data.fontWeight === 'bold' ? 'primary' : 'default'} icon={<BoldOutlined />}
                        onClick={() => onChange({ fontWeight: data.fontWeight === 'bold' ? 'normal' : 'bold' })}
                      />
                      <Button
                        size="small" type={data.fontStyle === 'italic' ? 'primary' : 'default'} icon={<ItalicOutlined />}
                        onClick={() => onChange({ fontStyle: data.fontStyle === 'italic' ? 'normal' : 'italic' })}
                      />
                      <Button
                        size="small" type={data.textDecoration === 'underline' ? 'primary' : 'default'} icon={<UnderlineOutlined />}
                        onClick={() => onChange({ textDecoration: data.textDecoration === 'underline' ? 'none' : 'underline' })}
                      />
                      <Button
                        size="small" type={data.textDecoration === 'line-through' ? 'primary' : 'default'} icon={<StrikethroughOutlined />}
                        onClick={() => onChange({ textDecoration: data.textDecoration === 'line-through' ? 'none' : 'line-through' })}
                      />
                    </div>
                    <ColorPicker
                      value={data.fontColor ?? '#1a1a2e'}
                      onChangeComplete={c => onChange({ fontColor: c.toHexString() })}
                      showText
                    />
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#999', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                    Paragraph
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Alignment</div>
                      <Radio.Group size="small" value={data.textAlign ?? 'center'} onChange={e => onChange({ textAlign: e.target.value })}>
                        <Radio.Button value="left"><AlignLeftOutlined /></Radio.Button>
                        <Radio.Button value="center"><AlignCenterOutlined /></Radio.Button>
                        <Radio.Button value="right"><AlignRightOutlined /></Radio.Button>
                        <Radio.Button value="justify"><MenuOutlined /></Radio.Button>
                      </Radio.Group>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Vertical alignment</div>
                      <Radio.Group size="small" value={data.verticalAlign ?? 'middle'} onChange={e => onChange({ verticalAlign: e.target.value })}>
                        <Radio.Button value="top"><VerticalAlignTopOutlined /></Radio.Button>
                        <Radio.Button value="middle"><VerticalAlignMiddleOutlined /></Radio.Button>
                        <Radio.Button value="bottom"><VerticalAlignBottomOutlined /></Radio.Button>
                      </Radio.Group>
                    </div>
                  </div>
                </div>
              </div>
            ),
          }] : []),
          ...(data.kind === 'video' ? [{
            key: 'video',
            label: <span><VideoCameraOutlined /> Video</span>,
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: '#888' }}>Autoplay (in presentation)</span>
                  <Switch size="small" checked={data.videoAutoplay ?? false} onChange={v => onChange({ videoAutoplay: v })} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: '#888' }}>Loop</span>
                  <Switch size="small" checked={data.videoLoop ?? false} onChange={v => onChange({ videoLoop: v })} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: '#888' }}>Muted</span>
                  <Switch size="small" checked={data.videoMuted ?? true} onChange={v => onChange({ videoMuted: v })} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: '#888' }}>Show controls (in presentation)</span>
                  <Switch size="small" checked={data.videoControls ?? true} onChange={v => onChange({ videoControls: v })} />
                </div>
              </div>
            ),
          }] : []),
          ...(data.kind === 'brushStroke' ? [{
            key: 'brush',
            label: <span><HighlightOutlined /> Brush</span>,
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 8 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Style</div>
                  <Select
                    style={{ width: '100%' }}
                    value={data.brushStyle ?? 'pencil'}
                    options={[
                      { value: 'pencil', label: 'Pencil' },
                      { value: 'marker', label: 'Marker' },
                      { value: 'calligraphy', label: 'Calligraphy' },
                    ]}
                    onChange={v => onChange({ brushStyle: v })}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Width</div>
                  <InputNumber
                    min={1} max={40} value={data.brushBaseWidth ?? 6} style={{ width: '100%' }}
                    onChange={v => onChange({ brushBaseWidth: v ?? 6 })}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Color</div>
                  <ColorPicker
                    value={data.strokeColor ?? '#1a1a2e'}
                    onChangeComplete={c => onChange({ strokeColor: c.toHexString() })}
                    showText
                  />
                </div>
              </div>
            ),
          }] : []),
          {
            key: 'link',
            label: <span><LinkOutlined /> Link</span>,
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 8 }}>
                <Radio.Group
                  size="small"
                  value={linkType}
                  onChange={e => {
                    const v = e.target.value;
                    setLinkType(v);
                    if (v === 'none') updateLink(null);
                    else updateLink({ type: v });
                  }}
                >
                  <Radio.Button value="none">None</Radio.Button>
                  <Radio.Button value="page">Page</Radio.Button>
                  <Radio.Button value="shape">Shape</Radio.Button>
                </Radio.Group>

                {linkType !== 'none' && (
                  <div>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Target page</div>
                    <Select
                      style={{ width: '100%' }}
                      placeholder="Choose a page"
                      value={data.link?.targetPageId}
                      options={pages.map(p => ({ value: p.id, label: p.name }))}
                      onChange={v => updateLink({ targetPageId: v, targetNodeId: undefined })}
                    />
                  </div>
                )}

                {linkType === 'shape' && data.link?.targetPageId && (
                  <div>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Target shape</div>
                    <Select
                      style={{ width: '100%' }}
                      placeholder="Choose a shape"
                      value={data.link?.targetNodeId}
                      options={shapesOnTargetPage.map(s => ({
                        value: s.id,
                        label: (s.data as ShapeNodeData).label || (s.data as ShapeNodeData).kind,
                      }))}
                      onChange={v => updateLink({ targetNodeId: v })}
                    />
                  </div>
                )}

                {linkType !== 'none' && (
                  <div>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Transition</div>
                    <Select
                      style={{ width: '100%' }}
                      value={data.link?.transition ?? 'smartAnimate'}
                      options={[
                        { value: 'smartAnimate', label: 'Smart animate (pan)' },
                        { value: 'instant', label: 'Instant' },
                        { value: 'dissolve', label: 'Dissolve' },
                      ]}
                      onChange={v => updateLink({ transition: v })}
                    />
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'data',
            label: <span><DatabaseOutlined /> Data</span>,
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Bound variable</div>
                  <Select
                    style={{ width: '100%' }}
                    placeholder="None"
                    allowClear
                    value={data.dataBinding?.variableId || undefined}
                    options={variables.map(v => ({ value: v.id, label: v.name }))}
                    onChange={v => onChange({ dataBinding: v ? { variableId: v, rules: data.dataBinding?.rules ?? [] } : undefined })}
                  />
                </div>

                {data.dataBinding && (
                  <>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Rules (first match wins)</div>
                    {(data.dataBinding.rules ?? []).map((rule, i) => (
                      <div key={rule.id} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <Select
                          size="small" style={{ width: 70 }} value={rule.op} options={OP_OPTIONS}
                          onChange={op => updateRule(i, { op })}
                        />
                        <InputNumber size="small" style={{ width: 56 }} value={rule.value} onChange={v => updateRule(i, { value: v ?? 0 })} />
                        {rule.op === 'between' && (
                          <InputNumber size="small" style={{ width: 56 }} value={rule.value2} onChange={v => updateRule(i, { value2: v ?? 0 })} />
                        )}
                        <ColorPicker
                          size="small"
                          value={rule.style.fill ?? '#ff4d4f'}
                          onChangeComplete={c => updateRule(i, { style: { ...rule.style, fill: c.toHexString() } })}
                        />
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeRule(i)} />
                      </div>
                    ))}
                    <Button size="small" icon={<PlusOutlined />} onClick={addRule}>Add rule</Button>
                  </>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
