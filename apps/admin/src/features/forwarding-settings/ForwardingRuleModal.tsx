import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  TimePicker,
  Typography,
  message,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { FeatureHelpButton } from '../../shared/help';
import type { AsteriskForwardingRule } from '../asterisk-config/types/asterisk-config';

export interface ForwardingRuleFormValue {
  didId: string;
  forwardType: 'EXTENSION' | 'QUEUE' | 'EXTERNAL_NUMBER';
  targetValue: string;
  forwardTriggerMode: 'IMMEDIATE' | 'AFTER_QUEUE_WAIT' | 'SMART_NO_READY';
  queueWaitSeconds: number | null;
  stickyCallbackWindowMinutes: number | null;
  schedules: Array<{
    conditionType: 'ALWAYS' | 'TIME_RANGE';
    timeStart: string | null;
    timeEnd: string | null;
    daysOfWeek: string[];
  }>;
  description?: string;
  enabled: boolean;
}

interface ForwardingScheduleFormState {
  daysOfWeek: string[];
  timeStart?: Dayjs | null;
  timeEnd?: Dayjs | null;
}

interface ForwardingRuleFormState {
  didId: string;
  forwardType: 'EXTENSION' | 'QUEUE' | 'EXTERNAL_NUMBER';
  targetValue: string;
  forwardTriggerMode: 'IMMEDIATE' | 'AFTER_QUEUE_WAIT' | 'SMART_NO_READY';
  queueWaitSeconds?: number | null;
  stickyCallbackWindowMinutes?: number | null;
  applyMode: 'ALWAYS' | 'SCHEDULED';
  schedules: ForwardingScheduleFormState[];
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
  directQueue: string | null;
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

const FORWARD_TYPE_OPTIONS = [
  { value: 'EXTERNAL_NUMBER', label: '외부 번호로 전환' },
  { value: 'EXTENSION', label: '내선으로 전환' },
  { value: 'QUEUE', label: '호 분배룰로 전환' },
];

const APPLY_MODE_OPTIONS = [
  { value: 'ALWAYS', label: '항상 적용' },
  { value: 'SCHEDULED', label: '요일/시간 지정' },
];

const TRIGGER_MODE_OPTIONS = [
  { value: 'IMMEDIATE', label: '즉시 착신' },
  { value: 'AFTER_QUEUE_WAIT', label: '대기 후 착신' },
  { value: 'SMART_NO_READY', label: '스마트 착신' },
];

const WEEKDAY_OPTIONS = [
  { value: 'mon', label: '월' },
  { value: 'tue', label: '화' },
  { value: 'wed', label: '수' },
  { value: 'thu', label: '목' },
  { value: 'fri', label: '금' },
  { value: 'sat', label: '토' },
  { value: 'sun', label: '일' },
];

function buildDefaultSchedule(): ForwardingScheduleFormState {
  return {
    daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
    timeStart: dayjs('09:00', 'HH:mm'),
    timeEnd: dayjs('18:00', 'HH:mm'),
  };
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
  const forwardType = Form.useWatch('forwardType', form) ?? 'EXTERNAL_NUMBER';
  const didId = Form.useWatch('didId', form);
  const forwardTriggerMode = Form.useWatch('forwardTriggerMode', form) ?? 'IMMEDIATE';
  const applyMode = Form.useWatch('applyMode', form) ?? 'ALWAYS';
  const selectedDid = didOptions.find((item) => item.value === didId);
  const supportsQueueTrigger = !!selectedDid?.directQueue;

  useEffect(() => {
    if (!open) return;

    const schedules = rule?.schedules?.filter((item) => item.conditionType === 'TIME_RANGE') ?? [];
    form.setFieldsValue({
      didId: rule?.didId,
      forwardType: rule?.forwardType ?? 'EXTERNAL_NUMBER',
      targetValue: rule?.targetValue,
      forwardTriggerMode: rule?.forwardTriggerMode ?? 'IMMEDIATE',
      queueWaitSeconds: rule?.queueWaitSeconds ?? 20,
      stickyCallbackWindowMinutes: rule?.stickyCallbackWindowMinutes ?? undefined,
      applyMode: schedules.length > 0 ? 'SCHEDULED' : 'ALWAYS',
      schedules:
        schedules.length > 0
          ? schedules.map((item) => ({
              daysOfWeek: item.daysOfWeek,
              timeStart: item.timeStart ? dayjs(item.timeStart, 'HH:mm') : null,
              timeEnd: item.timeEnd ? dayjs(item.timeEnd, 'HH:mm') : null,
            }))
          : [buildDefaultSchedule()],
      description: rule?.description ?? undefined,
      enabled: rule?.enabled ?? true,
    });
  }, [open, rule, form]);

  const handleValuesChange = (changedValues: Partial<ForwardingRuleFormState>) => {
    if (changedValues.applyMode === 'SCHEDULED') {
      const current = form.getFieldValue('schedules') as ForwardingScheduleFormState[] | undefined;
      if (!current || current.length === 0) {
        form.setFieldValue('schedules', [buildDefaultSchedule()]);
      }
    }

    if ((changedValues.didId || changedValues.forwardTriggerMode) && !supportsQueueTrigger) {
      const currentMode = form.getFieldValue('forwardTriggerMode') as ForwardingRuleFormState['forwardTriggerMode'] | undefined;
      if (currentMode && currentMode !== 'IMMEDIATE') {
        form.setFieldValue('forwardTriggerMode', 'IMMEDIATE');
        form.setFieldValue('queueWaitSeconds', null);
      }
    }
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();

      let schedules: ForwardingRuleFormValue['schedules'];
      if (values.applyMode === 'ALWAYS') {
        schedules = [{ conditionType: 'ALWAYS', timeStart: null, timeEnd: null, daysOfWeek: [] }];
      } else {
        const scheduleRows = values.schedules ?? [];
        if (scheduleRows.length === 0) {
          form.setFields([{ name: ['schedules'], errors: ['하나 이상의 시간대를 추가하세요.'] }]);
          return;
        }

        schedules = scheduleRows.map((item, index) => {
          if (!item.timeStart || !item.timeEnd) {
            throw new Error(`시간대 ${index + 1}의 시작/종료 시간을 선택하세요.`);
          }
          if (item.timeStart.format('HH:mm') === item.timeEnd.format('HH:mm')) {
            throw new Error(`시간대 ${index + 1}의 시작/종료 시간이 같을 수 없습니다.`);
          }
          if (!item.daysOfWeek || item.daysOfWeek.length === 0) {
            throw new Error(`시간대 ${index + 1}의 요일을 선택하세요.`);
          }

          return {
            conditionType: 'TIME_RANGE',
            timeStart: item.timeStart.format('HH:mm'),
            timeEnd: item.timeEnd.format('HH:mm'),
            daysOfWeek: item.daysOfWeek,
          };
        });
      }

      await onSave({
        didId: values.didId,
        forwardType: values.forwardType,
        targetValue: values.forwardType === 'EXTERNAL_NUMBER'
          ? values.targetValue.replace(/\D/g, '')
          : values.targetValue,
        forwardTriggerMode: values.forwardTriggerMode,
        queueWaitSeconds: values.forwardTriggerMode === 'AFTER_QUEUE_WAIT' ? values.queueWaitSeconds ?? null : null,
        stickyCallbackWindowMinutes: values.stickyCallbackWindowMinutes ?? null,
        schedules,
        description: values.description,
        enabled: values.enabled,
      });
      form.resetFields();
    } catch (error: any) {
      if (error?.message) {
        message.error(error.message);
      }
      throw error;
    }
  };

