import { Form, Input, Modal, Select, message } from 'antd';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';

interface QueueOption {
  queueId: string;
  queueName: string;
  queueDisplayName?: string;
  isActive?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const ROLE_OPTIONS = [
  { value: 'agent', label: 'Agent' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'admin', label: 'Admin' },
];

export function AgentCreateModal({ open, onClose, onCreated }: Props) {
  const [form] = Form.useForm();
  const [queues, setQueues] = useState<QueueOption[]>([]);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      return;
    }

    void apiClient
      .get('/queues')
      .then((res) => setQueues((res.data?.data ?? []).filter((q: QueueOption) => q.isActive !== false)))
      .catch(() => setQueues([]));
  }, [form, open]);

  const handleOk = async () => {
    const values = await form.validateFields();
    try {
      await apiClient.post('/agents', values);
      message.success('상담원 생성 완료');
      form.resetFields();
      onCreated();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? '생성 실패';
      message.error(msg);
    }
  };

  return (
    <Modal
      title="신규 상담원 등록"
      open={open}
      onOk={() => void handleOk()}
      onCancel={onClose}
      okText="생성"
      cancelText="취소"
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false} initialValues={{ role: 'agent' }}>
        <Form.Item label="이름" name="agentName" rules={[{ required: true, max: 128 }]}>
          <Input />
        </Form.Item>
        <Form.Item label="로그인 ID" name="loginId" rules={[{ required: true, max: 64 }]}>
          <Input />
        </Form.Item>
        <Form.Item label="사번/코드" name="agentCode" rules={[{ required: true, max: 32 }]}>
          <Input />
        </Form.Item>
        <Form.Item
          label="내선번호"
          name="extension"
          rules={[
            { required: true, max: 16 },
            { pattern: /^\d+$/, message: '숫자만 허용' },
          ]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          label="초기 비밀번호"
          name="password"
          rules={[{ required: true, min: 8, max: 64 }]}
        >
          <Input.Password />
        </Form.Item>
        <Form.Item label="역할" name="role">
          <Select options={ROLE_OPTIONS} />
        </Form.Item>
        <Form.Item label="기본 큐" name="defaultQueueId">
          <Select
            allowClear
            options={queues.map((q) => ({
              value: q.queueId,
              label: q.queueDisplayName ?? q.queueName,
            }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
