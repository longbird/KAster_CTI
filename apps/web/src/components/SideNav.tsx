import { useUiStore } from '../store/useUiStore';

interface NavItem {
  key: string;
  label: string;
  icon: string;
}

const ITEMS: NavItem[] = [
  { key: 'overview', label: 'Overview', icon: 'dashboard' },
  { key: 'call', label: 'Call Center', icon: 'headset_mic' },
  { key: 'queues', label: 'Queue Metrics', icon: 'stacked_line_chart' },
  { key: 'history', label: 'History', icon: 'history' },
];

// 좌측 영구 사이드바. 현재 프로젝트는 single-page 라 실제 라우팅은 없지만
// 디자인 시스템을 맞추기 위해 active 상태만 overview 로 표시.
export function SideNav() {
  const mode = useUiStore((s) => s.mode);
  const setMode = useUiStore((s) => s.setMode);

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col bg-surface-container-low pb-8 pt-20">
      <div className="mb-10 px-8">
        <h2 className="font-headline text-xl font-extrabold tracking-tight text-primary">
          Agent Portal
        </h2>
        <p className="mt-1 font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
          KAster CTI
        </p>
      </div>

      <nav className="flex-1 space-y-1">
        {ITEMS.map((item, idx) => {
          const isActive = idx === 0;
          return (
            <a
              key={item.key}
              href="#"
              className={
                isActive
                  ? 'ml-4 flex items-center gap-3 rounded-l-full bg-surface-container-lowest px-6 py-3 font-bold text-primary shadow-sm transition-all duration-300 ease-in-out'
                  : 'ml-4 flex items-center gap-3 px-6 py-3 text-on-surface-variant transition-all duration-300 ease-in-out hover:text-primary'
              }
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="font-label text-sm">{item.label}</span>
            </a>
          );
        })}
      </nav>

      <div className="mt-auto px-6">
        <div className="rounded-lg bg-surface-container p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            Interface Mode
          </p>
          <div className="flex rounded-full bg-surface-container-high p-1">
            <button
              onClick={() => setMode('full')}
              className={
                mode === 'full'
                  ? 'flex-1 rounded-full bg-surface-container-lowest px-3 py-1 text-[11px] font-bold text-primary shadow-sm'
                  : 'flex-1 rounded-full px-3 py-1 text-[11px] font-bold text-on-surface-variant'
              }
            >
              Full
            </button>
            <button
              onClick={() => setMode('mini')}
              className={
                mode === 'mini'
                  ? 'flex-1 rounded-full bg-surface-container-lowest px-3 py-1 text-[11px] font-bold text-primary shadow-sm'
                  : 'flex-1 rounded-full px-3 py-1 text-[11px] font-bold text-on-surface-variant'
              }
            >
              Mini
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
