import { Alert, Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Typography } from 'antd';
import { useEffect } from 'react';
import type { ArsHttpEndpoint, ArsHttpEndpointInput } from '../api/arsHttpEndpointsApi';
import {
  REQUEST_SOURCE_OPTIONS,
  toMappingObject,
  toMappingRows,
  type MappingRow,
} from '../types/requestMapping';

interface Props {
  open: boolean;
  editing: ArsHttpEndpoint | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (input: ArsHttpEndpointInput) => void;
}

interface FormValues extends Omit<ArsHttpEndpointInput, 'requestMapping'> {
  mappingRows: MappingRow[];
}

const EMPTY: FormValues = {
  name: '',
  description: '',
  method: 'GET',
  url: '',
  mappingRows: [],
  authType: 'NONE',
  authHeaderName: '',
  resultPath: '',
  matchMode: 'EXISTS',
  matchValue: '',
  timeoutMs: 2000,
  isActive: true,
};

export function ArsHttpEndpointForm({ open, editing, saving, onCancel, onSave }: Props) {
  const [form] = Form.useForm<FormValues>();
  const authType = Form.useWatch('authType', form) ?? 'NONE';
  const matchMode = Form.useWatch('matchMode', form) ?? 'EXISTS';

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue(
      editing
        ? {
            ...EMPTY,
            ...editing,
            description: editing.description ?? '',
            authHeaderName: editing.authHeaderName ?? '',
            matchValue: editing.matchValue ?? '',
            mappingRows: toMappingRows(editing.requestMapping),
            // 자격증명은 서버가 돌려주지 않는다. 비워 두면 기존 값이 유지된다.
            authSecret: undefined,
          }
        : EMPTY,
    );
  }, [open, editing, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    const { mappingRows, authSecret, ...rest } = values;

    onSave({
      ...rest,
      description: rest.description || null,
      authHeaderName: rest.authType === 'HEADER' ? rest.authHeaderName : null,
      matchValue: rest.matchMode === 'EXISTS' ? null : rest.matchValue,
      requestMapping: toMappingObject(mappingRows),
      // 빈 문자열은 보내지 않는다 — 서버는 생략을 "그대로 두기" 로 읽는다.
      ...(authSecret ? { authSecret } : {}),
    });
  };

  return (
    <Modal
      open={open}
      title={editing ? '외부 조회 엔드포인트 수정' : '외부 조회 엔드포인트 등록'}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={saving}
      width={720}
      okText="저장"
      cancelText="취소"
      destroyOnClose
    >
      <Form form={form} layout="vertical" initialValues={EMPTY}>
        <Form.Item name="name" label="이름" rules={[{ required: true, message: '이름을 입력하세요' }]}>
          <Input maxLength={128} placeholder="CRM 고객등급 조회" />
        </Form.Item>

        <Form.Item name="description" label="설명">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>

        <Space.Compact block>
          <Form.Item name="method" label="방식" style={{ width: 120 }}>
            <Select options={[{ value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' }]} />
          </Form.Item>
          <Form.Item
            name="url"
            label="주소"
            style={{ flex: 1 }}
            rules={[{ required: true, message: '주소를 입력하세요' }]}
            extra="https 만 받습니다. 사내망(사설 IP)으로 풀리는 주소일 때만 http 를 받습니다."
          >
            <Input maxLength={512} placeholder="https://crm.example.com/api/grade" />
          </Form.Item>
        </Space.Compact>

        <Typography.Text strong>보낼 값</Typography.Text>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
          통화에서 뽑을 수 있는 값만 고를 수 있습니다. 자유 입력은 '고정값' 뿐입니다.
        </Typography.Paragraph>
        <Form.List name="mappingRows">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                  <Form.Item {...field} name={[field.name, 'name']} noStyle>
                    <Input placeholder="파라미터 이름" style={{ width: 180 }} />
                  </Form.Item>
                  <Form.Item {...field} name={[field.name, 'source']} noStyle>
                    <Select style={{ width: 150 }} options={[...REQUEST_SOURCE_OPTIONS]} />
                  </Form.Item>
                  <Form.Item {...field} name={[field.name, 'literal']} noStyle>
                    <Input placeholder="고정값" style={{ width: 160 }} />
                  </Form.Item>
                  <Button size="small" danger type="text" onClick={() => remove(field.name)}>삭제</Button>
                </Space>
              ))}
              <Button size="small" onClick={() => add({ name: '', source: 'CALLER', literal: '' })}>
                값 추가
              </Button>
            </>
          )}
        </Form.List>

        <Form.Item name="authType" label="인증" style={{ marginTop: 16 }}>
          <Select
            options={[
              { value: 'NONE', label: '없음' },
              { value: 'BEARER', label: 'Bearer 토큰' },
              { value: 'HEADER', label: '헤더' },
            ]}
          />
        </Form.Item>

        {authType === 'HEADER' && (
          <Form.Item name="authHeaderName" label="헤더 이름" rules={[{ required: true, message: '헤더 이름을 입력하세요' }]}>
            <Input maxLength={64} placeholder="x-api-key" />
          </Form.Item>
        )}

        {authType !== 'NONE' && (
          <Form.Item
            name="authSecret"
            label="인증 값"
            extra={
              editing?.hasSecret
                ? '이미 저장돼 있습니다. 비워 두면 그대로 두고, 입력하면 교체합니다.'
                : '저장 시 암호화됩니다. 저장한 뒤에는 화면으로 다시 볼 수 없습니다.'
            }
            rules={editing?.hasSecret ? [] : [{ required: true, message: '인증 값을 입력하세요' }]}
          >
            <Input.Password maxLength={2048} autoComplete="new-password" />
          </Form.Item>
        )}

        <Form.Item
          name="resultPath"
          label="결과 위치"
          rules={[{ required: true, message: '결과 위치를 입력하세요' }]}
          extra="점 표기만 받습니다. 예: data.customer.grade"
        >
          <Input maxLength={256} placeholder="data.customer.grade" />
        </Form.Item>

        <Space align="start">
          <Form.Item name="matchMode" label="판정">
            <Select
              style={{ width: 180 }}
              options={[
                { value: 'EXISTS', label: '값이 있으면' },
                { value: 'EQUALS', label: '값이 같으면' },
                { value: 'IN', label: '목록에 있으면' },
              ]}
            />
          </Form.Item>
          {matchMode !== 'EXISTS' && (
            <Form.Item
              name="matchValue"
              label={matchMode === 'IN' ? '목록 (쉼표로 구분)' : '비교할 값'}
              rules={[{ required: true, message: '비교할 값을 입력하세요' }]}
            >
              <Input style={{ width: 260 }} placeholder={matchMode === 'IN' ? 'VIP,VVIP' : 'VIP'} />
            </Form.Item>
          )}
          <Form.Item name="timeoutMs" label="대기(ms)">
            <InputNumber min={500} max={5000} step={100} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="isActive" label="사용" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Space>

        <Alert
          type="info"
          showIcon
          message="대기 시간 동안 고객은 무음을 듣습니다"
          description="조회가 끝날 때까지 통화가 멈춥니다. 5초가 상한인 이유입니다. 실패하면 통화는 플로우의 실패 연결로 흐릅니다."
        />
      </Form>
    </Modal>
  );
}
