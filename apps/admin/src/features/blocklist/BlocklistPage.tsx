import { DeleteOutlined, EditOutlined, PlusOutlined, StopOutlined } from '@ant-design/icons';
import { Button, Card, Popconfirm, Skeleton, Space, Table, Tag, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { usePermissionStore } from '../../store/usePermissionStore';
import {
  createBlocklistEntry,
  deleteBlocklistEntry,
  getBlocklistEntries,
  updateBlocklistEntry,
} from '../asterisk-config/api/asteriskConfigApi';
import type { AsteriskBlocklistEntry } from '../asterisk-config/types/asterisk-config';
import { BlocklistEntryModal, type BlocklistEntryFormValue } from './BlocklistEntryModal';

export function BlocklistPage() {
  const blocklistPermission = usePermissionStore((state) => state.permissionsByMenu['blocklist']);
  const [rows, setRows] = useState<AsteriskBlocklistEntry[] | null>(null);
  const [editing, setEditing] = useState<AsteriskBlocklistEntry | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = async () => {
    try {
      setRows(await getBlocklistEntries());
    } catch {
      setRows([]);
      message.error('수신거부 목록을 불러오지 못했습니다.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (values: BlocklistEntryFormValue) => {
    try {
      if (editing) {
        await updateBlocklistEntry(editing.id, values);
        message.success('수신거부 번호를 수정했습니다.');
      } else {
        await createBlocklistEntry(values);
        message.success('수신거부 번호를 등록했습니다.');
      }
      setEditing(null);
      setCreateOpen(false);
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '저장에 실패했습니다.');
      throw error;
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteBlocklistEntry(id);
      message.success('수신거부 번호를 삭제했습니다.');
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '삭제에 실패했습니다.');
    }
  };

  if (!rows) return <Skeleton active paragraph={{ rows: 6 }} />;

  return (
    <Card>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <div>
          <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 0 }}>
            080 수신거부 관리
          </Typography.Title>
          <Typography.Text type="secondary">
            등록된 ANI는 inbound dialplan에서 먼저 검사되며, 일치하면 안내 멘트 후 통화가 종료됩니다.
          </Typography.Text>
        </div>
        {blocklistPermission?.canCreate !== false ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            번호 등록
          </Button>
        ) : null}
      </Space>

      <Table<AsteriskBlocklistEntry>
        rowKey="id"
        dataSource={rows}
        pagination={false}
        columns={[
          {
            title: '전화번호',
            dataIndex: 'phoneNumber',
            width: 180,
            render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
          },
          {
            title: '사유',
            dataIndex: 'description',
            render: (value?: string | null) => value || '-',
          },
          {
            title: '상태',
            dataIndex: 'isActive',
            width: 100,
            render: (value: boolean) => (
              <Tag color={value ? 'red' : 'default'}>{value ? '차단중' : '비활성'}</Tag>
            ),
          },
          {
            title: '등록일',
            dataIndex: 'createdAt',
            width: 160,
            render: (value?: string) => value ? new Date(value).toLocaleString('ko-KR') : '-',
          },
          {
            title: '액션',
            width: 180,
            render: (_: unknown, row) => (
              <Space>
                {blocklistPermission?.canUpdate !== false ? (
                  <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(row)}>
                    수정
                  </Button>
                ) : null}
                {blocklistPermission?.canDelete !== false ? (
                  <Popconfirm title="수신거부 번호를 삭제하시겠습니까?" onConfirm={() => void remove(row.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                ) : null}
              </Space>
            ),
          },
        ]}
      />

      <div style={{ marginTop: 16 }}>
        <Space>
          <StopOutlined />
          <Typography.Text type="secondary">
            현재 1차 범위는 번호 exact match 차단입니다. 패턴 차단과 차단 이력 집계는 후속 범위입니다.
          </Typography.Text>
        </Space>
      </div>

      {blocklistPermission?.canCreate !== false ? (
        <BlocklistEntryModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSave={save}
        />
      ) : null}
      {blocklistPermission?.canUpdate !== false ? (
        <BlocklistEntryModal
          open={!!editing}
          entry={editing}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
    </Card>
  );
}
