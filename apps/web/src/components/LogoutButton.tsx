import { LogoutOutlined } from '@ant-design/icons';
import { Button, Modal } from 'antd';
import { logout } from '../api';

export function LogoutButton() {
  const onClick = () => {
    Modal.confirm({
      title: '로그아웃',
      content: '현재 세션을 종료합니다. 계속하시겠습니까?',
      okText: '로그아웃',
      okType: 'danger',
      cancelText: '취소',
      onOk: async () => {
        await logout();
        // useAuthStore.clear() 가 호출되어 RequireAuth 가 LoginPage 로 복귀시킴.
      },
    });
  };

  return (
    <Button icon={<LogoutOutlined />} onClick={onClick}>
      로그아웃
    </Button>
  );
}
