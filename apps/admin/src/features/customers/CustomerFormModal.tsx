import { Form, Modal } from 'antd';
import { useEffect } from 'react';
import type { CustomerFormInput, CustomerRow } from './types/customer';
import { buildCustomerFormValues, CustomerFormFields, normalizeCustomerFormValues, type CustomerFormValues } from './CustomerFormFields';

interface Props {
  open: boolean;
  customer?: CustomerRow | null;
  defaultGrade?: 'NORMAL' | 'VIP' | 'BLACK';
  onClose: () => void;
  onSave: (values: CustomerFormInput) => Promise<void>;
}

export function CustomerFormModal({ open, customer, defaultGrade = 'NORMAL', onClose, onSave }: Props) {
  const [form] = Form.useForm<CustomerFormValues>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue(buildCustomerFormValues(customer, defaultGrade));
  }, [customer, defaultGrade, form, open]);

  return (
    <Modal
      open={open}
      title={customer ? '고객 수정' : '고객 등록'}
      okText={customer ? '저장' : '등록'}
      cancelText="닫기"
      onCancel={onClose}
      onOk={async () => {
        const values = await form.validateFields();
        await onSave(normalizeCustomerFormValues(values));
      }}
    >
      <Form form={form} layout="vertical">
        <CustomerFormFields />
      </Form>
    </Modal>
  );
}
