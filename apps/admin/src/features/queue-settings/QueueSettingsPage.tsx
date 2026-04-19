import {
  Button,
  Card,
  Popconfirm,
  Skeleton,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  EditOutlined,
  PlusOutlined,
  StopOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { usePermissionStore } from '../../store/usePermissionStore';
import { apiClient } from '../../shared/lib/apiClient';
import { QueueCreateModal } from './QueueCreateModal';
import { QueueEditModal, type QueueRow } from './QueueEditModal';
import { QueueMembersDrawer } from './QueueMembersDrawer';

export function QueueSettingsPage() {
  const queuePermission = usePermissionStore((state) => state.permissionsByMenu['settings/queues']);
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<QueueRow | null>(null);
  const [managingMembers, setManagingMembers] = useState<QueueRow | null>(null);

  const load = async () => {
    try {
      const res = await apiClient.get('/queues');
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const deactivate = async (queueId: string) => {
    try {
      await apiClient.delete(`/queues/${queueId}`);
      message.success('비활성화 완료');
      void load();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? '비활성화 실패';
      message.error(msg);
    }
  };

  if (!rows) return <Skeleton active paragraph={{ rows: 6 }} />;

  return (
    <Card>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          호 분배룰 설정
        </Typography.Title>
        {queuePermission?.canCreate !== false ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowCreate(true)}>
            신규 룰 생성
          </Button>
        ) : null}
      </Space>

      <Table<QueueRow>
        rowKey="queueId"
        dataSource={rows}
        pagination={false}
        rowClassName={(r) => (!r.isActive ? 'ant-table-row-disabled' : '')}
        columns={[
          {
            title: '큐명',
            render: (_: unknown, r: QueueRow) => (
              <Space size={[4, 4]} wrap>
                <span>{r.queueDisplayName ?? r.queueName}</span>
                {r.isDefaultRule ? <Tag color="gold">기본 룰</Tag> : null}
              </Space>
            ),
          },
          { title: '내부명', dataIndex: 'queueName' },
          { title: '내선', dataIndex: 'queueExten' },
          {
            title: '분배 전략',
            dataIndex: 'strategy',
            render: (v?: string) => (v ? <Tag>{v}</Tag> : '-'),
          },
          { title: '링 TM(초)', dataIndex: 'ringTimeoutSeconds', render: (v?: number) => v ?? '-' },
          { title: '후처리(초)', dataIndex: 'wrapupSeconds', render: (v?: number) => v ?? '-' },
          { title: '대기 TM(초)', dataIndex: 'maxWaitSeconds', render: (v?: number) => v ?? '-' },
          {
            title: 'Auto Pause',
            dataIndex: 'autopause',
            render: (v?: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'ON' : 'OFF'}</Tag>,
          },
          {
            title: '상태',
            dataIndex: 'isActive',
            render: (v?: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? '활성' : '비활성'}</Tag>,
          },
          {
            title: '라우팅 참조',
            width: 240,
            render: (_: unknown, r: QueueRow) => {
              const refs = r.routingReferences;
              const tags = [
                refs?.directDidCount ? (
                  <Tag key="did" color="blue">
                    DID {refs.directDidCount}
                  </Tag>
                ) : null,
                refs?.forwardingRuleCount ? (
                  <Tag key="forward" color="purple">
                    착신전환 {refs.forwardingRuleCount}
                  </Tag>
                ) : null,
                refs?.ivrEntryCount ? (
                  <Tag key="ivr" color="cyan">
                    IVR {refs.ivrEntryCount}
                  </Tag>
                ) : null,
              ].filter(Boolean);

              if (tags.length === 0) {
                return <Tag>없음</Tag>;
              }

              return (
                <Tooltip title={r.deactivateBlockedReason ?? undefined}>
                  <Space size={[4, 4]} wrap>
                    {tags}
                  </Space>
                </Tooltip>
              );
            },
          },
          {
            title: '액션',
            width: 220,
            render: (_: unknown, r: QueueRow) => {
              const deleteDisabled =
                !r.isActive || r.canDeactivate === false || queuePermission?.canDelete === false;

              return (
                <Space size="small">
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => setEditing(r)}
                    disabled={!r.isActive || queuePermission?.canUpdate === false}
                  >
                    수정
                  </Button>
                  <Button
                    size="small"
                    icon={<TeamOutlined />}
                    onClick={() => setManagingMembers(r)}
                    disabled={!r.isActive || queuePermission?.canOperate === false}
                  >
                    분배룰
                  </Button>
                  <Tooltip title={deleteDisabled ? r.deactivateBlockedReason ?? undefined : undefined}>
                    <Popconfirm
                      title={r.deactivateBlockedReason ?? '정말 비활성화할까요?'}
                      onConfirm={() => void deactivate(r.queueId)}
                      okText="예"
                      cancelText="아니오"
                      disabled={deleteDisabled}
                    >
                      <Button
                        size="small"
                        danger
                        icon={<StopOutlined />}
                        disabled={deleteDisabled}
                      >
                        비활성화
                      </Button>
                    </Popconfirm>
                  </Tooltip>
                </Space>
              );
            },
          },
        ]}
      />

      {queuePermission?.canCreate !== false ? (
        <QueueCreateModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={() => void load()}
        />
      ) : null}
      {queuePermission?.canUpdate !== false ? (
        <QueueEditModal
          queue={editing}
          onClose={() => setEditing(null)}
          onSaved={() => void load()}
        />
      ) : null}
      {queuePermission?.canOperate !== false ? (
        <QueueMembersDrawer queue={managingMembers} onClose={() => setManagingMembers(null)} />
      ) : null}
    </Card>
  );
}
