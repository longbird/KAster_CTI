import { useUiStore, type FullWorkspaceSection } from '../store/useUiStore';

interface NavItem {
  key: FullWorkspaceSection;
  label: string;
  code: string;
  icon: string;
}

const ITEMS: NavItem[] = [
  { key: 'overview', label: '개요',    code: 'OVERVIEW', icon: 'dashboard' },
  { key: 'call',     label: '콜 센터', code: 'CALL',     icon: 'headset_mic' },
  { key: 'queues',   label: '큐 현황', code: 'QUEUES',   icon: 'stacked_line_chart' },
  { key: 'history',  label: '이력',    code: 'HISTORY',  icon: 'history' },
];

// v2 Operator — dark sider, hairline right border, signal accent on active.
export function SideNav() {
  const mode = useUiStore((s) => s.mode);
  const fullSection = useUiStore((s) => s.fullSection);
  const setMode = useUiStore((s) => s.setMode);
  const setFullSection = useUiStore((s) => s.setFullSection);

  return (
    <aside
      className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col pb-6 pt-20"
      style={{ background: 'var(--bg-1)', borderRight: '1px solid var(--line-1)' }}
    >
      <div className="mb-6 px-6">
        <p className="k-mono text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--signal)' }}>
          KAster CTI
        </p>
        <h2 className="mt-1 text-[15px] font-semibold text-[var(--fg-1)]">상담원 포털</h2>
      </div>

      <div className="px-5 pb-2">
        <span className="k-eyebrow">Workspace</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {ITEMS.map((item) => {
          const isActive = item.key === fullSection;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setFullSection(item.key)}
              className="group flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left transition-colors"
              style={
                isActive
                  ? {
                      background: 'var(--signal-soft)',
                      borderLeft: '2px solid var(--signal)',
                      color: 'var(--signal)',
                    }
                  : {
                      borderLeft: '2px solid transparent',
                      color: 'var(--fg-2)',
                    }
              }
            >
              <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
              <span className="flex-1 text-[13px] font-semibold">{item.label}</span>
              <span
                className="k-mono text-[9px] tracking-widest"
                style={{ color: isActive ? 'var(--signal)' : 'var(--fg-3)' }}
              >
                {item.code}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto px-4">
        <div className="k-panel p-3">
          <span className="k-eyebrow mb-2 block">화면 모드</span>
          <div
            className="flex rounded-sm p-0.5"
            style={{ background: 'var(--bg-2)', border: '1px solid var(--line-1)' }}
          >
            <button
              onClick={() => setMode('full')}
              className="k-mono flex-1 rounded-sm px-3 py-1 text-[10px] font-bold tracking-widest transition-colors"
              style={
                mode === 'full'
                  ? { background: 'var(--signal)', color: 'var(--on-signal)' }
                  : { color: 'var(--fg-3)' }
              }
            >
              FULL
            </button>
            <button
              onClick={() => setMode('mini')}
              className="k-mono flex-1 rounded-sm px-3 py-1 text-[10px] font-bold tracking-widest transition-colors"
              style={
                mode === 'mini'
                  ? { background: 'var(--signal)', color: 'var(--on-signal)' }
                  : { color: 'var(--fg-3)' }
              }
            >
              MINI
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
