import { Button, Form, Input, InputNumber, Modal, Space, Switch, Typography } from 'antd';
import type { AsteriskBulkTrunkInput, AsteriskBulkTrunkEntryInput } from '../types/asterisk-config';

interface Props {
  open: boolean;
  onOk: (values: AsteriskBulkTrunkInput) => void;
  onCancel: () => void;
}

function expandRange(line: string): AsteriskBulkTrunkEntryInput[] | null {
  const match = line.match(/^(.*?)(\d+)\s*~\s*(\d+)$/);
  if (!match) return null;
  const [, prefix, startRaw, endRaw] = match;
  const start = Number(startRaw);
  const end = Number(endRaw);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const width = startRaw.length;
  return Array.from({ length: end - start + 1 }, (_, index) => ({
    name: `${prefix}${String(start + index).padStart(width, '0')}`,
  }));
}

function parseEntries(raw: string, hasCommonHost: boolean): AsteriskBulkTrunkEntryInput[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const expanded = expandRange(line);
      if (expanded) return expanded;
      const parts = line.split(',').map((part) => part.trim());
      if (parts.length === 1) {
        return hasCommonHost ? { name: parts[0] } : { host: parts[0] };
      }
      if (parts.length === 2) {
        const maybePort = Number(parts[1]);
        if (Number.isFinite(maybePort)) {
          return { host: parts[0], port: maybePort };
        }
        return { name: parts[0], host: parts[1] };
      }
      const [name, host, port] = parts;
      return { name, host, port: port ? Number(port) : undefined };
    });
}

export function BulkTrunkModal({ open, onOk, onCancel }: Props) {
  const [form] = Form.useForm();

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const entries = parseEntries(values.entriesText, Boolean(values.host));
    if (entries.length === 0) {
      form.setFields([{ name: 'entriesText', errors: ['회선 정보를 한 줄 이상 입력하세요.'] }]);
      return;
    }

    onOk({
      namePrefix: values.namePrefix,
      host: values.host,
      port: values.port,
      username: values.useAuthentication ? values.username : '',
      password: values.useAuthentication ? values.password : '',
      fromDomain: values.fromDomain,
      codecs: values.codecs,
      enabled: values.enabled,
      entries,
    });
  };

  const enabled = Form.useWatch('enabled', form) ?? true;
  const useAuthentication = Form.useWatch('useAuthentication', form) ?? false;

  return (
    <Modal
      title="트렁크 일괄 등록"
      open={open}
      onCancel={onCancel}
      destroyOnClose
      width={640}
      footer={[
        <div
          key="footer"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}
        >
          <Space>
            <Typography.Text type="secondary">등록 즉시 활성</Typography.Text>
            <Switch
              checked={enabled}
              onChange={(checked) => form.setFieldValue('enabled', checked)}
            />
          </Space>
          <Space>
            <Button onClick={onCancel}>취소</Button>
            <Button type="primary" onClick={() => void handleSubmit()}>확인</Button>
          </Space>
        </div>,
      ]}
    >
      <Typography.Text type="secondary">
        예: <Typography.Text code>070-5234-6380~6389</Typography.Text>, <Typography.Text code>host</Typography.Text>, <Typography.Text code>host,port</Typography.Text>, <Typography.Text code>이름,host,port</Typography.Text>
      </Typography.Text>
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          enabled: true,
          codecs: 'alaw,ulaw',
          port: 5060,
          useAuthentication: false,
        }}
      >
        <Form.Item name="host" label="공통 Host">
          <Input placeholder="범위 입력 시 공통 host 지정" />
        </Form.Item>
        <Form.Item name="port" label="공통 포트">
          <InputNumber min={1} max={65535} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="entriesText"
          label="회선 목록"
          rules={[{ required: true, message: '회선 목록을 입력하세요.' }]}
        >
          <Input.TextArea
            rows={6}
            placeholder={'070-5234-6380~6389\n10.10.10.1,5060\n회선3,10.10.10.3,5070'}
          />
        </Form.Item>
        <Form.Item name="namePrefix" label="이름 접두어">
          <Input placeholder="예: KT 중계선" />
        </Form.Item>
        <Form.Item name="useAuthentication" label="인증 사용" valuePropName="checked">
          <Switch checkedChildren="사용" unCheckedChildren="미사용" />
        </Form.Item>
        {useAuthentication && (
          <>
            <Form.Item
              name="username"
              label="공통 사용자명"
              rules={[{ required: true }]}
            >
              <Input placeholder="모든 회선에 동일 적용" />
            </Form.Item>
            <Form.Item
              name="password"
              label="공통 비밀번호"
              rules={[{ required: true }]}
            >
              <Input.Password placeholder="모든 회선에 동일 적용" />
            </Form.Item>
            <Form.Item name="fromDomain" label="공통 From Domain">
              <Input placeholder="비우면 생략" />
            </Form.Item>
          </>
        )}
        <Form.Item name="codecs" label="공통 코덱" style={{ marginBottom: 0 }}>
          <Input placeholder="alaw,ulaw" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
