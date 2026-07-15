import { useState, useRef } from 'react';
import { Table, Button, Input, InputNumber, Modal, message, Tooltip } from 'antd';
import { IconAdd, IconDelete, IconUpload, IconClose } from '../icons';
import type { DiagramVariable } from '../../types/variables';
import { importVariablesCsv } from '../../utils/variableCsvImport';
import { PeekableDrawer } from './PeekableDrawer';

interface Props {
  variables: DiagramVariable[];
  onUpsert: (variable: DiagramVariable) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function DataPanel({ variables, onUpsert, onDelete, onClose }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState<number>(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleAdd() {
    if (!newName.trim()) return;
    onUpsert({
      id: crypto.randomUUID(),
      name: newName.trim(),
      value: newValue,
      valueType: 'number',
      source: 'manual',
      updatedAt: Date.now(),
      updatedBy: 'local',
    });
    setAddOpen(false);
    setNewName('');
    setNewValue(0);
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const imported = await importVariablesCsv(file);
      imported.forEach(v => onUpsert(v));
      message.success(`Imported ${imported.length} variable${imported.length !== 1 ? 's' : ''}`);
    } catch {
      message.error('Could not parse that CSV — expected columns: Name,Value');
    }
  }

  return (
    <PeekableDrawer>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#1a1a2e' }}>Data</span>
        <Button size="small" type="text" icon={<IconClose />} onClick={onClose} />
      </div>

      <div style={{ padding: '10px 14px', display: 'flex', gap: 8, borderBottom: '1px solid #f0f0f0' }}>
        <Button size="small" icon={<IconAdd />} onClick={() => setAddOpen(true)}>Variable</Button>
        <Tooltip title="Import CSV (columns: Name,Value)">
          <Button size="small" icon={<IconUpload />} onClick={() => fileRef.current?.click()}>CSV</Button>
        </Tooltip>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCsvUpload} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
        <Table
          size="small"
          pagination={false}
          rowKey="id"
          dataSource={variables}
          columns={[
            { title: 'Name', dataIndex: 'name', key: 'name' },
            {
              title: 'Value', dataIndex: 'value', key: 'value',
              render: (v: number | string | boolean, record: DiagramVariable) => (
                <InputNumber
                  size="small" value={typeof v === 'number' ? v : Number(v) || 0}
                  onChange={val => onUpsert({ ...record, value: val ?? 0, updatedAt: Date.now() })}
                />
              ),
            },
            {
              title: '', key: 'actions', width: 32,
              render: (_: unknown, record: DiagramVariable) => (
                <Button size="small" type="text" danger icon={<IconDelete />} onClick={() => onDelete(record.id)} />
              ),
            },
          ]}
        />
        {variables.length === 0 && (
          <div style={{ fontSize: 12, color: '#999', textAlign: 'center', paddingTop: 20 }}>
            No variables yet. Add one or import a CSV to start binding shape styles to live data.
          </div>
        )}
      </div>

      <Modal
        title="New Variable" open={addOpen} onOk={handleAdd} onCancel={() => setAddOpen(false)}
        okButtonProps={{ disabled: !newName.trim() }} destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          <Input placeholder="Variable name" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
          <InputNumber placeholder="Initial value" value={newValue} onChange={v => setNewValue(v ?? 0)} style={{ width: '100%' }} />
        </div>
      </Modal>
    </PeekableDrawer>
  );
}
