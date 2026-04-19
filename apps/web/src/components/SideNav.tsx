import { useUiStore, type FullWorkspaceSection } from '../store/useUiStore';

interface NavItem {
  key: FullWorkspaceSection;
  label: string;
  icon: string;
}

const ITEMS: NavItem[] = [
  { key: 'overview', label: '개요', icon: 'dashboard' },
  { key: 'call', label: '콜 센터', icon: 'headset_mic' },
  { key: 'queues', label: '큐 현황', icon: 'stacked_line_chart' },
  { key: 'history', label: '이력', icon: 'history' },
];

// 좌측 영구 사이드바. 현재 프로젝트는 single-page 라 실제 라우팅은 없지만
// 디자인 시스템을 맞추기 위해 active 상태만 overview 로 표시.
export function SideNav() {
  const mode = useUiStore((s) => s.mode);
  const fullSection = useUiStore((s) => s.fullSection);
  const setMode = useUiStore((s) => s.setMode);
  const setFullSection = useUiStore((s) => s.setFullSection);

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col bg-surface-container-low pb-8 pt-20 md:flex">
      <div className="mb-10 px-8">
        <h2 className="font-headline text-xl font-extrabold tracking-tight text-primary">
          상담원 포털
        </h2>
        <p className="mt-1 font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
          KAster CTI
        </p>
      </div>

      <nav className="flex-1 space-y-1">
        {ITEMS.map((item) => {
          const isActive = item.key === fullSection;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setFullSection(item.key)}
              className={
                isActive
                  ? 'ml-4 flex w-[calc(100%-1rem)] items-center gap-3 rounded-l-full bg-surface-container-lowest px-6 py-3 text-left font-bold text-primary shadow-sm transition-all duration-300 ease-in-out'
                  : 'ml-4 flex w-[calc(100%-1rem)] items-center gap-3 px-6 py-3 text-left text-on-surface-variant transition-all duration-300 ease-in-out hover:text-primary'
              }
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="font-label text-sm">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto px-6">
        <div className="rounded-lg bg-surface-container p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            화면 모드
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
              전체
            </button>
            <button
              onClick={() => setMode('mini')}
              className={
                mode === 'mini'
                  ? 'flex-1 rounded-full bg-surface-container-lowest px-3 py-1 text-[11px] font-bold text-primary shadow-sm'
                  : 'flex-1 rounded-full px-3 py-1 text-[11px] font-bold text-on-surface-variant'
              }
            >
              미니
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
