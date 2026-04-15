import { Card, Col, Row, Statistic, Tag } from 'antd';
import type { KpiItem } from '../types/dashboard';

export function KpiCards({ items }: { items: KpiItem[] }) {
  return (
    <Row gutter={[16, 16]}>
      {items.map((item) => (
        <Col xs={24} sm={12} xl={8} xxl={4} key={item.key}>
          <Card>
            <Statistic title={item.label} value={item.value} />
            <Tag color={item.trend === 'up' ? 'blue' : item.trend === 'down' ? 'green' : 'default'} style={{ marginTop: 12 }}>
              {item.delta}
            </Tag>
          </Card>
        </Col>
      ))}
    </Row>
  );
}
