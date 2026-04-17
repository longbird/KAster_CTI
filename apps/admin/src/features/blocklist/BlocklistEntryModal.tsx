import { Form, Input, Modal, Switch } from 'antd';
import { useEffect } from 'react';
import type { AsteriskBlocklistEntry } from '../asterisk-config/types/asterisk-config';

export type BlocklistEntryFormValue = Omit<AsteriskBlocklistEntry, 'id' | 'createdAt' | 'updatedAt'>;

interface Props {
  open: boolean;
  entry?: AsteriskBlocklistEntry | null;
  onClose: () => void;
  onSave: (values: BlocklistEntryFormValue) => Promise<void>;
}

export function BlocklistEntryModal({ open, entry, onClose, onSave }: Props) {
  const [form] = Form.useForm<BlocklistEntryFormValue>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      phoneNumber: entry?.phoneNumber,
      description: entry?.description ?? undefined,
      isActive: entry?.isActive ?? true,
    });
  }, [entry, form, open]);

  const handleOk = async () => {
    const values = await form.validateFields();
    await onSave({
      ...values,
      phoneNumber: values.phoneNumber.replace(/\D/g, ''),
    });
    form.resetFields();
  };

  return (
    <Modal
      title={entry ? '수신거부 번호 수정' : '수신거부 번호 등록'}
      open={open}
      onOk={() => void handleOk()}
      onCancel={onClose}
      okText="저장"
      cancelText="취소"
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="phoneNumber"
          label="전화번호"
          rules={[
            { required: true, message: '전화번호를 입력하세요.' },
            {
              validator: async (_, value: string | undefined) => {
                const digits = (value ?? '').replace(/\D/g, '');
                if (!/^\d{8,16}$/.test(digits)) {
                  throw new Error('숫자 8~16자리 형식이어야 합니다.');
                }
              },
            },
          ]}
          extra="하이픈 없이 저장되며, 수신 ANI와 정확히 일치할 때 차단됩니다."
        >
          <Input placeholder="08012345678" />
        </Form.Item>
        <Form.Item name="description" label="사유">
          <Input placeholder="수신거부 요청" />
        </Form.Item>
        <Form.Item name="isActive" label="활성" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
