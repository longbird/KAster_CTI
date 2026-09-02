import { ReloadOutlined, RightOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Space, Tag, Typography, message } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveTable } from '../components/ResponsiveTable';
import { listPlatformTenants } from './api/platformTenantsApi';
import { serverErrorMessage } from './lib/serverError';
import type { PlatformTenantRow } from './types/platform';

export function PlatformTenantsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PlatformTenantRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listPlatformTenants());
    } catch (error) {
      console.error(error);
      message.error(serverErrorMessage(error, '테넌트 목록을 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = [
    { title: '테넌트명', dataIndex: 'tenantName', key: 'tenantName' },
    {
      title: '코드',
      dataIndex: 'tenantCode',
      key: 'tenantCode',
      render: (code: string) => <Typography.Text code>{code}</Typography.Text>,
    },
    {
      title: '상태',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      render: (isActive: boolean) => (isActive ? <Tag color="success">활성</Tag> : <Tag>비활성</Tag>),
    },
    {
      title: '관리',
      key: 'actions',
      width: 140,
      fixed: 'right' as const,
      render: (_: unknown, row: PlatformTenantRow) => (
        <Button size="small" icon={<RightOutlined />} onClick={() => navigate(`/platform/tenants/${row.tenantId}`)}>
          기능 자격
        </Button>
      ),
    },
  ];

  return (
    <Card
      title="테넌트"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
            새로고침
          </Button>
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="테넌트별로 어떤 기능을 쓸 수 있는지 정합니다."
        description="플랫폼 관리자는 테넌트의 통화·고객·녹취 데이터를 볼 수 없습니다. 여기서 하는 일은 기능 자격을 켜고 끄는 것뿐입니다."
      />

      <ResponsiveTable<PlatformTenantRow>
        rowKey="tenantId"
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={false}
        size="middle"
      />
    </Card>
  );
}
