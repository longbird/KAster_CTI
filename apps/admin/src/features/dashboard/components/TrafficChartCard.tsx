import { Card, Space, Typography } from 'antd';
import type { HourlyTrafficItem } from '../types/dashboard';

function maxValue(items: HourlyTrafficItem[]) {
  return Math.max(...items.flatMap((item) => [item.inbound, item.answered, item.abandoned]));
}

export function TrafficChartCard({ items }: { items: HourlyTrafficItem[] }) {
  const max = maxValue(items);

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
