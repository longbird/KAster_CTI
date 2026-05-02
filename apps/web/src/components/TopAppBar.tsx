import { LogoutOutlined } from '@ant-design/icons';
import { logout } from '../api';
import { useCtiStore } from '../store/useCtiStore';
import { AgentStatusTag } from './AgentStatusTag';

// v2 Operator TopAppBar — hairline bottom, mono brand, signal accent.
export function TopAppBar() {
  const agentSession = useCtiStore((s) => s.agentSession);
  const changeStatus = useCtiStore((s) => s.changeStatus);

  const onLogout = async () => {
    if (!window.confirm('현재 세션을 종료하시겠습니까?')) return;
    await logout();
    window.location.reload();
  };

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between px-6"
      style={{ background: 'var(--bg-1)', borderBottom: '1px solid var(--line-1)' }}
    >
      <div className="flex items-center gap-5">
        <span className="k-mono text-[14px] font-bold uppercase tracking-widest" style={{ color: 'var(--signal)' }}>
          KAster CTI
        </span>
        <span className="k-hr-v" />
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-sm"
            style={{ background: 'var(--bg-2)', border: '1px solid var(--line-2)' }}
          >
            <span className="material-symbols-outlined text-base" style={{ color: 'var(--fg-2)' }}>person</span>
          </div>
          <div>
            <p className="text-[13px] font-semibold leading-none text-[var(--fg-1)]">
              {agentSession?.agentName ?? '-'}
            </p>
            <p className="k-mono mt-1 text-[10px] tracking-wide text-[var(--fg-3)]">
              EXT <span className="text-[var(--fg-2)]">{agentSession?.extension ?? '-'}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <AgentStatusTag status={agentSession?.statusCode} onChange={changeStatus} />
        <span className="k-hr-v" />
        <button
          onClick={() => {
            void onLogout();
          }}
          className="k-btn k-btn-danger k-btn-sm"
        >
          <LogoutOutlined />
          로그아웃
        </button>
      </div>
    </header>
  );
}
