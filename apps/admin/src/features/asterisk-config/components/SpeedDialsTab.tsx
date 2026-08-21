import { Button, Card, Popconfirm, Space, Table, Tag, Typography, notification } from 'antd';
import { useEffect, useState } from 'react';
import { createSpeedDial, deleteSpeedDial, getSpeedDials, updateSpeedDial } from '../api/asteriskConfigApi';
import type { AsteriskSpeedDial, AsteriskSpeedDialInput } from '../types/asterisk-config';
import { SpeedDialForm } from './SpeedDialForm';
import { FeatureHelpButton } from '../../../shared/help/FeatureHelpButton';
import { usePermissionStore } from '../../../store/usePermissionStore';
import { formatPhoneNumber } from '../../../shared/lib/format';
import { ResponsiveTable } from '../../../components/ResponsiveTable';

export function SpeedDialsTab() {
  const [rows, setRows] = useState<AsteriskSpeedDial[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AsteriskSpeedDial | null>(null);
  const permission = usePermissionStore((s) => s.permissionsByMenu.asterisk);
  const canCreate = permission?.canCreate ?? true;
  const canUpdate = permission?.canUpdate ?? true;
  const canDelete = permission?.canDelete ?? true;

  const load = async () => {
    setLoading(true);
    try {
      setRows(await getSpeedDials());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleSave = async (values: AsteriskSpeedDialInput) => {
    try {
      if (editing) await updateSpeedDial(editing.id, values);
      else await createSpeedDial(values);
      notification.success({ message: '단축 발신이 저장되었습니다.' });
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch {
      notification.error({ message: '단축 발신 저장 실패' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSpeedDial(id);
      notification.success({ message: '단축 발신이 삭제되었습니다.' });
      await load();
    } catch {
      notification.error({ message: '단축 발신 삭제 실패' });
    }
  };

  const columns = [
    { title: '단축번호', dataIndex: 'code', width: 120, render: (value: string) => <Tag color="blue">{value}</Tag> },
    { title: '대상번호', dataIndex: 'targetNumber', width: 180, render: (value: string) => formatPhoneNumber(value) },
    { title: '표시명', dataIndex: 'displayName' },
    { title: '설명', dataIndex: 'description' },
    {
      title: '상태',
      dataIndex: 'enabled',
      width: 80,
      render: (value: boolean) => <Tag color={value ? 'green' : 'default'}>{value ? '활성' : '비활성'}</Tag>,
    },
    {
      title: '관리',
      width: 120,
      fixed: 'right' as const,
      render: (_: unknown, row: AsteriskSpeedDial) => (
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
            <Space align="center">
              <Typography.Title level={5} style={{ margin: 0 }}>
                단축 발신
              </Typography.Title>
              <FeatureHelpButton featureKey="pbx.speedDial" featureName="단축 발신" />
            </Space>
            <Typography.Text type="secondary">
              상담원 SIP 전화기에서 단축번호를 눌러 내선 또는 외부번호로 발신합니다.
            </Typography.Text>
          </div>
          {canCreate ? <Button type="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>단축 발신 추가</Button> : null}
        </Space>
      </Card>
      <Card title="단축 발신 목록">
        <ResponsiveTable
          rowKey="id"
          dataSource={rows}
          columns={columns}
          loading={loading}
          pagination={false}
          size="small"
          tableLayout="fixed"
          scroll={{ x: 860 }}
        />
      </Card>
      <SpeedDialForm
        open={formOpen}
        initial={editing}
        onOk={handleSave}
        onCancel={() => { setFormOpen(false); setEditing(null); }}
      />
    </Space>
  );
}
