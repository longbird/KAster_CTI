import { Form, Input, Modal, Switch } from 'antd';
import { useEffect } from 'react';
import type { AsteriskSpeedDial, AsteriskSpeedDialInput } from '../types/asterisk-config';

interface Props {
  open: boolean;
  initial?: AsteriskSpeedDial | null;
  onOk: (values: AsteriskSpeedDialInput) => void;
  onCancel: () => void;
}

export function SpeedDialForm({ open, initial, onOk, onCancel }: Props) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue(initial ?? { enabled: true });
  }, [form, initial, open]);

  const handleOk = async () => {
    const values = await form.validateFields();
    onOk({
      code: values.code,
      targetNumber: String(values.targetNumber ?? '').replace(/\D/g, ''),
      displayName: values.displayName || null,
      description: values.description || null,
      enabled: values.enabled ?? true,
    });
  };

  return (
    <Modal title={initial ? '단축 발신 수정' : '단축 발신 추가'} open={open} onOk={() => void handleOk()} onCancel={onCancel} destroyOnClose>
      <Form form={form} layout="vertical">
        <Form.Item
          name="code"
          label="단축번호"
          extra="내선번호와 외부 발신번호 패턴과 충돌하지 않도록 * 또는 # 조합을 권장합니다."
          rules={[
            { required: true, message: '단축번호를 입력하세요.' },
            { pattern: /^[0-9*#]{1,16}$/, message: '단축번호는 숫자, *, #만 사용할 수 있습니다.' },
          ]}
        >
          <Input placeholder="*01" />
        </Form.Item>
        <Form.Item
          name="targetNumber"
          label="대상번호"
          rules={[
            { required: true, message: '대상번호를 입력하세요.' },
            {
              validator: async (_, value) => {
                const normalized = String(value ?? '').replace(/\D/g, '');
                if (/^\d{2,32}$/.test(normalized)) return;
                throw new Error('대상번호는 2~32자리 숫자로 입력하세요.');
              },
            },
          ]}
        >
          <Input placeholder="01012345678 또는 1001" />
        </Form.Item>
        <Form.Item name="displayName" label="표시명">
          <Input placeholder="긴급 연락처" />
        </Form.Item>
        <Form.Item name="description" label="설명">
          <Input />
        </Form.Item>
        <Form.Item name="enabled" label="활성" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
