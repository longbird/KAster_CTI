import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Popconfirm, Skeleton, Space, Table, Tag, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { usePermissionStore } from '../../store/usePermissionStore';
import { BranchEditModal, type BranchRow } from './BranchEditModal';

export function BranchSettingsPage() {
  const [rows, setRows] = useState<BranchRow[] | null>(null);
  const [editing, setEditing] = useState<BranchRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
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

  if (!rows) return <Skeleton active paragraph={{ rows: 6 }} />;

  return (
    <Card>
      <Space direction="vertical" size={16} style={{ width: '100%', marginBottom: 16 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <div>
            <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 0 }}>
              지사 설정
            </Typography.Title>
            <Typography.Text type="secondary">
              운영 설정의 기준은 지사입니다. 세부 항목 등록은 각 메뉴에서 처리하고, 지사에서는 실제 사용할 기능과 대상을 선택합니다.
            </Typography.Text>
          </div>
          {canCreate ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              지사 등록
            </Button>
          ) : null}
        </Space>
        <Alert
          type="info"
          showIcon
          message="지사 관리가 운영 설정의 시작점입니다. 지사 등록 시 DID 연결과 운영 항목 선택을 한 화면에서 함께 설정하세요."
        />
      </Space>

      <Table<BranchRow>
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
              <Tag color={value ? 'green' : 'red'}>{value ? '활성' : '비활성'}</Tag>
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
                    <Tag key={item.key} color="blue">
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
            title: headerLabel('액션'),
            width: 250,
            render: (_: unknown, row: BranchRow) => (
              <Space>
                {canUpdate ? (
                  <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(row)}>
                    설정
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
    </Card>
  );
}
