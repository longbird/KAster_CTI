import { DeleteOutlined, EditOutlined, PhoneOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, Popconfirm, Skeleton, Space, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { FeatureHelpButton } from '../../shared/help';
import { apiClient } from '../../shared/lib/apiClient';
import { usePermissionStore } from '../../store/usePermissionStore';
import { BranchAgentCidAuthDrawer } from './BranchAgentCidAuthDrawer';
import { BranchEditModal, type BranchRow } from './BranchEditModal';
import { ResponsiveTable } from '../../components/ResponsiveTable';

export function BranchSettingsPage() {
  const [rows, setRows] = useState<BranchRow[] | null>(null);
  const [editing, setEditing] = useState<BranchRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [cidAuthBranch, setCidAuthBranch] = useState<BranchRow | null>(null);
  const permission = usePermissionStore((s) => s.permissionsByMenu['settings/branches']);
  const canCreate = permission?.canCreate ?? true;
  const canUpdate = permission?.canUpdate ?? true;
  const canDelete = permission?.canDelete ?? true;

  const load = async () => {
    try {
      const res = await apiClient.get('/admin/settings/branches');
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
      message.error('지사 목록을 불러오지 못했습니다.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const remove = async (branchId: string) => {
    try {
      await apiClient.delete(`/admin/settings/branches/${branchId}`);
      message.success('지사를 삭제했습니다.');
      await load();
    } catch {
      message.error('지사 삭제에 실패했습니다.');
    }
  };

  const headerLabel = (label: string) => <span style={{ whiteSpace: 'nowrap' }}>{label}</span>;
  const summary = useMemo(() => {
    const source = rows ?? [];
    return {
      branches: source.length,
      activeBranches: source.filter((row) => row.isActive).length,
      agents: source.reduce((sum, row) => sum + (row.agentCount ?? 0), 0),
      queues: source.reduce((sum, row) => sum + (row.queueCount ?? 0), 0),
      dids: source.reduce((sum, row) => sum + (row.didCount ?? 0), 0),
    };
  }, [rows]);

  return (
    <div className="settings-portal">
      <Card className="settings-portal__head">
        <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start" wrap>
          <div>
            <Space align="center">
              <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
                지사 설정
              </Typography.Title>
              <FeatureHelpButton featureKey="branch.inboundPolicy" featureName="지사별 착신 정책" />
            </Space>
            <div className="settings-portal__state-line">
              <span>검증 대기</span>
              <span>적용 준비</span>
              <span>운영 기준: 지점</span>
            </div>
          </div>
          <Space wrap>
            <Button disabled>검증</Button>
            <Button disabled>적용</Button>
            {canCreate ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                지사 등록
              </Button>
            ) : null}
          </Space>
        </Space>
        <div className="settings-portal__summary">
          <div><span>지사</span><strong>{summary.branches}</strong></div>
          <div><span>활성</span><strong>{summary.activeBranches}</strong></div>
          <div><span>상담원</span><strong>{summary.agents}</strong></div>
          <div><span>큐</span><strong>{summary.queues}</strong></div>
          <div><span>DID</span><strong>{summary.dids}</strong></div>
        </div>
      </Card>

      <Card className="settings-portal__body">
        {!rows ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : (
          <ResponsiveTable<BranchRow>
            rowKey="branchId"
            dataSource={rows}
            pagination={false}
            scroll={{ x: 1320 }}
            columns={[
          { title: headerLabel('지사 코드'), dataIndex: 'branchCode', width: 140 },
          { title: headerLabel('지사명'), dataIndex: 'branchName', width: 180 },
          {
            title: headerLabel('설명'),
            dataIndex: 'description',
            width: 240,
            render: (value?: string | null) => value || '-',
          },
          {
            title: headerLabel('상태'),
            dataIndex: 'isActive',
            width: 100,
            render: (value: boolean) => (
              <Tag color={value ? 'success' : 'error'}>{value ? '활성' : '비활성'}</Tag>
            ),
          },
          {
            title: headerLabel('사용 기능'),
            width: 260,
            render: (_: unknown, row: BranchRow) => {
              const enabledItems = (row.settingsSummary ?? []).filter((item) => item.enabled);
              return enabledItems.length > 0 ? (
                <Space size={[4, 4]} wrap>
                  {enabledItems.map((item) => (
                    <Tag key={item.key} color="processing">
                      {item.label}
                    </Tag>
                  ))}
                </Space>
              ) : (
                <Typography.Text type="secondary">미설정</Typography.Text>
              );
            },
          },
          {
            title: headerLabel('상담원'),
            dataIndex: 'agentCount',
            width: 90,
          },
          {
            title: headerLabel('큐'),
            dataIndex: 'queueCount',
            width: 80,
          },
          {
            title: headerLabel('DID'),
            dataIndex: 'didCount',
            width: 80,
          },
          {
            title: headerLabel('관리'),
            width: 200,
            fixed: 'right',
            render: (_: unknown, row: BranchRow) => (
              <Space>
                {canUpdate ? (
                  <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(row)}>
                    설정
                  </Button>
                ) : null}
                {canUpdate ? (
                  <Button
                    size="small"
                    icon={<PhoneOutlined />}
                    onClick={() => setCidAuthBranch(row)}
                  >
                    발신권한
                  </Button>
                ) : null}
                {canDelete ? (
                  <Popconfirm title="지사를 삭제하시겠습니까?" onConfirm={() => void remove(row.branchId)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                ) : null}
              </Space>
            ),
          },
            ]}
          />
        )}
      </Card>

      <BranchEditModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => void load()}
      />
      <BranchEditModal
        open={!!editing}
        branch={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void load()}
      />
      <BranchAgentCidAuthDrawer
        open={!!cidAuthBranch}
        branchId={cidAuthBranch?.branchId ?? null}
        branchName={cidAuthBranch?.branchName}
        onClose={() => setCidAuthBranch(null)}
      />
    </div>
  );
}
