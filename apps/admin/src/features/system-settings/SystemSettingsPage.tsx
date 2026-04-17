import { Button, Card, Form, Input, InputNumber, Select, Space, Switch, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
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

export function SystemSettingsPage() {
  const [form] = Form.useForm<SystemSettingsFormValue>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const permission = usePermissionStore((s) => s.permissionsByMenu['system']);
  const canUpdate = permission?.canUpdate ?? true;

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/settings/system');
      form.setFieldsValue(res.data?.data);
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '시스템 설정을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await apiClient.post('/admin/settings/system', values);
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
          <Typography.Title level={4} style={{ margin: 0 }}>
            시스템 설정
          </Typography.Title>
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
            extra="한 줄에 한 번호씩 입력합니다. Click 2 Call 과 직접 SIP 발신 모두 이 목록 안의 번호만 사용합니다."
          >
            <Input.TextArea
              rows={4}
              placeholder={'07052346380\n07052346381'}
              style={{ maxWidth: 360 }}
            />
          </Form.Item>

          <Form.Item
            name="defaultOutboundCallerId"
            label="기본 발신번호"
            extra="현재 1차 구현에서는 Click 2 Call 과 직접 SIP 발신 모두 이 번호를 사용합니다."
          >
            <Input placeholder="07052346380" style={{ width: 280 }} />
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
