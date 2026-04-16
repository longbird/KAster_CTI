import { Button, Popconfirm, Space, Table, Tag, notification } from 'antd';
import { useEffect, useState } from 'react';
import { createIvrMenu, deleteIvrMenu, getIvrMenus, updateIvrMenu } from '../api/asteriskConfigApi';
import type { AsteriskIvrMenu } from '../types/asterisk-config';
import { IvrMenuForm } from './IvrMenuForm';

export function IvrMenusTab() {
  const [rows, setRows] = useState<AsteriskIvrMenu[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AsteriskIvrMenu | null>(null);

  const load = async () => {
    setLoading(true);
    try { setRows(await getIvrMenus()); } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handleSave = async (values: Omit<AsteriskIvrMenu, 'id'>) => {
    try {
      if (editing) await updateIvrMenu(editing.id, values);
      else await createIvrMenu(values);
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
      await deleteIvrMenu(id);
      notification.success({ message: '삭제되었습니다' });
      await load();
    } catch {
      notification.error({ message: '삭제 실패' });
    }
  };

  const columns = [
    { title: '메뉴 이름', dataIndex: 'name' },
    { title: '항목 수', render: (_: unknown, row: AsteriskIvrMenu) => <Tag>{row.entries.length}개</Tag> },
    { title: '대기(초)', dataIndex: 'timeoutSecs', width: 80 },
    {
      title: '동작', width: 140,
      render: (_: unknown, row: AsteriskIvrMenu) => (
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
        <Button type="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>IVR 메뉴 추가</Button>
      </Space>
      <Table rowKey="id" dataSource={rows} columns={columns} loading={loading} pagination={false} size="small" />
      <IvrMenuForm open={formOpen} initial={editing} onOk={handleSave} onCancel={() => { setFormOpen(false); setEditing(null); }} />
    </>
  );
}
