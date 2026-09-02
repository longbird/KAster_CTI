import { Button, Drawer, Form, Space, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { getCustomerDetail, getCustomerHistory, updateCustomer } from './api/customersApi';
import type { CustomerDetail, CustomerHistoryItem } from './types/customer';
import { buildCustomerFormValues, normalizeCustomerFormValues, type CustomerFormValues } from './CustomerFormFields';
import { CustomerDetailSummary } from './CustomerDetailSummary';
import { ResponsiveTable } from '../../components/ResponsiveTable';

interface Props {
  open: boolean;
  customerId?: string | null;
  onClose: () => void;
  canUpdate?: boolean;
  onSaved?: () => Promise<void> | void;
}

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
      title="고객 상세"
      extra={
        detail ? (
          editing ? (
            <Space>
              <Button
                onClick={() => {
                  form.setFieldsValue(buildCustomerFormValues(detail, detail.grade));
                  setEditing(false);
                }}
              >
                취소
              </Button>
              <Button type="primary" loading={saving} onClick={() => void save()}>
                저장
              </Button>
            </Space>
          ) : canUpdate ? (
            <Button type="primary" onClick={() => setEditing(true)}>
              수정
            </Button>
          ) : null
        ) : null
      }
    >
      {detail ? (
        <>
          <Form form={form} layout="vertical">
            <CustomerDetailSummary detail={detail} editing={editing} />
          </Form>

          <Typography.Title level={5} style={{ marginTop: 20 }}>최근 수/발신 이력</Typography.Title>
          <ResponsiveTable<CustomerHistoryItem>
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
