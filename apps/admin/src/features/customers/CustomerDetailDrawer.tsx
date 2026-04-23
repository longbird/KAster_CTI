import { Descriptions, Drawer, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { getCustomerDetail, getCustomerHistory } from './api/customersApi';
import type { CustomerDetail, CustomerHistoryItem } from './types/customer';

interface Props {
  open: boolean;
  customerId?: string | null;
  onClose: () => void;
}

const GRADE_COLOR: Record<string, string> = {
  NORMAL: 'default',
  VIP: 'gold',
  BLACK: 'red',
};

export function CustomerDetailDrawer({ open, customerId, onClose }: Props) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [history, setHistory] = useState<CustomerHistoryItem[]>([]);

  useEffect(() => {
    if (!open || !customerId) return;
    void Promise.all([getCustomerDetail(customerId), getCustomerHistory(customerId)]).then(([nextDetail, nextHistory]) => {
      setDetail(nextDetail);
      setHistory(nextHistory);
    });
  }, [customerId, open]);

  return (
    <Drawer open={open} onClose={onClose} width={760} title="고객 상세">
      {detail ? (
        <>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="성명">{detail.customerName ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="등급">
              <Tag color={GRADE_COLOR[detail.grade] ?? 'default'}>{detail.grade}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="대표 전화번호">{detail.primaryPhoneNumber ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="추가 전화번호">
              {(detail.extraPhoneNumbers ?? []).length > 0 ? detail.extraPhoneNumbers?.join(', ') : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="기본 메모">{detail.memo ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="최종 통화일">
              {detail.lastCalledAt ? new Date(detail.lastCalledAt).toLocaleString('ko-KR') : '-'}
            </Descriptions.Item>
          </Descriptions>

          <Typography.Title level={5} style={{ marginTop: 20 }}>최근 수/발신 이력</Typography.Title>
          <Table<CustomerHistoryItem>
            rowKey="callId"
            size="small"
            pagination={false}
            dataSource={history}
            columns={[
              { title: '일시', dataIndex: 'startedAt', render: (value: string) => new Date(value).toLocaleString('ko-KR') },
              { title: '방향', dataIndex: 'direction', render: (value: string) => (value === 'outbound' ? '발신' : '수신') },
              { title: '상태', dataIndex: 'sessionStatus' },
              { title: '분배룰', dataIndex: 'queueName', render: (value?: string | null) => value ?? '-' },
              { title: '상담원', render: (_: unknown, row) => row.primaryAgent?.agentName ?? '-' },
              { title: '통화(초)', dataIndex: 'talkSeconds', width: 90 },
            ]}
          />
        </>
      ) : null}
    </Drawer>
  );
}
