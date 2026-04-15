import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { login } from '../api';
import { extractErrorMessage } from '../utils/errorMessage';

// 실제 백엔드 `/auth/login` 호출. mock 모드에서는 이 페이지를 거치지 않음.
export function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm();

  const onFinish = async (values: { loginId: string; password: string; extension: string }) => {
    setError(null);
    setLoading(true);
    try {
      await login(values);
    } catch (err: any) {
      setError(extractErrorMessage(err, '로그인 실패'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <Card className="w-full max-w-md shadow-panel">
        <Typography.Title level={4} className="!mb-1">
          KAster CTI 상담원 로그인
        </Typography.Title>
        <Typography.Text type="secondary" className="text-xs">
          loginId + 내선번호 + 비밀번호로 로그인합니다.
        </Typography.Text>

        {error && (
          <Alert
            className="mt-3"
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
          className="mt-4"
          onFinish={onFinish}
          initialValues={{ loginId: '', password: '', extension: '' }}
        >
          <Form.Item
            label="로그인 ID"
            name="loginId"
            rules={[{ required: true, message: '로그인 ID 를 입력하세요' }]}
          >
            <Input placeholder="agent1001" autoFocus />
          </Form.Item>

          <Form.Item
            label="내선 번호"
            name="extension"
            rules={[{ required: true, message: '내선 번호를 입력하세요' }]}
          >
            <Input placeholder="1001" />
          </Form.Item>

          <Form.Item
            label="비밀번호"
            name="password"
            rules={[{ required: true, message: '비밀번호를 입력하세요' }]}
          >
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
