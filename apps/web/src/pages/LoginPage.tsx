import { Alert, Button, Card, Form, Input, Radio, Typography } from 'antd';
import { useState } from 'react';
import { createDesktopHandoff, login, logout } from '../api';
import { API_BASE_URL } from '../config';
import { extractErrorMessage } from '../utils/errorMessage';
import {
  buildDesktopConnectUrl,
  deriveCenterServerUrl,
  ensureDesktopAgentReady,
  launchDesktopProtocol,
  waitForDesktopHandoff,
} from '../utils/desktopBridge';

// 실제 백엔드 `/auth/login` 호출. mock 모드에서는 이 페이지를 거치지 않음.
export function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm();

  const onFinish = async (values: {
    loginId: string;
    password: string;
    extension: string;
    telephonyMode: 'softphone' | 'deskphone';
  }) => {
    setError(null);
    setLoading(true);
    try {
      if (values.telephonyMode === 'softphone') {
        const desktopReady = await ensureDesktopAgentReady();
        if (!desktopReady.ready) {
          throw new Error(desktopReady.message);
        }
      }

      await login(values);

      if (values.telephonyMode === 'softphone') {
        try {
          const handoff = await createDesktopHandoff();
          const connectUrl = buildDesktopConnectUrl({
            serverUrl: deriveCenterServerUrl(API_BASE_URL),
            handoffToken: handoff.handoffToken,
            channel: 'stable',
          });
          launchDesktopProtocol(connectUrl);
          const handoffResult = await waitForDesktopHandoff(handoff.handoffToken);
          if (!handoffResult.connected) {
            throw new Error(handoffResult.message);
          }
        } catch (err: unknown) {
          await logout();
          throw err;
        }
      }
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
          로그인 ID, 내선번호, 비밀번호로 로그인합니다.
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
          initialValues={{ loginId: '', password: '', extension: '', telephonyMode: 'softphone' }}
        >
          <Form.Item label="통화 방식" name="telephonyMode">
            <Radio.Group className="w-full">
              <Radio.Button value="softphone">소프트폰 사용</Radio.Button>
              <Radio.Button value="deskphone">SIP Phone 사용</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            label="로그인 ID"
            name="loginId"
            rules={[{ required: true, message: '로그인 ID 를 입력하세요' }]}
          >
            <Input placeholder="예: agent1001" autoFocus />
          </Form.Item>

          <Form.Item
            label="내선 번호"
            name="extension"
            rules={[{ required: true, message: '내선 번호를 입력하세요' }]}
          >
            <Input placeholder="예: 1001" />
          </Form.Item>

          <Form.Item
            label="비밀번호"
            name="password"
            rules={[{ required: true, message: '비밀번호를 입력하세요' }]}
          >
            <Input.Password placeholder="비밀번호 입력" />
          </Form.Item>

          <Button type="primary" htmlType="submit" block loading={loading}>
            로그인
          </Button>
        </Form>
      </Card>
    </div>
  );
}
