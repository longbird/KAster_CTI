import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Popconfirm, Space, Tag, Typography, message } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { ResponsiveTable } from '../components/ResponsiveTable';
import {
  createPlatformAdmin,
  listPlatformAdmins,
  setPlatformAdminActive,
} from './api/platformAdminsApi';
import { serverErrorMessage } from './lib/serverError';
import { PlatformAdminCreateModal, type PlatformAdminFormValues } from './PlatformAdminCreateModal';
import { usePlatformAuthStore } from './store/usePlatformAuthStore';
import { formatPlatformDateTime } from './types/entitlementView';
import type { PlatformAdminRow } from './types/platform';

export function PlatformAdminsPage() {
  const currentAdminId = usePlatformAuthStore((state) => state.admin?.platformAdminId);
  const [rows, setRows] = useState<PlatformAdminRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listPlatformAdmins());
    } catch (error) {
      console.error(error);
      message.error(serverErrorMessage(error, '플랫폼 관리자 목록을 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (values: PlatformAdminFormValues) => {
    setSaving(true);
    try {
      await createPlatformAdmin(values);
      message.success('플랫폼 관리자를 등록했습니다.');
      setModalOpen(false);
      await load();
    } catch (error) {
      console.error(error);
      message.error(serverErrorMessage(error, '등록하지 못했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (row: PlatformAdminRow) => {
    try {
      await setPlatformAdminActive(row.platformAdminId, !row.isActive);
      message.success(row.isActive ? '계정을 비활성화했습니다.' : '계정을 활성화했습니다.');
      await load();
    } catch (error) {
      console.error(error);
      message.error(serverErrorMessage(error, '상태를 바꾸지 못했습니다.'));
    }
  };

  const columns = [
    {
      title: '로그인 ID',
      dataIndex: 'loginId',
      key: 'loginId',
      render: (loginId: string, row: PlatformAdminRow) => (
        <Space size={6}>
          <Typography.Text code>{loginId}</Typography.Text>
          {row.platformAdminId === currentAdminId ? <Tag color="processing">본인</Tag> : null}
        </Space>
      ),
    },
    { title: '이름', dataIndex: 'displayName', key: 'displayName' },
    {
      title: '상태',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      render: (isActive: boolean) => (isActive ? <Tag color="success">활성</Tag> : <Tag>비활성</Tag>),
    },
    {
      title: '마지막 로그인',
      dataIndex: 'lastLoginAt',
      key: 'lastLoginAt',
      width: 160,
      render: (lastLoginAt: string | null) => formatPlatformDateTime(lastLoginAt),
    },
    {
      title: '등록',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (createdAt: string) => formatPlatformDateTime(createdAt),
    },
    {
      title: '관리',
      key: 'actions',
      width: 130,
      fixed: 'right' as const,
      render: (_: unknown, row: PlatformAdminRow) => {
        // 본인 계정을 비활성화하면 그 자리에서 플랫폼에 못 들어오게 된다. 화면에서 먼저 막는다.
        const isSelf = row.platformAdminId === currentAdminId;
        return (
          <Popconfirm
            title={row.isActive ? '이 계정을 비활성화할까요?' : '이 계정을 활성화할까요?'}
            okText="확인"
            cancelText="취소"
            disabled={isSelf}
            onConfirm={() => handleToggleActive(row)}
          >
            <Button size="small" danger={row.isActive} disabled={isSelf}>
              {row.isActive ? '비활성화' : '활성화'}
            </Button>
          </Popconfirm>
        );
      },
    },
  ];

  return (
    <Card
      title="플랫폼 관리자"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
            새로고침
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            관리자 등록
          </Button>
        </Space>
      }
    >
      <ResponsiveTable<PlatformAdminRow>
        rowKey="platformAdminId"
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={false}
        size="middle"
      />

      <PlatformAdminCreateModal
        open={modalOpen}
        saving={saving}
        onCancel={() => setModalOpen(false)}
        onSubmit={handleCreate}
      />
    </Card>
  );
}
