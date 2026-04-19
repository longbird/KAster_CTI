import { Form, Input, InputNumber, Modal, Select, Switch, message } from 'antd';
import { apiClient } from '../../shared/lib/apiClient';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const STRATEGY_OPTIONS = [
  { value: 'rrmemory', label: 'Round Robin (Memory)' },
  { value: 'leastrecent', label: 'Least Recent' },
  { value: 'fewestcalls', label: 'Fewest Calls' },
  { value: 'random', label: 'Random' },
  { value: 'linear', label: 'Linear' },
];

export function QueueCreateModal({ open, onClose, onCreated }: Props) {
  const [form] = Form.useForm();

  const handleOk = async () => {
    const values = await form.validateFields();
    try {
      await apiClient.post('/queues', values);
      message.success('호 분배룰 생성 완료');
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
      title="신규 호 분배룰 생성"
      open={open}
      onOk={() => void handleOk()}
      onCancel={onClose}
      okText="생성"
      cancelText="취소"
      width={480}
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          label="Rule 내부명 (PBX)"
          name="queueName"
          rules={[
            { required: true, max: 64 },
            { pattern: /^[a-z0-9-]+$/, message: '영소문자·숫자·하이픈만 허용' },
          ]}
          extra="PBX queues.conf에 그대로 사용되는 내부 식별자입니다. 예: sales-queue"
        >
          <Input placeholder="sales-queue" />
        </Form.Item>
        <Form.Item
          label="Rule 내선번호"
          name="queueExten"
          rules={[
            { required: true, max: 16 },
            { pattern: /^\d+$/, message: '숫자만 허용' },
          ]}
        >
          <Input placeholder="9001" />
        </Form.Item>
        <Form.Item label="Rule명" name="queueDisplayName" rules={[{ required: true, max: 128 }]}>
          <Input placeholder="영업 대표 큐" />
        </Form.Item>
        <Form.Item label="분배 전략" name="strategy" initialValue="leastrecent">
          <Select options={STRATEGY_OPTIONS} />
        </Form.Item>
        <Form.Item label="링 타임아웃(초)" name="ringTimeoutSeconds" initialValue={15}>
          <InputNumber min={5} max={120} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="후처리 시간(초)" name="wrapupSeconds" initialValue={30}>
          <InputNumber min={0} max={600} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="최대 대기시간(초)" name="maxWaitSeconds" initialValue={45}>
          <InputNumber min={0} max={3600} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="Auto Pause" name="autopause" valuePropName="checked" initialValue={true}>
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
