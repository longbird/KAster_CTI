import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { login } from '../api/authApi';
import brandImage from '../assets/kaster-admin-brand.webp';

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
    <div className="login-screen">
      <Card className="login-card-shell" bordered={false}>
        <div className="login-hero">
          <div className="login-hero__badge">KAster Admin Runtime</div>
          <img src={brandImage} alt="KAster CTI Admin" className="login-hero__image" />
          <Typography.Title level={2} className="login-hero__title">
            KAster CTI 관리자 콘솔
          </Typography.Title>
          <Typography.Paragraph className="login-hero__description">
            운영사와 콜센터 현장을 함께 관리하는 PBX 운영 대시보드입니다. 동일한 KAster 브랜드 자산을
            기준으로 상담원 런타임과 관리자 화면의 톤을 맞췄습니다.
          </Typography.Paragraph>
        </div>

        <div className="login-form-panel">
          <Typography.Title level={4} style={{ marginBottom: 4 }}>
            관리자 로그인
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
            style={{ marginTop: 20 }}
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
        </div>
      </Card>
    </div>
  );
}
