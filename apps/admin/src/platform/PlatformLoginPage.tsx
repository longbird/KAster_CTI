import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { platformLogin } from './api/platformAuthApi';
import { serverErrorMessage } from './lib/serverError';

interface LoginFormValues {
  loginId: string;
  password: string;
}

export function PlatformLoginPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm<LoginFormValues>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: LoginFormValues) => {
    setError(null);
    setLoading(true);
    try {
      await platformLogin(values);
      navigate('/platform', { replace: true });
    } catch (err) {
      setError(serverErrorMessage(err, '로그인에 실패했습니다.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <Card style={{ width: 'min(420px, 100%)' }}>
        <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
          플랫폼 관리자 로그인
        </Typography.Title>
        <Typography.Text type="secondary">
          테넌트별 기능 자격을 관리하는 계정입니다. 테넌트 관리자 계정으로는 로그인할 수 없습니다.
        </Typography.Text>

        {error ? (
          <Alert
            style={{ marginTop: 16 }}
            type="error"
            showIcon
            closable
            message={error}
            onClose={() => setError(null)}
          />
        ) : null}

        <Form form={form} layout="vertical" style={{ marginTop: 20 }} onFinish={onFinish}>
          <Form.Item label="로그인 ID" name="loginId" rules={[{ required: true, message: '로그인 ID를 입력하세요' }]}>
            <Input autoFocus autoComplete="username" />
          </Form.Item>
          <Form.Item label="비밀번호" name="password" rules={[{ required: true, message: '비밀번호를 입력하세요' }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            로그인
          </Button>
        </Form>
      </Card>
    </div>
  );
}