  return (
    <Modal
      title={
        <Space align="center">
          <span>{rule ? '착신전환 수정' : '착신전환 등록'}</span>
          <FeatureHelpButton featureKey="forwarding.condition" featureName="착신전환 조건" />
        </Space>
      }
      open={open}
      onOk={() => void handleOk()}
      onCancel={onClose}
      okText="저장"
      cancelText="취소"
      width={980}
      destroyOnClose
    >
      <Form
        form={form}
        layout="horizontal"
        preserve={false}
        labelCol={{ flex: '110px' }}
        wrapperCol={{ flex: 'auto' }}
        labelAlign="left"
        onValuesChange={handleValuesChange}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <Card title="기본 정보" size="small">
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(180px, 1fr)', gap: 16 }}>
                <Form.Item name="didId" label="대상 DID" rules={[{ required: true, message: 'DID를 선택하세요.' }]} style={{ marginBottom: 12 }}>
                  <Select options={didOptions} showSearch optionFilterProp="label" placeholder="착신번호 선택" />
                </Form.Item>
                <Form.Item name="enabled" label="활성 상태" valuePropName="checked" style={{ marginBottom: 12 }}>
                  <Switch checkedChildren="활성" unCheckedChildren="비활성" />
                </Form.Item>
              </div>
              <div>
                <Form.Item name="description" label="설명" style={{ marginBottom: 0 }}>
                  <Input maxLength={255} placeholder="예: 평일 주간 대표번호 외부 착신" />
                </Form.Item>
              </div>
            </div>
          </Card>

          <Card title="전환 설정" size="small">
            <Form.Item name="forwardType" label="전환 방식" rules={[{ required: true }]} style={{ marginBottom: 12 }}>
              <Radio.Group optionType="button" buttonStyle="solid" options={FORWARD_TYPE_OPTIONS} />
            </Form.Item>
            <Form.Item name="forwardTriggerMode" label="착신 조건" rules={[{ required: true }]} style={{ marginBottom: 12 }}>
              <Radio.Group optionType="button" buttonStyle="solid">
                {TRIGGER_MODE_OPTIONS.map((option) => (
                  <Radio.Button
                    key={option.value}
                    value={option.value}
                    disabled={!supportsQueueTrigger && option.value !== 'IMMEDIATE'}
                  >
                    {option.label}
                  </Radio.Button>
                ))}
              </Radio.Group>
            </Form.Item>
            {forwardTriggerMode === 'AFTER_QUEUE_WAIT' ? (
              <Form.Item
                name="queueWaitSeconds"
                label="대기 시간"
                rules={[{ required: true, message: '대기 시간을 입력하세요.' }]}
                style={{ marginBottom: 12 }}
              >
                <InputNumber min={5} max={600} addonAfter="초" style={{ width: 180 }} />
              </Form.Item>
            ) : null}
            <Form.Item
              name="stickyCallbackWindowMinutes"
              label="재착신 유지"
              tooltip="같은 번호가 다시 인입되면 지정한 시간 안에서는 이전 착신 번호로 즉시 연결합니다."
              style={{ marginBottom: 12 }}
            >
              <InputNumber min={1} max={1440} addonAfter="분" placeholder="미사용" style={{ width: 180 }} />
            </Form.Item>
            {!supportsQueueTrigger ? (
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                이 DID는 직접 연결되는 대기큐가 없어 `즉시 착신`만 사용할 수 있습니다.
              </Typography.Text>
            ) : null}
            <Form.Item
              name="targetValue"
              label={forwardType === 'QUEUE' ? '전환할 룰' : forwardType === 'EXTENSION' ? '전환할 내선' : '외부 번호'}
              rules={[
                { required: true, message: '전환 대상을 입력하세요.' },
                ...(forwardType === 'EXTERNAL_NUMBER'
                  ? [{ pattern: /^[0-9+\-() ]+$/, message: '전화번호 형식만 입력하세요.' }]
                  : []),
              ]}
              style={{ marginBottom: 0 }}
            >
              {forwardType === 'EXTERNAL_NUMBER' ? (
                <Input placeholder="예: 01012345678" />
              ) : (
                <Select
                  options={forwardType === 'QUEUE' ? queueOptions : extensionOptions}
                  showSearch
                  optionFilterProp="label"
                  placeholder={forwardType === 'QUEUE' ? '호 분배룰 선택' : '내선 선택'}
                />
              )}
            </Form.Item>
          </Card>

          <Card
            title="적용 조건"
            size="small"
            extra={
              <Typography.Text type="secondary">
                요일·시간대를 여러 개 설정할 수 있습니다. 종료 시간이 시작보다 빠르면 다음 날 새벽까지 연속되는 구간으로 처리됩니다(예: 월요일 22:00~06:00 = 월요일 22:00부터 화요일 06:00까지).
              </Typography.Text>
            }
          >
            <Form.Item name="applyMode" label="적용 방식" rules={[{ required: true }]} style={{ marginBottom: 12 }}>
              <Radio.Group optionType="button" buttonStyle="solid" options={APPLY_MODE_OPTIONS} />
            </Form.Item>

            {applyMode === 'SCHEDULED' ? (
              <Form.List name="schedules">
                {(fields, { add, remove }) => (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {fields.map((field, index) => (
                      <div
                        key={field.key}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '96px minmax(0, 1fr) 132px 132px auto',
                          alignItems: 'center',
                          gap: 12,
                          padding: '12px 14px',
                          border: '1px solid #f0f0f0',
                          borderRadius: 8,
                          background: '#fafafa',
                        }}
                      >
                        <Typography.Text strong>{`시간대 ${index + 1}`}</Typography.Text>
                        <Form.Item
                          name={[field.name, 'daysOfWeek']}
                          rules={[{ required: true, message: '요일을 선택하세요.' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Checkbox.Group options={WEEKDAY_OPTIONS} />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, 'timeStart']}
                          rules={[{ required: true, message: '시작 시간을 선택하세요.' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <TimePicker format="HH:mm" minuteStep={5} placeholder="시작" style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, 'timeEnd']}
                          rules={[{ required: true, message: '종료 시간을 선택하세요.' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <TimePicker format="HH:mm" minuteStep={5} placeholder="종료" style={{ width: '100%' }} />
                        </Form.Item>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          {fields.length > 1 ? (
                            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)}>
                              삭제
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}

                    <Button type="dashed" icon={<PlusOutlined />} onClick={() => add(buildDefaultSchedule())}>
                      시간대 추가
                    </Button>
                  </div>
                )}
              </Form.List>
            ) : (
              <Typography.Text type="secondary">
                활성 상태인 동안 항상 이 규칙을 DID 기본 라우팅보다 먼저 적용합니다.
              </Typography.Text>
            )}
          </Card>
        </div>
      </Form>
    </Modal>
  );
}
