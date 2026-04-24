import { Form, Input, Select } from 'antd';
import type { CustomerDetail, CustomerFormInput, CustomerRow } from './types/customer';

export interface CustomerFormValues extends CustomerFormInput {
  extraPhoneNumbersText?: string;
}

export function buildCustomerFormValues(
  customer?: CustomerRow | CustomerDetail | null,
  defaultGrade: 'NORMAL' | 'VIP' | 'BLACK' = 'NORMAL',
): CustomerFormValues {
  return {
    customerName: customer?.customerName ?? '',
    grade: customer?.grade ?? defaultGrade,
    memo: customer?.memo ?? '',
    primaryPhoneNumber: customer?.phones.find((phone) => phone.isPrimary)?.phoneNumber ?? customer?.primaryPhoneNumber ?? '',
    extraPhoneNumbersText: (customer?.phones ?? [])
      .filter((phone) => !phone.isPrimary)
      .map((phone) => phone.phoneNumber)
      .join('\n'),
  };
}

export function normalizeCustomerFormValues(values: CustomerFormValues): CustomerFormInput {
  return {
    customerName: values.customerName,
    grade: values.grade,
    memo: values.memo,
    primaryPhoneNumber: values.primaryPhoneNumber,
    extraPhoneNumbers: (values.extraPhoneNumbersText ?? '')
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean),
  };
}

export function CustomerFormFields() {
  return (
    <>
      <Form.Item name="customerName" label="성명" rules={[{ required: true, message: '성명을 입력하세요.' }]}>
        <Input />
      </Form.Item>
      <Form.Item name="primaryPhoneNumber" label="대표 전화번호" rules={[{ required: true, message: '대표 전화번호를 입력하세요.' }]}>
        <Input />
      </Form.Item>
      <Form.Item name="grade" label="등급">
        <Select
          options={[
            { value: 'NORMAL', label: '일반' },
            { value: 'VIP', label: 'VIP' },
            { value: 'BLACK', label: 'BLACK' },
          ]}
        />
      </Form.Item>
      <Form.Item name="extraPhoneNumbersText" label="추가 전화번호">
        <Input.TextArea rows={4} placeholder="줄바꿈 또는 쉼표로 구분" />
      </Form.Item>
      <Form.Item name="memo" label="기본 메모">
        <Input.TextArea rows={4} />
      </Form.Item>
    </>
  );
}
