import { Form, Input, Modal, Select, Switch } from 'antd';
import { useEffect } from 'react';
import type { AsteriskForwardingRule } from '../asterisk-config/types/asterisk-config';

export interface ForwardingRuleFormValue {
  didId: string;
  forwardType: 'EXTENSION' | 'QUEUE';
  targetValue: string;
  description?: string;
  enabled: boolean;
}

interface OptionItem {
  value: string;
  label: string;
}

interface DidOption {
  value: string;
  label: string;
}

interface Props {
  open: boolean;
  rule?: AsteriskForwardingRule | null;
  didOptions: DidOption[];
  extensionOptions: OptionItem[];
  queueOptions: OptionItem[];
  onClose: () => void;
  onSave: (values: ForwardingRuleFormValue) => Promise<void>;
}

export function ForwardingRuleModal({
  open,
  rule,
  didOptions,
  extensionOptions,
  queueOptions,
  onClose,
  onSave,
}: Props) {
  const [form] = Form.useForm<ForwardingRuleFormValue>();
  const forwardType = Form.useWatch('forwardType', form) ?? 'EXTENSION';

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      didId: rule?.didId,
      forwardType: rule?.forwardType ?? 'EXTENSION',
      targetValue: rule?.targetValue,
      description: rule?.description ?? undefined,
      enabled: rule?.enabled ?? true,
    });
  }, [open, rule, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    await onSave(values);
    form.resetFields();
  };

  return (
    <Modal
      title={rule ? '착신전환 수정' : '착신전환 등록'}
      open={open}
      onOk={() => void handleOk()}
      onCancel={onClose}
      okText="저장"
      cancelText="취소"
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item name="didId" label="대상 DID" rules={[{ required: true, message: 'DID를 선택하세요.' }]}>
          <Select options={didOptions} showSearch optionFilterProp="label" placeholder="착신번호 선택" />
        </Form.Item>
        <Form.Item name="forwardType" label="전환 방식" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'EXTENSION', label: '내선 전환' },
              { value: 'QUEUE', label: '큐 전환' },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="targetValue"
          label="전환 대상"
          rules={[{ required: true, message: '전환 대상을 선택하세요.' }]}
        >
          <Select
            options={forwardType === 'QUEUE' ? queueOptions : extensionOptions}
            showSearch
            optionFilterProp="label"
            placeholder={forwardType === 'QUEUE' ? '큐 선택' : '내선 선택'}
          />
        </Form.Item>
        <Form.Item name="description" label="설명">
          <Input maxLength={255} placeholder="예: 야간 근무 전환" />
        </Form.Item>
        <Form.Item name="enabled" label="활성" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
