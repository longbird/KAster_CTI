import { Alert, Card, Space, Tag, Typography } from 'antd';
import type { AlertItem } from '../types/dashboard';

const LEVEL_COLOR: Record<AlertItem['level'], string> = {
  info: 'blue',
  warning: 'gold',
  error: 'red',
};

const LEVEL_SHORT: Record<AlertItem['level'], string> = {
  info: 'INFO',
  warning: 'WARN',
  error: 'CRIT',
};

export function AlertsPanel({ items, compact = false }: { items: AlertItem[]; compact?: boolean }) {
  if (compact) {
    return (
      <Card
        title={`⚠ 경보 (${items.length})`}
        size="small"
        bodyStyle={{ padding: 8, overflowY: 'auto', maxHeight: 200 }}
        style={{ height: '100%' }}
      >
        {items.length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>활성 경보 없음</Typography.Text>
        ) : (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{ display: 'flex', gap: 6, alignItems: 'baseline', fontSize: 11.5, lineHeight: 1.3 }}
              >
                <Tag color={LEVEL_COLOR[item.level]} style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                  {LEVEL_SHORT[item.level]}
                </Tag>
                <span style={{ flex: 1 }}>{item.message}</span>
                <Typography.Text type="secondary" style={{ fontSize: 10 }}>{item.time}</Typography.Text>
              </div>
            ))}
          </Space>
        )}
      </Card>
    );
  }

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
