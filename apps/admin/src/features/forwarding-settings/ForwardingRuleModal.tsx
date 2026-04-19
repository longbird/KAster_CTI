import { Form, Input, Modal, Select, Switch, TimePicker } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';
import type { AsteriskForwardingRule } from '../asterisk-config/types/asterisk-config';

export interface ForwardingRuleFormValue {
  didId: string;
  forwardType: 'EXTENSION' | 'QUEUE';
  targetValue: string;
  conditionType: 'ALWAYS' | 'TIME_RANGE';
  timeStart?: string | null;
  timeEnd?: string | null;
  daysOfWeek: string[];
  description?: string;
  enabled: boolean;
}

interface ForwardingRuleFormState extends Omit<ForwardingRuleFormValue, 'timeStart' | 'timeEnd'> {
  timeStart?: Dayjs | null;
  timeEnd?: Dayjs | null;
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
  const [form] = Form.useForm<ForwardingRuleFormState>();
  const forwardType = Form.useWatch('forwardType', form) ?? 'EXTENSION';
  const conditionType = Form.useWatch('conditionType', form) ?? 'ALWAYS';

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      didId: rule?.didId,
      forwardType: rule?.forwardType ?? 'EXTENSION',
      targetValue: rule?.targetValue,
      conditionType: rule?.conditionType ?? 'ALWAYS',
      timeStart: rule?.timeStart ? dayjs(rule.timeStart, 'HH:mm') : null,
      timeEnd: rule?.timeEnd ? dayjs(rule.timeEnd, 'HH:mm') : null,
      daysOfWeek: rule?.daysOfWeek ?? [],
      description: rule?.description ?? undefined,
      enabled: rule?.enabled ?? true,
    });
  }, [open, rule, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    await onSave({
      didId: values.didId,
      forwardType: values.forwardType,
      targetValue: values.targetValue,
      conditionType: values.conditionType,
      timeStart: values.timeStart ? values.timeStart.format('HH:mm') : null,
      timeEnd: values.timeEnd ? values.timeEnd.format('HH:mm') : null,
      daysOfWeek: values.daysOfWeek ?? [],
      description: values.description,
      enabled: values.enabled,
    });
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
        <Form.Item name="conditionType" label="적용 조건" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'ALWAYS', label: '항상 적용' },
              { value: 'TIME_RANGE', label: '시간대 적용' },
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
        {conditionType === 'TIME_RANGE' ? (
          <>
            <Form.Item
              name="daysOfWeek"
              label="요일"
              rules={[{ required: true, message: '적용 요일을 선택하세요.' }]}
            >
              <Select
                mode="multiple"
                options={[
                  { value: 'mon', label: '월' },
                  { value: 'tue', label: '화' },
                  { value: 'wed', label: '수' },
                  { value: 'thu', label: '목' },
                  { value: 'fri', label: '금' },
                  { value: 'sat', label: '토' },
                  { value: 'sun', label: '일' },
                ]}
                placeholder="적용 요일 선택"
              />
            </Form.Item>
            <Form.Item label="적용 시간" required>
              <Input.Group compact>
                <Form.Item
                  name="timeStart"
                  noStyle
                  rules={[{ required: true, message: '시작 시간을 선택하세요.' }]}
                >
                  <TimePicker format="HH:mm" minuteStep={5} placeholder="시작" />
                </Form.Item>
                <Input
                  value="~"
                  disabled
                  style={{ width: 48, textAlign: 'center', pointerEvents: 'none' }}
                />
                <Form.Item
                  name="timeEnd"
                  noStyle
                  dependencies={['timeStart']}
                  rules={[
                    { required: true, message: '종료 시간을 선택하세요.' },
                    ({ getFieldValue }) => ({
                      validator: async (_, value: Dayjs | null | undefined) => {
                        const start = getFieldValue('timeStart') as Dayjs | null | undefined;
                        if (!start || !value) return;
                        if (!value.isAfter(start)) {
                          throw new Error('종료 시간은 시작 시간보다 늦어야 합니다.');
                        }
                      },
                    }),
                  ]}
                >
                  <TimePicker format="HH:mm" minuteStep={5} placeholder="종료" />
                </Form.Item>
              </Input.Group>
            </Form.Item>
          </>
        ) : null}
        <Form.Item name="description" label="설명">
          <Input maxLength={255} placeholder="예: 평일 주간 콜센터 전환" />
        </Form.Item>
        <Form.Item name="enabled" label="활성" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
