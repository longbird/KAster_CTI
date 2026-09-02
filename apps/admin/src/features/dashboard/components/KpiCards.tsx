import { Card, Col, Row, Statistic, Tag } from 'antd';
import type { KpiItem } from '../types/dashboard';

export function KpiCards({ items, compact = false }: { items: KpiItem[]; compact?: boolean }) {
  if (compact) {
    return (
      <div className="dashboard-compact__kpi-strip">
        {items.map((item) => (
          <div key={item.key} className="dashboard-compact__kpi-cell">
            <div className="label">{item.label}</div>
            <div className="value">{item.value}</div>
            <div
              className="delta"
              style={{
                color:
                  item.trend === 'up' ? 'var(--accent-info)' :
                  item.trend === 'down' ? 'var(--signal)' : 'var(--fg-3)',
              }}
            >
              {item.delta}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Row gutter={[16, 16]}>
      {items.map((item) => (
        <Col xs={24} sm={12} xl={8} xxl={4} key={item.key}>
          <Card>
            <Statistic title={item.label} value={item.value} />
            <Tag color={item.trend === 'up' ? 'processing' : item.trend === 'down' ? 'success' : 'default'} style={{ marginTop: 12 }}>
              {item.delta}
            </Tag>
          </Card>
        </Col>
      ))}
    </Row>
  );
}
