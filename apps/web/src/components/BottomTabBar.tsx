import { useUiStore, type FullWorkspaceSection } from '../store/useUiStore';

const TABS: { key: FullWorkspaceSection; label: string; icon: string }[] = [
  { key: 'overview', label: '개요', icon: 'dashboard' },
  { key: 'call', label: '콜센터', icon: 'headset_mic' },
  { key: 'queues', label: '큐', icon: 'stacked_line_chart' },
  { key: 'history', label: '이력', icon: 'history' },
];

export function BottomTabBar() {
  const fullSection = useUiStore((s) => s.fullSection);
  const setFullSection = useUiStore((s) => s.setFullSection);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-14 border-t border-outline-variant/20 bg-surface-container-lowest md:hidden">
      {TABS.map((tab) => {
        const isActive = tab.key === fullSection;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFullSection(tab.key)}
            className={`flex flex-1 flex-col items-center justify-center gap-1 transition-colors ${
              isActive ? 'text-primary' : 'text-on-surface-variant'
            }`}
          >
            <span className="material-symbols-outlined text-xl leading-none">
              {tab.icon}
            </span>
            <span className="text-micro font-bold uppercase tracking-wider">
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
