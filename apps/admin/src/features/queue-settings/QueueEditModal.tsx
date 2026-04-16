import { Form, Input, InputNumber, Modal, Select, Switch, message } from 'antd';
import { useEffect } from 'react';
import { apiClient } from '../../shared/lib/apiClient';

export interface QueueRow {
  queueId: string;
  queueName: string;
  queueDisplayName?: string;
  strategy?: string;
  maxWaitSeconds?: number;
  ringTimeoutSeconds?: number;
  wrapupSeconds?: number;
  autopause?: boolean;
  isActive?: boolean;
}

interface Props {
  queue: QueueRow | null;
  onClose: () => void;
  onSaved: () => void;
}

const STRATEGY_OPTIONS = [
  { value: 'rrmemory', label: 'Round Robin (Memory)' },
  { value: 'leastrecent', label: 'Least Recent' },
  { value: 'fewestcalls', label: 'Fewest Calls' },
  { value: 'random', label: 'Random' },
  { value: 'linear', label: 'Linear' },
];

export function QueueEditModal({ queue, onClose, onSaved }: Props) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (queue) {
      form.setFieldsValue({
        queueDisplayName: queue.queueDisplayName,
        strategy: queue.strategy,
        maxWaitSeconds: queue.maxWaitSeconds,
        ringTimeoutSeconds: queue.ringTimeoutSeconds,
        wrapupSeconds: queue.wrapupSeconds,
        autopause: queue.autopause,
      });
    } else {
      form.resetFields();
    }
  }, [queue, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    try {
      await apiClient.patch(`/queues/${queue!.queueId}`, values);
      message.success('저장 완료');
      onSaved();
      onClose();
    } catch {
      message.error('저장 실패');
    }
  };

  return (
    <Modal
      title={`큐 설정 수정 - ${queue?.queueDisplayName ?? queue?.queueName ?? ''}`}
      open={!!queue}
      onOk={() => void handleOk()}
      onCancel={onClose}
      okText="저장"
      cancelText="취소"
    >
      <Form form={form} layout="vertical">
        <Form.Item label="표시명" name="queueDisplayName">
          <Input placeholder="없으면 queueName 사용" maxLength={128} />
        </Form.Item>
        <Form.Item label="분배 전략" name="strategy">
          <Select options={STRATEGY_OPTIONS} />
        </Form.Item>
        <Form.Item label="최대 대기시간(초)" name="maxWaitSeconds">
          <InputNumber min={0} max={3600} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="링 타임아웃(초)" name="ringTimeoutSeconds">
          <InputNumber min={5} max={120} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="후처리 시간(초)" name="wrapupSeconds">
          <InputNumber min={0} max={600} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="Auto Pause" name="autopause" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
