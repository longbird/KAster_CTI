import { Alert, Card, Spin, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { exchangeWebHandoff } from '../api';
import { extractErrorMessage } from '../utils/errorMessage';

export function DesktopHandoffPage() {
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;

    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setError('desktop handoff token 이 없습니다.');
      return;
    }

    void (async () => {
      try {
        await exchangeWebHandoff(token);
        window.location.replace('/');
      } catch (err: unknown) {
        setError(extractErrorMessage(err, '웹 자동 로그인에 실패했습니다.'));
      }
    })();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <Card className="w-full max-w-md shadow-panel">
        <Typography.Title level={4} className="!mb-1">
          KAster CTI 연결 중
        </Typography.Title>
        {error ? (
          <Alert type="error" showIcon message={error} />
        ) : (
          <div className="flex items-center gap-3 py-4">
            <Spin size="small" />
            <Typography.Text>데스크톱 로그인 세션을 웹으로 연결하고 있습니다.</Typography.Text>
          </div>
        )}
      </Card>
    </div>
  );
}
