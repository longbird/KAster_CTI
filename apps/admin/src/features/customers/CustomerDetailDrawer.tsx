import { Button, Descriptions, Drawer, Form, Space, Table, Tag, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { getCustomerDetail, getCustomerHistory, updateCustomer } from './api/customersApi';
import type { CustomerDetail, CustomerHistoryItem } from './types/customer';
import { buildCustomerFormValues, CustomerFormFields, normalizeCustomerFormValues, type CustomerFormValues } from './CustomerFormFields';
import { formatCustomerListDate, formatCustomerPhoneDisplay } from './customerDisplay';

interface Props {
  open: boolean;
  customerId?: string | null;
  onClose: () => void;
  canUpdate?: boolean;
  onSaved?: () => Promise<void> | void;
}

const GRADE_COLOR: Record<string, string> = {
  NORMAL: 'default',
  VIP: 'gold',
  BLACK: 'red',
};

export function CustomerDetailDrawer({ open, customerId, onClose, canUpdate = true, onSaved }: Props) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [history, setHistory] = useState<CustomerHistoryItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<CustomerFormValues>();

  const loadDetail = async () => {
    if (!customerId) return;
    const [nextDetail, nextHistory] = await Promise.all([getCustomerDetail(customerId), getCustomerHistory(customerId)]);
    setDetail(nextDetail);
    setHistory(nextHistory);
    form.setFieldsValue(buildCustomerFormValues(nextDetail, nextDetail.grade));
  };

  useEffect(() => {
    if (!open || !customerId) return;
    setEditing(false);
    void loadDetail();
  }, [customerId, open]);

  const save = async () => {
    if (!customerId) return;
    setSaving(true);
    try {
      const values = await form.validateFields();
      await updateCustomer(customerId, normalizeCustomerFormValues(values));
      message.success('고객 정보를 수정했습니다.');
      await loadDetail();
      await onSaved?.();
      setEditing(false);
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.response?.data?.error?.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={760}
      title={editing ? '고객 수정' : '고객 상세'}
      extra={
        detail && canUpdate && !editing ? (
          <Button type="primary" onClick={() => setEditing(true)}>
            수정
          </Button>
        ) : null
      }
    >
      {detail ? (
        editing ? (
          <>
            <Form form={form} layout="vertical">
              <CustomerFormFields />
            </Form>
            <Space>
              <Button onClick={() => { form.setFieldsValue(buildCustomerFormValues(detail, detail.grade)); setEditing(false); }}>
                취소
              </Button>
              <Button type="primary" loading={saving} onClick={() => void save()}>
                저장
              </Button>
            </Space>
          </>
        ) : (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="성명">{detail.customerName ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="등급">
                <Tag color={GRADE_COLOR[detail.grade] ?? 'default'}>{detail.grade}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="대표 전화번호">{formatCustomerPhoneDisplay(detail.primaryPhoneNumber)}</Descriptions.Item>
              <Descriptions.Item label="추가 전화번호">
                {(detail.extraPhoneNumbers ?? []).length > 0 ? detail.extraPhoneNumbers?.map((phone) => formatCustomerPhoneDisplay(phone)).join(', ') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="기본 메모">{detail.memo ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="최종 통화일">{formatCustomerListDate(detail.lastCalledAt)}</Descriptions.Item>
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
        )
      ) : null}
    </Drawer>
  );
}
