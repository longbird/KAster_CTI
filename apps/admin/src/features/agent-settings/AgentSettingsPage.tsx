import {
  Button,
  Card,
  Modal,
  Popconfirm,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CopyOutlined,
  EditOutlined,
  KeyOutlined,
  PlusOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { usePermissionStore } from '../../store/usePermissionStore';
import { FeatureHelpButton } from '../../shared/help';
import { apiClient } from '../../shared/lib/apiClient';
import { AgentCreateModal } from './AgentCreateModal';
import { AgentEditModal, type AgentRow } from './AgentEditModal';
import { AgentPermissionCopyModal } from './AgentPermissionCopyModal';

const STATUS_COLOR: Record<string, string> = {
  AVAILABLE: 'green',
  TALKING: 'blue',
  RINGING: 'gold',
  RINGING_AGENT: 'gold',
  AFTER_CALL_WORK: 'purple',
  BREAK: 'red',
  MEAL: 'orange',
  MANUAL_PAUSED: 'default',
};

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: '대기',
  TALKING: '통화 중',
  RINGING: '벨 울림',
  RINGING_AGENT: '벨 울림',
  AFTER_CALL_WORK: '후처리',
  BREAK: '휴식',
  MEAL: '식사',
  MANUAL_PAUSED: '일시정지',
};

export function AgentSettingsPage() {
  const agentPermission = usePermissionStore((state) => state.permissionsByMenu['settings/agents']);
  const [rows, setRows] = useState<AgentRow[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<AgentRow | null>(null);
  const [copyTarget, setCopyTarget] = useState<AgentRow | null>(null);

  const load = async () => {
    try {
      const res = await apiClient.get('/agents');
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const deactivate = async (agentId: string) => {
    try {
      await apiClient.delete(`/agents/${agentId}`);
      message.success('비활성화 완료');
      void load();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? '비활성화 실패';
      message.error(msg);
    }
  };

  const resetPassword = async (agentId: string, agentName: string) => {
    try {
      const res = await apiClient.post(`/agents/${agentId}/reset-password`);
      const tempPassword = res.data?.data?.tempPassword ?? '-';
      Modal.success({
        title: `${agentName} 임시 비밀번호`,
        content: (
          <Space direction="vertical">
            <Typography.Text>아래 비밀번호는 한 번만 표시됩니다.</Typography.Text>
            <Typography.Text code copyable>
              {tempPassword}
            </Typography.Text>
          </Space>
        ),
      });
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? '비밀번호 초기화 실패';
      message.error(msg);
    }
  };

  if (!rows) return <Skeleton active paragraph={{ rows: 8 }} />;

  return (
    <Card>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space align="center">
          <Typography.Title level={4} style={{ margin: 0 }}>
            상담원 설정
          </Typography.Title>
          <FeatureHelpButton featureKey="agent.extensionDisplayName" featureName="내선 표시명" />
        </Space>
        {agentPermission?.canCreate !== false ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              setShowCreate(true);
            }}
          >
            신규 등록
          </Button>
        ) : null}
      </Space>
      <Table<AgentRow>
        rowKey="agentId"
        dataSource={rows}
        pagination={{ pageSize: 20 }}
        tableLayout="fixed"
        scroll={{ x: 880 }}
        rowClassName={(r) => (!r.isActive ? 'ant-table-row-disabled' : '')}
        columns={[
          { title: '이름', dataIndex: 'agentName', width: 140 },
          { title: '로그인 ID', dataIndex: 'loginId', width: 150 },
          { title: '내선', dataIndex: 'extension', width: 100 },
          { title: '역할', dataIndex: 'role', width: 120, render: (v: string) => <Tag>{v}</Tag> },
          {
            title: '현재 상태',
            width: 130,
            render: (_: unknown, r: AgentRow) =>
              !r.isActive ? (
                <Tag color="default">비활성</Tag>
              ) : r.currentStatus ? (
                <Tag color={STATUS_COLOR[r.currentStatus.statusCode] ?? 'default'}>
                  {STATUS_LABEL[r.currentStatus.statusCode] ?? r.currentStatus.statusCode}
                </Tag>
              ) : (
                <Tag>오프라인</Tag>
              ),
          },
          {
            title: '관리',
            width: 220,
            fixed: 'right',
            render: (_: unknown, r: AgentRow) => (
              <Space size="small">
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setShowCreate(false);
                    setEditing(r);
                  }}
                  disabled={!r.isActive || agentPermission?.canUpdate === false}
                >
                  수정
                </Button>
                <Button
                  size="small"
                  icon={<KeyOutlined />}
                  onClick={() => void resetPassword(r.agentId, r.agentName)}
                  disabled={!r.isActive || agentPermission?.canOperate === false}
                >
                  PW 초기화
                </Button>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => setCopyTarget(r)}
                  disabled={!r.isActive || agentPermission?.canUpdate === false}
                  title="다른 상담원의 권한을 이 상담원으로 복사"
                >
                  권한복사
                </Button>
                <Popconfirm
                  title="정말 비활성화할까요?"
                  onConfirm={() => void deactivate(r.agentId)}
                  okText="예"
                  cancelText="아니오"
                  disabled={!r.isActive || agentPermission?.canDelete === false}
                >
                  <Button
                    size="small"
                    danger
                    icon={<StopOutlined />}
                    disabled={!r.isActive || agentPermission?.canDelete === false}
                  >
                    비활성화
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      {agentPermission?.canCreate !== false ? (
        <AgentCreateModal
          open={showCreate && !editing}
          onClose={() => {
            setShowCreate(false);
          }}
          onCreated={() => void load()}
        />
      ) : null}
      {agentPermission?.canUpdate !== false ? (
        <AgentEditModal
          agent={showCreate ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={() => void load()}
        />
      ) : null}
      {agentPermission?.canUpdate !== false ? (
        <AgentPermissionCopyModal
          target={copyTarget}
          onClose={() => setCopyTarget(null)}
          onSaved={() => void load()}
        />
      ) : null}
    </Card>
  );
}
