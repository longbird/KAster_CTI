import { Button, Card, Popconfirm, Space, Tag, Typography, notification } from 'antd';
import { useEffect, useState } from 'react';
import { createIvrMenu, deleteIvrMenu, getIvrMenus, updateIvrMenu } from '../api/asteriskConfigApi';
import type { AsteriskIvrMenu } from '../types/asterisk-config';
import { IvrMenuForm } from './IvrMenuForm';
import { usePermissionStore } from '../../../store/usePermissionStore';
import { ResponsiveTable } from '../../../components/ResponsiveTable';

export function IvrMenusTab() {
  const [rows, setRows] = useState<AsteriskIvrMenu[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AsteriskIvrMenu | null>(null);
  const permission = usePermissionStore((s) => s.permissionsByMenu.asterisk);
  const canCreate = permission?.canCreate ?? true;
  const canUpdate = permission?.canUpdate ?? true;
  const canDelete = permission?.canDelete ?? true;

  const load = async () => {
    setLoading(true);
    try { setRows(await getIvrMenus()); } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handleSave = async (values: Omit<AsteriskIvrMenu, 'id'>) => {
    try {
      if (editing) await updateIvrMenu(editing.id, values);
      else await createIvrMenu(values);
      notification.success({ message: 'PBX 설정이 적용되었습니다 (AMI reload 전송됨)' });
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
      title: '관리', width: 120, fixed: 'right' as const,
      render: (_: unknown, row: AsteriskIvrMenu) => (
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
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start" wrap>
          <div>
            <Typography.Title level={5} style={{ margin: 0 }}>
              IVR 메뉴
            </Typography.Title>
            <Typography.Text type="secondary">
              수신 DID가 연결할 안내 멘트와 선택 번호, 후속 연결 대상을 관리합니다.
            </Typography.Text>
          </div>
          {canCreate ? <Button type="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>IVR 메뉴 추가</Button> : null}
        </Space>
      </Card>
      <Card title="IVR 메뉴 목록">
        <ResponsiveTable
          rowKey="id"
          dataSource={rows}
          columns={columns}
          loading={loading}
          pagination={false}
          size="small"
          tableLayout="fixed"
          scroll={{ x: 680 }}
        />
      </Card>
      <IvrMenuForm open={formOpen} initial={editing} onOk={handleSave} onCancel={() => { setFormOpen(false); setEditing(null); }} />
    </Space>
  );
}
