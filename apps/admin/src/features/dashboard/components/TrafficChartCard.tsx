import { Card, Space, Typography } from 'antd';
import type { HourlyTrafficItem } from '../types/dashboard';

function maxValue(items: HourlyTrafficItem[]) {
  return Math.max(1, ...items.flatMap((item) => [item.inbound, item.answered, item.abandoned]));
}

export function TrafficChartCard({ items, compact = false }: { items: HourlyTrafficItem[]; compact?: boolean }) {
  const max = maxValue(items);

  if (compact) {
    return (
      <Card
        title="시간대별 유입"
        size="small"
        bodyStyle={{ padding: 8 }}
        style={{ height: '100%' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80 }}>
          {items.map((item) => (
            <div
              key={item.hour}
              title={`${item.hour} · in ${item.inbound} / ans ${item.answered} / abd ${item.abandoned}`}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column-reverse',
                gap: 1,
                minWidth: 4,
              }}
            >
              <div style={{ height: `${(item.answered / max) * 70}px`, background: '#1677ff', borderRadius: '1px 1px 0 0' }} />
              <div style={{ height: `${(item.abandoned / max) * 70}px`, background: '#ff4d4f' }} />
            </div>
          ))}
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 10, marginTop: 4, display: 'block' }}>
          응답 / 포기 (시간당)
        </Typography.Text>
      </Card>
    );
  }

  return (
    <Card title="시간대별 유입량" extra={<Typography.Text type="secondary">inbound / answered / abandoned</Typography.Text>}>
      <div className="traffic-chart">
        {items.map((item) => (
          <div className="traffic-row" key={item.hour}>
            <div className="traffic-hour">{item.hour}</div>
            <div className="traffic-bars">
              <div className="traffic-bar inbound" style={{ width: `${(item.inbound / max) * 100}%` }} />
              <div className="traffic-bar answered" style={{ width: `${(item.answered / max) * 100}%` }} />
              <div className="traffic-bar abandoned" style={{ width: `${(item.abandoned / max) * 100}%` }} />
            </div>
            <Space size="small">
              <Typography.Text>{item.inbound}</Typography.Text>
              <Typography.Text type="secondary">/ {item.answered}</Typography.Text>
              <Typography.Text type="danger">/ {item.abandoned}</Typography.Text>
            </Space>
          </div>
        ))}
      </div>
    </Card>
  );
}
