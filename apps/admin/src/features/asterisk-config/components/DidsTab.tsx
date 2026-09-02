import { Button, Card, Popconfirm, Space, Table, Tag, Typography, notification } from 'antd';
import { useEffect, useState } from 'react';
import { createDid, deleteDid, getDids, updateDid } from '../api/asteriskConfigApi';
import type { AsteriskDid } from '../types/asterisk-config';
import { DidForm } from './DidForm';
import { usePermissionStore } from '../../../store/usePermissionStore';
import { formatPhoneNumber } from '../../../shared/lib/format';
import { ResponsiveTable } from '../../../components/ResponsiveTable';

export interface DidsTabProps {
  resourceId?: string | null;
  onResourceHandled?: () => void;
}

export function DidsTab({ resourceId, onResourceHandled }: DidsTabProps) {
  const [rows, setRows] = useState<AsteriskDid[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AsteriskDid | null>(null);
  const permission = usePermissionStore((s) => s.permissionsByMenu.asterisk);
  const canCreate = permission?.canCreate ?? true;
  const canUpdate = permission?.canUpdate ?? true;
  const canDelete = permission?.canDelete ?? true;

  const load = async () => {
    setLoading(true);
    try { setRows(await getDids()); } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!resourceId || loading) return;
    const target = rows.find((row) => row.id === resourceId);
    if (!target) return;
    setEditing(target);
    setFormOpen(true);
  }, [loading, resourceId, rows]);

  const handleSave = async (values: Omit<AsteriskDid, 'id'>) => {
    try {
      if (editing) await updateDid(editing.id, values);
      else await createDid(values);
      notification.success({ message: 'PBX 설정이 적용되었습니다 (AMI reload 전송됨)' });
      setFormOpen(false);
      setEditing(null);
      onResourceHandled?.();
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
    {
      title: '대표번호',
      dataIndex: 'representativeNumber',
      render: (value: string | null) => formatPhoneNumber(value),
    },
    {
      title: '착신번호',
      dataIndex: 'did',
      render: (value: string) => formatPhoneNumber(value),
    },
    { title: '설명', dataIndex: 'description' },
    {
      title: '연결',
      render: (_: unknown, row: AsteriskDid) =>
        row.ivrMenuId
          ? <Tag color="processing">IVR</Tag>
          : row.directExtension
            ? <Tag color="default">내선: {row.directExtension}</Tag>
            : <Tag color="success">큐: {row.directQueue}</Tag>,
    },
    {
      title: '지사',
      render: (_: unknown, row: AsteriskDid) => {
        const items = row.branchMappings ?? [];
        if (items.length === 0) return '-';
        return (
          <Space wrap>
            {items.map((item) => (
              <Tag key={item.branch.branchId} color="default">
                {item.branch.branchName}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: '상태', dataIndex: 'enabled', width: 80,
      render: (v: boolean) => <Tag color={v ? 'success' : 'default'}>{v ? '활성' : '비활성'}</Tag>,
    },
    {
      title: '관리', width: 120, fixed: 'right' as const,
      render: (_: unknown, row: AsteriskDid) => (
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
              DID 설정
            </Typography.Title>
            <Typography.Text type="secondary">
              통신사에서 수신한 DID 번호를 대표번호, IVR, 호 분배룰과 연결합니다.
            </Typography.Text>
          </div>
          {canCreate ? <Button type="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>DID 추가</Button> : null}
        </Space>
      </Card>
      <Card title="DID 목록">
        <ResponsiveTable
          rowKey="id"
          dataSource={rows}
          columns={columns}
          loading={loading}
          pagination={false}
          size="small"
          tableLayout="fixed"
          scroll={{ x: 920 }}
        />
      </Card>
      <DidForm
        open={formOpen}
        initial={editing}
        onOk={handleSave}
        onCancel={() => {
          setFormOpen(false);
          setEditing(null);
          onResourceHandled?.();
        }}
      />
    </Space>
  );
}
