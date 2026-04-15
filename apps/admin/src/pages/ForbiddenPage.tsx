import { Button, Result } from 'antd';
import { logout } from '../api/authApi';

export function ForbiddenPage() {
  return (
    <Result
      status="403"
      title="접근 권한 없음"
      subTitle="이 콘솔은 supervisor 또는 admin 역할만 접근할 수 있습니다. 관리자 계정으로 다시 로그인해주세요."
      extra={
        <Button type="primary" onClick={logout}>
          다시 로그인
        </Button>
      }
    />
  );
}
