import { Form, Input, Modal, Select, Switch, message } from 'antd';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';

export interface AgentRow {
  agentId: string;
  agentName: string;
  loginId: string;
  agentCode: string;
  extension: string;
  role: string;
  defaultQueueId?: string | null;
  isActive: boolean;
  currentStatus: { statusCode: string } | null;
}

interface QueueOption {
  queueId: string;
  queueName: string;
  queueDisplayName?: string;
  isActive?: boolean;
}

interface Props {
  agent: AgentRow | null;
  onClose: () => void;
  onSaved: () => void;
}

const ROLE_OPTIONS = [
  { value: 'agent', label: 'Agent' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'admin', label: 'Admin' },
];

export function AgentEditModal({ agent, onClose, onSaved }: Props) {
  const [form] = Form.useForm();
  const [queues, setQueues] = useState<QueueOption[]>([]);

  useEffect(() => {
    if (!agent) {
      form.resetFields();
      return;
    }

    form.setFieldsValue({
      agentName: agent.agentName,
      extension: agent.extension,
      role: agent.role,
      defaultQueueId: agent.defaultQueueId ?? undefined,
      isActive: agent.isActive,
    });

    void apiClient
      .get('/queues')
      .then((res) => setQueues((res.data?.data ?? []).filter((q: QueueOption) => q.isActive !== false)))
      .catch(() => setQueues([]));
  }, [agent, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    try {
      await apiClient.patch(`/agents/${agent!.agentId}`, values);
      message.success('저장 완료');
      onSaved();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? '저장 실패';
      message.error(msg);
    }
  };

  return (
    <Modal
      title={`상담원 정보 수정 - ${agent?.agentName ?? ''}`}
      open={!!agent}
      onOk={() => void handleOk()}
      onCancel={onClose}
      okText="저장"
      cancelText="취소"
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item label="이름" name="agentName" rules={[{ required: true, max: 128 }]}>
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
        <Form.Item label="역할" name="role" rules={[{ required: true }]}>
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
        <Form.Item label="활성 여부" name="isActive" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
