import { Form, Input, InputNumber, Modal, Select, Switch } from 'antd';
import { useEffect } from 'react';
import type { ConsultCategoryRow } from './types/consultCategory';
import { CATEGORY_LEVEL_LABELS, MAX_CATEGORY_LEVEL } from './types/consultCategory';

export interface ConsultCategoryFormValues {
  code: string;
  name: string;
  parentCategoryId?: string;
  sortOrder: number;
  isActive: boolean;
}

interface Props {
  open: boolean;
  saving: boolean;
  /** 있으면 수정, 없으면 등록 */
  target: ConsultCategoryRow | null;
  categories: ConsultCategoryRow[];
  onCancel: () => void;
  onSubmit: (values: ConsultCategoryFormValues) => void;
}

export function ConsultCategoryModal({ open, saving, target, categories, onCancel, onSubmit }: Props) {
  const [form] = Form.useForm<ConsultCategoryFormValues>();
  const isEdit = Boolean(target);

  useEffect(() => {
    if (!open) return;

    form.setFieldsValue({
      code: target?.code ?? '',
      name: target?.name ?? '',
      parentCategoryId: target?.parentCategoryId ?? undefined,
      sortOrder: target?.sortOrder ?? 0,
      isActive: target?.isActive ?? true,
    });
  }, [open, target, form]);

  // 소분류 아래로는 더 만들 수 없으므로 부모 후보에서 뺀다.
  const parentOptions = categories
    .filter((category) => category.level < MAX_CATEGORY_LEVEL)
    .map((category) => ({
      value: category.categoryId,
      label: `[${CATEGORY_LEVEL_LABELS[category.level] ?? category.level}] ${category.name} (${category.code})`,
    }));

  return (
    <Modal
      open={open}
      title={isEdit ? '상담분류 수정' : '상담분류 등록'}
      okText={isEdit ? '저장' : '등록'}
      cancelText="취소"
      confirmLoading={saving}
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item
          name="code"
          label="분류 코드"
          extra={isEdit ? '코드는 만든 뒤 바꾸지 않는다. 이미 분석된 통화가 이 코드를 가리킨다.' : '영문 대문자·숫자·밑줄만 쓴다. 예: DELIVERY_DELAY'}
          rules={
            isEdit
              ? []
              : [
                  { required: true, message: '분류 코드를 입력하세요' },
                  { pattern: /^[A-Za-z0-9_]+$/, message: '영문·숫자·밑줄만 쓸 수 있습니다' },
                ]
          }
        >
          <Input disabled={isEdit} placeholder="DELIVERY" maxLength={64} />
        </Form.Item>

        <Form.Item
          name="name"
          label="분류명"
          rules={[{ required: true, message: '분류명을 입력하세요' }]}
        >
          <Input placeholder="배송 문의" maxLength={128} />
        </Form.Item>

        {!isEdit && (
          <Form.Item name="parentCategoryId" label="상위 분류" extra="비우면 대분류로 만듭니다.">
            <Select allowClear showSearch optionFilterProp="label" options={parentOptions} placeholder="대분류로 생성" />
          </Form.Item>
        )}

        <Form.Item name="sortOrder" label="정렬 순서">
          <InputNumber min={0} max={9999} style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item name="isActive" label="활성" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
