import { Alert, Button, Card, Form, Input, Typography, message } from 'antd';
import { useState } from 'react';
import { changePlatformPassword, fetchPlatformMe, platformLogout } from './api/platformAuthApi';
import { serverErrorMessage } from './lib/serverError';
import { usePlatformAuthStore } from './store/usePlatformAuthStore';

interface PasswordFormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * `mustChangePassword` 인 계정이 처음 만나는 화면.
 * 부트스트랩 env 에 적혀 있던 값이 그대로 운영 비밀번호가 되는 것을 막기 위해,
 * 바꾸기 전에는 다른 플랫폼 화면으로 갈 수 없다 (서버도 다른 API 를 403 으로 막는다).
 */
export function PlatformPasswordChangePage() {
  const admin = usePlatformAuthStore((state) => state.admin);
  const setAdmin = usePlatformAuthStore((state) => state.setAdmin);
  const [form] = Form.useForm<PasswordFormValues>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: PasswordFormValues) => {
    setError(null);
    setSaving(true);
    try {
      await changePlatformPassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      // 변경 성공 후 신원을 다시 읽어 mustChangePassword 플래그를 내린다.
      // 이 값이 남아 있으면 화면이 계속 이 폼에 갇힌다.
      setAdmin(await fetchPlatformMe());
      message.success('비밀번호를 변경했습니다.');
    } catch (err) {
      setError(serverErrorMessage(err, '비밀번호를 변경하지 못했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="login-screen">
      <Card style={{ width: 'min(460px, 100%)' }}>
        <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
          비밀번호 변경이 필요합니다
        </Typography.Title>
        <Typography.Text type="secondary">
          {admin ? `${admin.displayName} (${admin.loginId})` : '플랫폼 관리자'} 계정은 초기 비밀번호를 쓰고 있습니다.
          바꾸기 전에는 다른 화면으로 이동할 수 없습니다.
        </Typography.Text>

        {error ? (
          <Alert style={{ marginTop: 16 }} type="error" showIcon closable message={error} onClose={() => setError(null)} />
        ) : null}

        <Form form={form} layout="vertical" style={{ marginTop: 20 }} onFinish={onFinish}>
          <Form.Item
            label="현재 비밀번호"
            name="currentPassword"
            rules={[{ required: true, message: '현재 비밀번호를 입력하세요' }]}
          >
            <Input.Password autoFocus autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            label="새 비밀번호"
            name="newPassword"
            rules={[
              { required: true, message: '새 비밀번호를 입력하세요' },
              { min: 8, message: '8자 이상으로 정하세요' },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            label="새 비밀번호 확인"
            name="confirmPassword"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '새 비밀번호를 한 번 더 입력하세요' },
              ({ getFieldValue }) => ({
                validator: (_, value) =>
                  !value || value === getFieldValue('newPassword')
                    ? Promise.resolve()
                    : Promise.reject(new Error('새 비밀번호가 서로 다릅니다')),
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={saving}>
            비밀번호 변경
          </Button>
          <Button type="link" block style={{ marginTop: 8 }} onClick={() => void platformLogout()}>
            로그아웃
          </Button>
        </Form>
      </Card>
    </div>
  );
}
