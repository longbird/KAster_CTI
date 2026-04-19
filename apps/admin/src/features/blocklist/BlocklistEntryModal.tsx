import { Form, Input, Modal, Select, Switch } from 'antd';
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
      matchType: entry?.matchType ?? 'EXACT',
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
        <Form.Item name="matchType" label="매칭 방식" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'EXACT', label: '정확히 일치' },
              { value: 'PREFIX', label: '접두어 일치' },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="phoneNumber"
          label="번호 또는 패턴"
          dependencies={['matchType']}
          rules={[
            { required: true, message: '전화번호를 입력하세요.' },
            ({ getFieldValue }) => ({
              validator: async (_, value: string | undefined) => {
                const matchType = getFieldValue('matchType') as 'EXACT' | 'PREFIX' | undefined;
                const digits = (value ?? '').replace(/\D/g, '');
                const isValid =
                  matchType === 'PREFIX' ? /^\d{2,16}$/.test(digits) : /^\d{8,16}$/.test(digits);
                if (!isValid) {
                  throw new Error(
                    matchType === 'PREFIX'
                      ? '접두어는 숫자 2~16자리 형식이어야 합니다.'
                      : '전화번호는 숫자 8~16자리 형식이어야 합니다.',
                  );
                }
              },
            }),
          ]}
          extra="정확히 일치는 전체 번호를, 접두어 일치는 해당 숫자로 시작하는 ANI를 차단합니다."
        >
          <Input placeholder="08012345678 또는 080" />
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
