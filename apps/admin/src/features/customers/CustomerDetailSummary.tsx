import { Descriptions, Form, Input, Select, Tag } from 'antd';
import type { CustomerDetail } from './types/customer';
import { formatCustomerListDate, formatCustomerPhoneDisplay } from './customerDisplay';

interface Props {
  detail: CustomerDetail;
  editing: boolean;
}

const GRADE_COLOR: Record<string, string> = {
  NORMAL: 'default',
  VIP: 'gold',
  BLACK: 'red',
};

export function CustomerDetailSummary({ detail, editing }: Props) {
  const extraPhoneNumbers = detail.extraPhoneNumbers ?? [];

  return (
    <Descriptions column={1} bordered size="small">
      <Descriptions.Item label="성명">
        {editing ? (
          <Form.Item name="customerName" rules={[{ required: true, message: '성명을 입력하세요.' }]} style={{ marginBottom: 0 }}>
            <Input />
          </Form.Item>
        ) : (
          detail.customerName ?? '-'
        )}
      </Descriptions.Item>
      <Descriptions.Item label="등급">
        {editing ? (
          <Form.Item name="grade" style={{ marginBottom: 0 }}>
            <Select
              options={[
                { value: 'NORMAL', label: '일반' },
                { value: 'VIP', label: 'VIP' },
                { value: 'BLACK', label: 'BLACK' },
              ]}
            />
          </Form.Item>
        ) : (
          <Tag color={GRADE_COLOR[detail.grade] ?? 'default'}>{detail.grade}</Tag>
        )}
      </Descriptions.Item>
      <Descriptions.Item label="대표 전화번호">
        {editing ? (
          <Form.Item name="primaryPhoneNumber" rules={[{ required: true, message: '대표 전화번호를 입력하세요.' }]} style={{ marginBottom: 0 }}>
            <Input />
          </Form.Item>
        ) : (
          formatCustomerPhoneDisplay(detail.primaryPhoneNumber)
        )}
      </Descriptions.Item>
      <Descriptions.Item label="추가 전화번호">
        {editing ? (
          <Form.Item name="extraPhoneNumbersText" style={{ marginBottom: 0 }}>
            <Input.TextArea rows={3} placeholder="줄바꿈 또는 쉼표로 구분" />
          </Form.Item>
        ) : (
          extraPhoneNumbers.length > 0 ? extraPhoneNumbers.map((phone) => formatCustomerPhoneDisplay(phone)).join(', ') : '-'
        )}
      </Descriptions.Item>
      <Descriptions.Item label="기본 메모">
        {editing ? (
          <Form.Item name="memo" style={{ marginBottom: 0 }}>
            <Input.TextArea rows={4} />
          </Form.Item>
        ) : (
          detail.memo ?? '-'
        )}
      </Descriptions.Item>
      <Descriptions.Item label="최종 통화일">{formatCustomerListDate(detail.lastCalledAt)}</Descriptions.Item>
    </Descriptions>
  );
}
