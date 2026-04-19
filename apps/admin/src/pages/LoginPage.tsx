import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { login } from '../api/authApi';

export function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm();

  const onFinish = async (values: { loginId: string; password: string }) => {
    setError(null);
    setLoading(true);
    try {
      await login(values);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.message || '로그인 실패';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f5f5',
      }}
    >
      <Card style={{ width: '100%', maxWidth: 420 }}>
        <Typography.Title level={4} style={{ marginBottom: 4 }}>
          KAster CTI 관리자 콘솔
        </Typography.Title>
        <Typography.Text type="secondary">
          supervisor 또는 admin 역할만 접근할 수 있습니다. 관리자 로그인은 내선번호가 필요하지 않습니다.
        </Typography.Text>

        {error && (
          <Alert
            style={{ marginTop: 16 }}
            type="error"
            showIcon
            message={error}
            closable
            onClose={() => setError(null)}
          />
        )}

        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          onFinish={onFinish}
          initialValues={{ loginId: '', password: '' }}
        >
          <Form.Item label="로그인 ID" name="loginId" rules={[{ required: true }]}>
            <Input placeholder="supervisor1" autoFocus />
          </Form.Item>
          <Form.Item label="비밀번호" name="password" rules={[{ required: true }]}>
            <Input.Password placeholder="Password123!" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            로그인
          </Button>
        </Form>
      </Card>
    </div>
  );
}
