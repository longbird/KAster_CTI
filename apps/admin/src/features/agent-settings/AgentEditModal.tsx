import { Form, Input, Modal, message } from 'antd';
import { useEffect } from 'react';
import { apiClient } from '../../shared/lib/apiClient';

export interface AgentRow {
  agentId: string;
  agentName: string;
  loginId: string;
  extension: string;
  role: string;
  currentStatus: { statusCode: string } | null;
}

interface Props {
  agent: AgentRow | null;
  onClose: () => void;
  onSaved: () => void;
}

export function AgentEditModal({ agent, onClose, onSaved }: Props) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (agent) form.setFieldsValue({ agentName: agent.agentName, extension: agent.extension });
    else form.resetFields();
  }, [agent, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    try {
      await apiClient.patch(`/agents/${agent!.agentId}`, values);
      message.success('저장 완료');
      onSaved();
      onClose();
    } catch {
      message.error('저장 실패');
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
    >
      <Form form={form} layout="vertical">
        <Form.Item label="이름" name="agentName" rules={[{ required: true, max: 128 }]}>
          <Input />
        </Form.Item>
        <Form.Item label="내선번호" name="extension" rules={[{ required: true, max: 16 }]}>
          <Input />
        </Form.Item>
      </Form>
    </Modal>
  );
}
