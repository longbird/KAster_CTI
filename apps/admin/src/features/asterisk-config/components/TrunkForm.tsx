import { Alert, Form, Input, InputNumber, Modal, Switch } from 'antd';
import { useEffect } from 'react';
import type { AsteriskTrunk, AsteriskTrunkInput } from '../types/asterisk-config';

interface Props {
  open: boolean;
  initial?: AsteriskTrunk | null;
  onOk: (values: AsteriskTrunkInput) => void;
  onCancel: () => void;
}

export function TrunkForm({ open, initial, onOk, onCancel }: Props) {
  const [form] = Form.useForm();

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const payload: AsteriskTrunkInput = {
      name: values.name,
      host: values.host,
      port: values.port,
      username: values.useAuthentication ? values.username : '',
      password: values.useAuthentication ? values.password : '',
      fromDomain: values.fromDomain,
      displayNumber: values.displayNumber?.replace(/\D/g, '') || null,
      codecs: values.codecs,
      enabled: values.enabled,
    };
    onOk(payload);
  };

  useEffect(() => {
    if (open) {
      form.setFieldsValue(
        initial
          ? { ...initial, useAuthentication: Boolean(initial.username) }
          : {
              port: 5060,
              codecs: 'alaw,ulaw',
              enabled: true,
              useAuthentication: false,
            },
      );
    }
  }, [open, initial, form]);

  return (
    <Modal
      title={initial ? '트렁크 수정' : '트렁크 추가'}
      open={open}
      onOk={() => void handleSubmit()}
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
        <Form.Item
          name="displayNumber"
          label="표시번호"
          rules={[
            {
              validator: async (_, value) => {
                const normalized = String(value ?? '').replace(/\D/g, '');
                if (!normalized || /^\d{2,16}$/.test(normalized)) return;
                throw new Error('표시번호는 2~16자리 숫자로 입력하세요.');
              },
            },
          ]}
        >
          <Input placeholder="1234" />
        </Form.Item>
        <Form.Item name="useAuthentication" label="인증 사용" valuePropName="checked">
          <Switch checkedChildren="사용" unCheckedChildren="미사용" />
        </Form.Item>
        <Form.Item noStyle shouldUpdate={(prev, next) => prev.useAuthentication !== next.useAuthentication}>
          {({ getFieldValue }) => (
            <>
              {!getFieldValue('useAuthentication') && (
                <Alert
                  style={{ marginBottom: 16 }}
                  type="info"
                  showIcon
                  message="인증이 필요 없는 트렁크는 사용자명/비밀번호 없이 등록할 수 있습니다."
                />
              )}
              {getFieldValue('useAuthentication') && (
                <>
                  <Form.Item
                    name="username"
                    label="사용자명 (Trunk ID)"
                    rules={[{ required: true }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    label="패스워드"
                    rules={[{ required: true }]}
                  >
                    <Input.Password />
                  </Form.Item>
                  <Form.Item name="fromDomain" label="From Domain">
                    <Input placeholder="sip.provider.com" />
                  </Form.Item>
                </>
              )}
            </>
          )}
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
