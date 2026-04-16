import { Button, Popconfirm, Space, Table, Tag, notification } from 'antd';
import { useEffect, useState } from 'react';
import { createDid, deleteDid, getDids, updateDid } from '../api/asteriskConfigApi';
import type { AsteriskDid } from '../types/asterisk-config';
import { DidForm } from './DidForm';

export function DidsTab() {
  const [rows, setRows] = useState<AsteriskDid[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AsteriskDid | null>(null);

  const load = async () => {
    setLoading(true);
    try { setRows(await getDids()); } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handleSave = async (values: Omit<AsteriskDid, 'id'>) => {
    try {
      if (editing) await updateDid(editing.id, values);
      else await createDid(values);
      notification.success({ message: 'Asterisk 설정이 적용되었습니다 (AMI reload 전송됨)' });
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch {
      notification.error({ message: '저장 실패' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDid(id);
      notification.success({ message: '삭제되었습니다' });
      await load();
    } catch {
      notification.error({ message: '삭제 실패' });
    }
  };

  const columns = [
    { title: '착신번호', dataIndex: 'did' },
    { title: '설명', dataIndex: 'description' },
    {
      title: '연결',
      render: (_: unknown, row: AsteriskDid) =>
        row.ivrMenuId ? <Tag color="blue">IVR</Tag> : <Tag color="green">큐: {row.directQueue}</Tag>,
    },
    {
      title: '상태', dataIndex: 'enabled', width: 80,
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '활성' : '비활성'}</Tag>,
    },
    {
      title: '동작', width: 120,
      render: (_: unknown, row: AsteriskDid) => (
        <Space>
          <Button size="small" onClick={() => { setEditing(row); setFormOpen(true); }}>수정</Button>
          <Popconfirm title="삭제할까요?" onConfirm={() => handleDelete(row.id)}>
            <Button size="small" danger>삭제</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>DID 추가</Button>
      </Space>
      <Table rowKey="id" dataSource={rows} columns={columns} loading={loading} pagination={false} size="small" />
      <DidForm open={formOpen} initial={editing} onOk={handleSave} onCancel={() => { setFormOpen(false); setEditing(null); }} />
    </>
  );
}
