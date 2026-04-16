import { ApartmentOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, Popconfirm, Skeleton, Space, Table, Tag, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { BranchEditModal, type BranchRow } from './BranchEditModal';
import { BranchMappingsModal } from './BranchMappingsModal';

export function BranchSettingsPage() {
  const [rows, setRows] = useState<BranchRow[] | null>(null);
  const [editing, setEditing] = useState<BranchRow | null>(null);
  const [mappingBranch, setMappingBranch] = useState<BranchRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

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

  if (!rows) return <Skeleton active paragraph={{ rows: 6 }} />;

  return (
    <Card>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 0 }}>
          지사 설정
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          지사 등록
        </Button>
      </Space>

      <Table<BranchRow>
        rowKey="branchId"
        dataSource={rows}
        pagination={false}
        columns={[
          { title: '지사 코드', dataIndex: 'branchCode', width: 160 },
          { title: '지사명', dataIndex: 'branchName', width: 240 },
          {
            title: '설명',
            dataIndex: 'description',
            render: (value?: string | null) => value || '-',
          },
          {
            title: '상태',
            dataIndex: 'isActive',
            width: 90,
            render: (value: boolean) => (
              <Tag color={value ? 'green' : 'red'}>{value ? '활성' : '비활성'}</Tag>
            ),
          },
          {
            title: '상담원',
            dataIndex: 'agentCount',
            width: 90,
          },
          {
            title: '큐',
            dataIndex: 'queueCount',
            width: 80,
          },
          {
            title: 'DID',
            dataIndex: 'didCount',
            width: 80,
          },
          {
            title: '액션',
            width: 220,
            render: (_: unknown, row: BranchRow) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(row)}>
                  수정
                </Button>
                <Button size="small" icon={<ApartmentOutlined />} onClick={() => setMappingBranch(row)}>
                  매핑
                </Button>
                <Popconfirm title="지사를 삭제하시겠습니까?" onConfirm={() => void remove(row.branchId)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
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
      <BranchMappingsModal
        open={!!mappingBranch}
        branch={mappingBranch}
        onClose={() => setMappingBranch(null)}
        onSaved={() => void load()}
      />
    </Card>
  );
}
