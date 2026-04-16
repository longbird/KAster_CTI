import { Form, Input, InputNumber, Modal, Switch } from 'antd';
import { useEffect } from 'react';
import type { AsteriskTrunk } from '../types/asterisk-config';

interface Props {
  open: boolean;
  initial?: AsteriskTrunk | null;
  onOk: (values: Omit<AsteriskTrunk, 'id'>) => void;
  onCancel: () => void;
}

export function TrunkForm({ open, initial, onOk, onCancel }: Props) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) form.setFieldsValue(initial ?? { port: 5060, codecs: 'alaw,ulaw', enabled: true });
  }, [open, initial, form]);

  return (
    <Modal
      title={initial ? '트렁크 수정' : '트렁크 추가'}
      open={open}
      onOk={() => form.validateFields().then(onOk)}
      onCancel={onCancel}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="표시명" rules={[{ required: true }]}>
          <Input placeholder="KT 회선 1" />
        </Form.Item>
        <Form.Item name="host" label="Host (IP/도메인)" rules={[{ required: true }]}>
          <Input placeholder="sip.provider.com" />
        </Form.Item>
        <Form.Item name="port" label="포트">
          <InputNumber min={1} max={65535} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="username" label="사용자명 (Trunk ID)" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="password" label="패스워드" rules={[{ required: true }]}>
          <Input.Password />
        </Form.Item>
        <Form.Item name="fromDomain" label="From Domain" rules={[{ required: true }]}>
          <Input placeholder="sip.provider.com" />
        </Form.Item>
        <Form.Item name="codecs" label="코덱 (쉼표 구분)">
          <Input placeholder="alaw,ulaw" />
        </Form.Item>
        <Form.Item name="enabled" label="활성" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
