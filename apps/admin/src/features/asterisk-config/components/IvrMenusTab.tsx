import { Button, Card, Descriptions, Drawer, Popconfirm, Space, Table, Tag, Typography, notification } from 'antd';
import { useEffect, useState } from 'react';
import { createIvrMenu, deleteIvrMenu, getIvrMenus, updateIvrMenu } from '../api/asteriskConfigApi';
import type { AsteriskIvrMenu } from '../types/asterisk-config';
import { IvrMenuForm } from './IvrMenuForm';
import { usePermissionStore } from '../../../store/usePermissionStore';

export function IvrMenusTab() {
  const [rows, setRows] = useState<AsteriskIvrMenu[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AsteriskIvrMenu | null>(null);
  const [summary, setSummary] = useState<AsteriskIvrMenu | null>(null);
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
      title: '흐름',
      render: (_: unknown, row: AsteriskIvrMenu) => (
        <Space wrap size={4}>
          {row.entries.map((entry) => (
            <Tag key={`${row.id}-${entry.digit}`}>{entry.digit} &rarr; {entry.queueName}</Tag>
          ))}
          {row.entries.length === 0 ? <Tag color="red">연결 없음</Tag> : null}
        </Space>
      ),
    },
    {
      title: '동작', width: 200,
      render: (_: unknown, row: AsteriskIvrMenu) => (
        <Space>
          <Button size="small" onClick={() => setSummary(row)}>요약</Button>
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
        <Table
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
      <Drawer
        title="IVR 흐름 요약"
        open={!!summary}
        onClose={() => setSummary(null)}
        width={560}
      >
        {summary ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="메뉴">{summary.name}</Descriptions.Item>
              <Descriptions.Item label="안내 멘트">{summary.welcomePrompt || '-'}</Descriptions.Item>
              <Descriptions.Item label="메뉴 멘트">{summary.menuPrompt || '-'}</Descriptions.Item>
              <Descriptions.Item label="Timeout">{summary.timeoutSecs}s</Descriptions.Item>
            </Descriptions>
            <Table
              size="small"
              rowKey={(row) => `${row.digit}-${row.queueName}`}
              pagination={false}
              dataSource={summary.entries}
              columns={[
                { title: 'DTMF', dataIndex: 'digit', width: 80 },
                { title: '표시명', dataIndex: 'label' },
                { title: '연결 큐', dataIndex: 'queueName' },
              ]}
              locale={{ emptyText: '연결된 DTMF 경로가 없습니다.' }}
            />
            {summary.entries.length === 0 ? (
              <Typography.Text type="danger">활성화 전 최소 1개 이상의 DTMF 경로가 필요합니다.</Typography.Text>
            ) : null}
          </Space>
        ) : null}
      </Drawer>
    </Space>
  );
}
