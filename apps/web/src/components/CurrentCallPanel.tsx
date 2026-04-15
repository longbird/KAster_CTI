import { Badge, Card, Descriptions, Empty, List, Tag, Typography } from 'antd';
import type { ActiveCall } from '../types/cti';
import { formatDateTime } from '../utils/format';

interface CurrentCallPanelProps {
  call?: ActiveCall;
  onSelectCall?: () => void;
}

const statusColor: Record<string, string> = {
  NEW: 'default',
  IVR: 'gold',
  QUEUED: 'orange',
  RINGING_AGENT: 'cyan',
  TALKING: 'blue',
  HOLD: 'purple',
  TRANSFERRING: 'magenta',
  AFTER_CALL_WORK: 'green',
  ENDED: 'default',
};

export function CurrentCallPanel({ call }: CurrentCallPanelProps) {
  if (!call) {
    return (
      <Card title="현재 통화" className="shadow-panel">
        <Empty description="선택된 활성 콜이 없습니다." />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card
        title="현재 통화 카드"
        extra={<Tag color={statusColor[call.sessionStatus]}>{call.sessionStatus}</Tag>}
        className="shadow-panel"
      >
        <Descriptions column={2} size="small">
          <Descriptions.Item label="콜 ID">{call.callId}</Descriptions.Item>
          <Descriptions.Item label="Linkedid">{call.linkedid}</Descriptions.Item>
          <Descriptions.Item label="발신 번호">{call.ani}</Descriptions.Item>
          <Descriptions.Item label="대표 번호">{call.dnis}</Descriptions.Item>
          <Descriptions.Item label="Queue">{call.queueName}</Descriptions.Item>
          <Descriptions.Item label="시작 시각">{formatDateTime(call.startedAt)}</Descriptions.Item>
          <Descriptions.Item label="응답 시각">{formatDateTime(call.answeredAt)}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="고객 정보 / 주문 이력 요약" className="shadow-panel">
        {call.customer ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge status="processing" />
              <Typography.Title level={5} className="!mb-0">
                {call.customer.customerName}
              </Typography.Title>
              <Tag color={call.customer.grade === 'VIP' ? 'gold' : call.customer.grade === 'GOLD' ? 'green' : 'default'}>
                {call.customer.grade}
              </Tag>
            </div>
            <Descriptions column={2} size="small">
              <Descriptions.Item label="전화번호">{call.customer.phoneNumber}</Descriptions.Item>
              <Descriptions.Item label="회사명">{call.customer.companyName ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="고객 메모" span={2}>
                {call.customer.memo ?? '-'}
              </Descriptions.Item>
            </Descriptions>
            <List
              size="small"
              bordered
              header="최근 주문"
              dataSource={call.customer.recentOrders ?? []}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          </div>
        ) : (
          <Empty description="고객 팝업 대기 중" />
        )}
      </Card>
    </div>
  );
}
