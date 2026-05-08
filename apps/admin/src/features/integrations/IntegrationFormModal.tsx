import { Form, Input, Modal, Select, Switch } from 'antd';
import { useEffect } from 'react';

export type IntegrationAutomationType = 'VIX_PHONE' | 'VIX_SMS' | 'WEBHOOK' | 'SLACK_WEBHOOK';

export interface IntegrationAutomationFormValues {
  type: IntegrationAutomationType;
  name: string;
  description?: string;
  enabled: boolean;
  // type별 동적 필드
  host?: string;
  port?: number;
  authToken?: string;
  route?: string;
  url?: string;
  secret?: string;
  headers?: string;
}

export interface IntegrationAutomationRow {
  integrationAutomationId: string;
  type: IntegrationAutomationType;
  name: string;
  description: string | null;
  config: Record<string, any>;
  enabled: boolean;
  lastTriggeredAt: string | null;
}

const TYPE_OPTIONS: { value: IntegrationAutomationType; label: string }[] = [
  { value: 'VIX_PHONE', label: 'VIX 전화 자동화' },
  { value: 'VIX_SMS', label: 'VIX SMS 자동화' },
  { value: 'WEBHOOK', label: 'Webhook (POST)' },
  { value: 'SLACK_WEBHOOK', label: 'Slack Webhook' },
];

export function buildInitialFormValues(
  row?: IntegrationAutomationRow | null,
): IntegrationAutomationFormValues {
  if (!row) {
    return { type: 'WEBHOOK', name: '', enabled: true };
  }
  const config = row.config ?? {};
  return {
    type: row.type,
    name: row.name,
    description: row.description ?? undefined,
    enabled: row.enabled,
    host: config.host,
    port: config.port,
    authToken: config.authToken,
    route: config.route,
    url: config.url,
    secret: config.secret,
    headers:
      typeof config.headers === 'string'
        ? config.headers
        : config.headers
        ? JSON.stringify(config.headers, null, 2)
        : undefined,
  };
}

export function buildPayload(values: IntegrationAutomationFormValues) {
  let headersValue: any = undefined;
  if (values.headers && values.headers.trim()) {
    try {
      headersValue = JSON.parse(values.headers);
    } catch {
      headersValue = values.headers;
    }
  }
  let config: Record<string, unknown> = {};
  if (values.type === 'VIX_PHONE' || values.type === 'VIX_SMS') {
    config = {
      host: values.host ?? '',
      port: values.port ?? null,
      authToken: values.authToken ?? '',
      route: values.route ?? '',
    };
  } else if (values.type === 'WEBHOOK' || values.type === 'SLACK_WEBHOOK') {
    config = {
      url: values.url ?? '',
      secret: values.secret ?? '',
      headers: headersValue,
    };
  }
  return {
    type: values.type,
    name: values.name,
    description: values.description?.trim() ? values.description : undefined,
    config,
    enabled: values.enabled,
  };
}

interface Props {
  open: boolean;
  initial?: IntegrationAutomationRow | null;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (payload: ReturnType<typeof buildPayload>) => Promise<void>;
}

export function IntegrationFormModal({ open, initial, loading, onCancel, onSubmit }: Props) {
  const [form] = Form.useForm<IntegrationAutomationFormValues>();
  const watchedType = Form.useWatch('type', form);

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue(buildInitialFormValues(initial ?? null));
    }
  }, [open, initial, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    await onSubmit(buildPayload(values));
  };

  return (
    <Modal
      open={open}
      title={initial ? '자동화 수정' : '자동화 등록'}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      okText="저장"
      cancelText="취소"
      destroyOnClose
      width={600}
    >
      <Form<IntegrationAutomationFormValues>
        form={form}
        layout="vertical"
        initialValues={{ enabled: true, type: 'WEBHOOK' }}
      >
        <Form.Item
          label="타입"
          name="type"
          rules={[{ required: true, message: '타입을 선택하세요.' }]}
        >
          <Select options={TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item
          label="이름"
          name="name"
          rules={[{ required: true, message: '이름을 입력하세요.' }, { max: 128 }]}
        >
          <Input placeholder="자동화 이름" />
        </Form.Item>
        <Form.Item label="설명" name="description">
          <Input.TextArea rows={2} placeholder="용도 / 비고" />
        </Form.Item>

        {(watchedType === 'VIX_PHONE' || watchedType === 'VIX_SMS') && (
          <>
            <Form.Item label="VIX Host" name="host" rules={[{ required: true }]}>
              <Input placeholder="예: vix.example.com" />
            </Form.Item>
            <Form.Item label="Port" name="port">
              <Input type="number" placeholder="예: 8080" />
            </Form.Item>
            <Form.Item label="Auth Token" name="authToken">
              <Input.Password placeholder="API 토큰" />
            </Form.Item>
            <Form.Item label="Route / Action" name="route">
              <Input placeholder="예: /api/v1/dispatch" />
            </Form.Item>
          </>
        )}

        {(watchedType === 'WEBHOOK' || watchedType === 'SLACK_WEBHOOK') && (
          <>
            <Form.Item label="URL" name="url" rules={[{ required: true, type: 'url' }]}>
              <Input placeholder="https://..." />
            </Form.Item>
            <Form.Item label="Secret" name="secret">
              <Input.Password placeholder="HMAC 또는 단순 토큰" />
            </Form.Item>
            <Form.Item
              label="Custom Headers (JSON)"
              name="headers"
              tooltip='예: {"X-Source":"kaster"}'
            >
              <Input.TextArea rows={3} placeholder='{"X-Custom":"value"}' />
            </Form.Item>
          </>
        )}

        <Form.Item label="사용" name="enabled" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
