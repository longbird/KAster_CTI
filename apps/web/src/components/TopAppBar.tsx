import { LogoutOutlined } from '@ant-design/icons';
import { logout } from '../api';
import { useCtiStore } from '../store/useCtiStore';
import { useUiStore, type FullWorkspaceSection } from '../store/useUiStore';
import { AgentStatusTag } from './AgentStatusTag';
import { ThemeToggle } from './ThemeToggle';

const SECTION_LABEL: Record<FullWorkspaceSection, string> = {
  overview: '개요',
  call: '콜 센터',
  queues: '큐 현황',
  history: '이력',
};

export function TopAppBar() {
  const agentSession = useCtiStore((s) => s.agentSession);
  const changeStatus = useCtiStore((s) => s.changeStatus);
  const fullSection = useUiStore((s) => s.fullSection);
  const setMode = useUiStore((s) => s.setMode);

  const onLogout = async () => {
    if (!window.confirm('현재 세션을 종료하시겠습니까?')) return;
    await logout();
    window.location.reload();
  };

  return (
    <header
      className="fixed top-0 right-0 z-30 flex h-[46px] items-center justify-between px-4"
      style={{
        left: 56,
        background: 'var(--bg-base)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <div className="flex items-center gap-3">
        <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
          {SECTION_LABEL[fullSection]}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <AgentStatusTag status={agentSession?.statusCode} onChange={changeStatus} />
        <div className="hidden md:flex flex-col items-end leading-tight">
          <span style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 600 }}>
            {agentSession?.agentName ?? '-'}
          </span>
          <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>
            내선 {agentSession?.extension ?? '-'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setMode('mini')}
          className="rounded-full px-3 py-1 text-caption font-semibold transition-colors"
          style={{
            background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)',
          }}
          title="미니 모드"
        >
          미니
        </button>

        <ThemeToggle compact />

        <button
          onClick={() => { void onLogout(); }}
          className="flex items-center gap-1 rounded-full px-2 py-1 text-caption font-semibold"
          style={{ color: 'var(--tone-danger)' }}
          title="로그아웃"
        >
          <LogoutOutlined />
        </button>
      </div>
    </header>
  );
}
