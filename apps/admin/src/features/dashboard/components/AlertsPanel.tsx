import { Alert, Card, Space, Typography } from 'antd';
import type { AlertItem } from '../types/dashboard';

export function AlertsPanel({ items }: { items: AlertItem[] }) {
  return (
    <Card title="시스템 경보">
      <Space direction="vertical" style={{ width: '100%' }}>
        {items.map((item) => (
          <Alert
            key={item.id}
            type={item.level === 'error' ? 'error' : item.level === 'warning' ? 'warning' : 'info'}
            message={item.message}
            description={<Typography.Text type="secondary">{item.time}</Typography.Text>}
            showIcon
          />
        ))}
      </Space>
    </Card>
  );
}
