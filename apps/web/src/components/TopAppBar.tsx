import { LogoutOutlined } from '@ant-design/icons';
import { Modal } from 'antd';
import { logout } from '../api';
import { useCtiStore } from '../store/useCtiStore';
import { AgentStatusTag } from './AgentStatusTag';

// "The Precision Curator" 디자인 시스템의 TopAppBar.
// 로고 + 브랜드 + 에이전트 식별자 + 상태 + 로그아웃.
export function TopAppBar() {
  const agentSession = useCtiStore((s) => s.agentSession);
  const changeStatus = useCtiStore((s) => s.changeStatus);

  const onLogout = () => {
    Modal.confirm({
      title: '로그아웃',
      content: '현재 세션을 종료합니다. 계속하시겠습니까?',
      okText: '로그아웃',
      okType: 'danger',
      cancelText: '취소',
      onOk: () => logout(),
    });
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between bg-surface-container-lowest px-8 shadow-panel">
      <div className="flex items-center gap-6">
        <span className="font-headline text-lg font-extrabold uppercase tracking-widest text-primary">
          KAster CTI
        </span>
        <div className="hidden h-6 w-px bg-outline-variant/30 md:block" />
        <div className="hidden items-center gap-3 md:flex">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary-fixed">
            <span className="material-symbols-outlined text-base text-primary">person</span>
          </div>
          <div>
            <p className="font-headline text-sm font-bold leading-none text-on-surface">
              {agentSession?.agentName ?? '-'}
            </p>
            <p className="mt-0.5 text-[10px] font-medium tracking-wide text-on-surface-variant">
              EXT {agentSession?.extension ?? '-'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <AgentStatusTag status={agentSession?.statusCode} onChange={changeStatus} />
        <div className="h-6 w-px bg-outline-variant/30" />
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-error transition-all hover:bg-error-container/20 active:scale-95"
        >
          <LogoutOutlined />
          Logout
        </button>
      </div>
    </header>
  );
}
