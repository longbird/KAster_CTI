import { Button, Card, Form, Input, InputNumber, Select, Space, Switch, Tag, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { FeatureHelpButton } from '../../shared/help';
import { apiClient } from '../../shared/lib/apiClient';
import { usePermissionStore } from '../../store/usePermissionStore';

interface SystemSettingsFormValue {
  recordingEnabled: boolean;
  defaultMaxWaitSeconds: number;
  allowDirectSipDial: boolean;
  defaultSipPassword?: string;
  allowedOutboundCallerIds?: string;
  defaultOutboundCallerId?: string;
  sipRegisterPort: number;
  timezone: string;
  dateFormat: string;
}

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Seoul', label: 'Asia/Seoul' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
  { value: 'UTC', label: 'UTC' },
];

const DATE_FORMAT_OPTIONS = [
  { value: 'YYYY-MM-DD HH:mm:ss', label: 'YYYY-MM-DD HH:mm:ss' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
  { value: 'YYYY.MM.DD HH:mm', label: 'YYYY.MM.DD HH:mm' },
];

function normalizeCallerId(value: string): string {
  return value.replace(/\D/g, '');
}

function parseCallerIds(value?: string): string[] {
  if (!value) return [];
  return [...new Set(
    value
      .split(/\r?\n|,/)
      .map((item) => normalizeCallerId(item.trim()))
      .filter((item) => /^\d{8,16}$/.test(item)),
  )];
}

export function SystemSettingsPage() {
  const [form] = Form.useForm<SystemSettingsFormValue>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [callerIds, setCallerIds] = useState<string[]>([]);
  const [newCallerId, setNewCallerId] = useState('');
  const permission = usePermissionStore((s) => s.permissionsByMenu['system']);
  const canUpdate = permission?.canUpdate ?? true;

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/settings/system');
      const data = res.data?.data;
      const parsedCallerIds = parseCallerIds(data?.allowedOutboundCallerIds);
      setCallerIds(parsedCallerIds);
      setNewCallerId('');
      form.setFieldsValue({
        ...data,
        allowedOutboundCallerIds: parsedCallerIds.join('\n'),
        defaultOutboundCallerId:
          parsedCallerIds.includes(data?.defaultOutboundCallerId ?? '')
            ? data?.defaultOutboundCallerId
            : undefined,
      });
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '시스템 설정을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const syncCallerIdsToForm = (nextCallerIds: string[]) => {
    const currentDefault = form.getFieldValue('defaultOutboundCallerId');
    form.setFieldsValue({
      allowedOutboundCallerIds: nextCallerIds.join('\n'),
      defaultOutboundCallerId: nextCallerIds.includes(currentDefault) ? currentDefault : undefined,
    });
  };

  const addCallerId = () => {
    const normalized = normalizeCallerId(newCallerId.trim());
    if (!/^\d{8,16}$/.test(normalized)) {
      message.warning('발신번호는 8~16자리 숫자로 입력해야 합니다.');
      return;
    }
    if (callerIds.includes(normalized)) {
      message.info('이미 추가된 발신번호입니다.');
      return;
    }
    const nextCallerIds = [...callerIds, normalized];
    setCallerIds(nextCallerIds);
    syncCallerIdsToForm(nextCallerIds);
    setNewCallerId('');
  };

  const removeCallerId = (value: string) => {
    const nextCallerIds = callerIds.filter((item) => item !== value);
    setCallerIds(nextCallerIds);
    syncCallerIdsToForm(nextCallerIds);
  };

  const save = async () => {
    const values = await form.validateFields();
    if (callerIds.length === 0) {
      message.warning('허용 발신번호를 최소 1개 이상 등록하세요.');
      return;
    }
    if (values.defaultOutboundCallerId && !callerIds.includes(values.defaultOutboundCallerId)) {
      message.warning('기본 발신번호는 허용 발신번호 목록 안에서 선택해야 합니다.');
      return;
    }
    setSaving(true);
    try {
      await apiClient.post('/admin/settings/system', {
        ...values,
        allowedOutboundCallerIds: callerIds.join('\n'),
      });
      message.success('시스템 설정을 저장했습니다.');
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '시스템 설정 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card loading={loading}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Space align="center">
            <Typography.Title level={4} style={{ margin: 0 }}>
              시스템 설정
            </Typography.Title>
            <FeatureHelpButton featureKey="system.timeSync" featureName="시간 동기화 상태" />
          </Space>
          <Typography.Text type="secondary">
            테넌트 기본 운영값입니다. 직접 SIP 발신 허용 여부와 허용 발신번호도 여기서 관리합니다.
          </Typography.Text>
        </div>

        <Form form={form} layout="vertical">
          <Form.Item name="recordingEnabled" label="기본 녹취 사용" valuePropName="checked">
            <Switch checkedChildren="ON" unCheckedChildren="OFF" />
          </Form.Item>

          <Form.Item
            name="defaultMaxWaitSeconds"
            label="기본 최대 대기시간(초)"
            rules={[{ required: true, message: '기본 최대 대기시간을 입력하세요.' }]}
          >
            <InputNumber min={5} max={600} style={{ width: 240 }} />
          </Form.Item>

          <Form.Item name="allowDirectSipDial" label="SIP 전화기 직접 발신 허용" valuePropName="checked">
            <Switch checkedChildren="허용" unCheckedChildren="차단" />
          </Form.Item>

          <Form.Item
            name="defaultSipPassword"
            label="사이트 기본 SIP 비밀번호"
            extra="개별 SIP 비밀번호가 비어 있는 내선은 이 값을 사용합니다."
          >
            <Input.Password placeholder="비워두면 기본 비밀번호 미사용" style={{ width: 280 }} />
          </Form.Item>

          <Form.Item
            name="allowedOutboundCallerIds"
            label="허용 발신번호 목록"
            extra="Click 2 Call 과 직접 SIP 발신 모두 이 목록 안의 번호만 사용합니다."
            hidden
          >
            <Input.TextArea />
          </Form.Item>

          <Form.Item label="허용 발신번호 관리">
            <Space.Compact style={{ maxWidth: 360, width: '100%' }}>
              <Input
                value={newCallerId}
                onChange={(event) => setNewCallerId(event.target.value)}
                placeholder="07052346380"
                onPressEnter={addCallerId}
                disabled={!canUpdate}
              />
              <Button onClick={addCallerId} disabled={!canUpdate}>
                추가
              </Button>
            </Space.Compact>
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {callerIds.length > 0 ? callerIds.map((callerId) => (
                <Tag
                  key={callerId}
                  closable={canUpdate}
                  onClose={(event) => {
                    event.preventDefault();
                    removeCallerId(callerId);
                  }}
                  color="blue"
                >
                  {callerId}
                </Tag>
              )) : (
                <Typography.Text type="secondary">등록된 허용 발신번호가 없습니다.</Typography.Text>
              )}
            </div>
          </Form.Item>

          <Form.Item
            name="defaultOutboundCallerId"
            label="기본 발신번호"
            extra="현재 1차 구현에서는 Click 2 Call 과 직접 SIP 발신 모두 이 번호를 사용합니다."
          >
            <Select
              placeholder="기본 발신번호 선택"
              style={{ width: 280 }}
              options={callerIds.map((callerId) => ({ value: callerId, label: callerId }))}
              allowClear
            />
          </Form.Item>

          <Form.Item
            name="sipRegisterPort"
            label="전화기 SIP 등록 포트"
            extra="에이전트 전화기가 등록할 PJSIP bind 포트입니다. 변경 후 PJSIP 동기화 또는 reload가 필요합니다."
            rules={[{ required: true, message: '전화기 SIP 등록 포트를 입력하세요.' }]}
          >
            <InputNumber min={1} max={65535} style={{ width: 240 }} />
          </Form.Item>

          <Form.Item
            name="timezone"
            label="기본 타임존"
            rules={[{ required: true, message: '타임존을 선택하세요.' }]}
          >
            <Select options={TIMEZONE_OPTIONS} style={{ width: 240 }} />
          </Form.Item>

          <Form.Item
            name="dateFormat"
            label="기본 날짜 포맷"
            rules={[{ required: true, message: '날짜 포맷을 선택하세요.' }]}
          >
            <Select options={DATE_FORMAT_OPTIONS} style={{ width: 280 }} />
          </Form.Item>
        </Form>

        <Space>
          {canUpdate ? (
            <Button type="primary" onClick={() => void save()} loading={saving}>
              저장
            </Button>
          ) : null}
          <Button onClick={() => void load()} disabled={saving}>
            다시 불러오기
          </Button>
        </Space>
      </Space>
    </Card>
  );
}
