import { Button, Popconfirm, Space, Table, Tag, notification } from 'antd';
import { useEffect, useState } from 'react';
import { createTrunk, createTrunksBulk, deleteTrunk, getTrunks, updateTrunk } from '../api/asteriskConfigApi';
import type { AsteriskBulkTrunkInput, AsteriskTrunk, AsteriskTrunkInput } from '../types/asterisk-config';
import { BulkTrunkModal } from './BulkTrunkModal';
import { TrunkForm } from './TrunkForm';
import { usePermissionStore } from '../../../store/usePermissionStore';

export function TrunksTab() {
  const [rows, setRows] = useState<AsteriskTrunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<AsteriskTrunk | null>(null);
  const permission = usePermissionStore((s) => s.permissionsByMenu.asterisk);
  const canCreate = permission?.canCreate ?? true;
  const canUpdate = permission?.canUpdate ?? true;
  const canDelete = permission?.canDelete ?? true;

  const load = async () => {
    setLoading(true);
    try { setRows(await getTrunks()); } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handleSave = async (values: AsteriskTrunkInput) => {
    try {
      if (editing) await updateTrunk(editing.id, values);
      else await createTrunk(values);
      notification.success({ message: 'PBX 설정이 적용되었습니다 (AMI reload 전송됨)' });
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch {
      notification.error({ message: '저장 실패' });
    }
  };

  const handleBulkSave = async (values: AsteriskBulkTrunkInput) => {
    try {
      const created = await createTrunksBulk(values);
      notification.success({ message: `${created.length}개 회선을 등록했습니다.` });
      setBulkOpen(false);
      await load();
    } catch {
      notification.error({ message: '일괄 등록 실패' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTrunk(id);
      notification.success({ message: '삭제되었습니다' });
      await load();
    } catch {
      notification.error({ message: '삭제 실패' });
    }
  };

  const columns = [
    { title: '표시명', dataIndex: 'name' },
    { title: 'Host', dataIndex: 'host' },
    { title: '포트', dataIndex: 'port', width: 80 },
    {
      title: '인증',
      dataIndex: 'username',
      render: (value: string) => (value ? value : <Tag>무인증</Tag>),
    },
    { title: '코덱', dataIndex: 'codecs' },
    {
      title: '상태', dataIndex: 'enabled', width: 80,
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '활성' : '비활성'}</Tag>,
    },
    {
      title: '동작', width: 120,
      render: (_: unknown, row: AsteriskTrunk) => (
        <Space>
          {canUpdate ? <Button size="small" onClick={() => { setEditing(row); setFormOpen(true); }}>수정</Button> : null}
          {canDelete ? (
            <Popconfirm title="삭제할까요?" onConfirm={() => handleDelete(row.id)}>
              <Button size="small" danger>삭제</Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        {canCreate ? <Button type="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>트렁크 추가</Button> : null}
        {canCreate ? <Button onClick={() => setBulkOpen(true)}>일괄 등록</Button> : null}
      </Space>
      <Table rowKey="id" dataSource={rows} columns={columns} loading={loading} pagination={false} size="small" />
      <TrunkForm open={formOpen} initial={editing} onOk={handleSave} onCancel={() => { setFormOpen(false); setEditing(null); }} />
      <BulkTrunkModal open={bulkOpen} onOk={handleBulkSave} onCancel={() => setBulkOpen(false)} />
    </>
  );
}
