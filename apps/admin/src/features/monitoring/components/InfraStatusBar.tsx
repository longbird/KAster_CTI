// apps/admin/src/features/monitoring/components/InfraStatusBar.tsx
import { Badge, Card, Space, Typography } from 'antd';
import dayjs from 'dayjs';
import { useHealthData } from '../hooks/useHealthData';
import type { HealthChecks } from '../types/health';

type CheckValue = HealthChecks[keyof HealthChecks];

function toStatus(value: CheckValue): 'success' | 'warning' | 'error' | 'default' {
  if (value === 'up' || value === 'connected') return 'success';
  if (value === 'degraded') return 'warning';
  if (value === 'down' || value === 'disconnected') return 'error';
  return 'default';
}

export function InfraStatusBar() {
  const { data, lastUpdated, isLoading, error } = useHealthData({ intervalMs: 30_000 });

  if (isLoading && !data) {
    return (
      <Card size="small">
        <Typography.Text type="secondary">...</Typography.Text>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card size="small">
        <Space>
          <Badge status="default" />
          <Typography.Text type="danger">연결 불가 — {error}</Typography.Text>
        </Space>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card size="small">
      <Space size="large" wrap>
        <Space>
          <Badge status={toStatus(data.checks.db)} />
          <Typography.Text>DB: <strong>{data.checks.db}</strong></Typography.Text>
        </Space>
        <Space>
          <Badge status={toStatus(data.checks.redis)} />
          <Typography.Text>Redis: <strong>{data.checks.redis}</strong></Typography.Text>
        </Space>
        <Space>
          <Badge status={toStatus(data.checks.ami)} />
          <Typography.Text>AMI: <strong>{data.checks.ami}</strong></Typography.Text>
        </Space>
        {lastUpdated && (
          <Typography.Text type="secondary">
            마지막 갱신: {dayjs(lastUpdated).format('HH:mm:ss')}
          </Typography.Text>
        )}
      </Space>
    </Card>
  );
}
