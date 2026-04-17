import { Form, Input, Modal, Select, Switch } from 'antd';
import { useEffect } from 'react';
import type { AsteriskPrompt } from '../asterisk-config/types/asterisk-config';

export type PromptFormValue = Omit<AsteriskPrompt, 'id'>;

interface Props {
  open: boolean;
  prompt?: AsteriskPrompt | null;
  onClose: () => void;
  onSave: (values: PromptFormValue) => Promise<void>;
}

export function PromptModal({ open, prompt, onClose, onSave }: Props) {
  const [form] = Form.useForm<PromptFormValue>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      promptKey: prompt?.promptKey,
      displayName: prompt?.displayName,
      fileName: prompt?.fileName,
      category: prompt?.category ?? 'ivr',
      description: prompt?.description ?? undefined,
      isActive: prompt?.isActive ?? true,
    });
  }, [open, prompt, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    await onSave(values);
    form.resetFields();
  };

  return (
    <Modal
      title={prompt ? '멘트 수정' : '멘트 등록'}
      open={open}
      onOk={() => void handleOk()}
      onCancel={onClose}
      okText="저장"
      cancelText="취소"
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="promptKey"
          label="프롬프트 키"
          rules={[
            { required: true, message: '프롬프트 키를 입력하세요.' },
            { pattern: /^[A-Za-z0-9_/-]+$/, message: '영문, 숫자, _, /, - 만 허용됩니다.' },
          ]}
          extra="Dialplan Playback에서 참조하는 값입니다. 예: custom/welcome"
        >
          <Input placeholder="custom/welcome" />
        </Form.Item>
        <Form.Item name="displayName" label="표시명" rules={[{ required: true, message: '표시명을 입력하세요.' }]}>
          <Input placeholder="대표 환영 멘트" />
        </Form.Item>
        <Form.Item name="fileName" label="파일명" rules={[{ required: true, message: '파일명을 입력하세요.' }]}>
          <Input placeholder="welcome.wav" />
        </Form.Item>
        <Form.Item name="category" label="카테고리" initialValue="ivr">
          <Select
            options={[
              { value: 'ivr', label: 'IVR' },
              { value: 'queue', label: 'Queue' },
              { value: 'common', label: '공통' },
            ]}
          />
        </Form.Item>
        <Form.Item name="description" label="설명">
          <Input placeholder="사용 위치나 운영 메모" />
        </Form.Item>
        <Form.Item name="isActive" label="활성" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
