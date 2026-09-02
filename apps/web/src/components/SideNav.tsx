import { useState } from 'react';
import { useUiStore, type FullWorkspaceSection } from '../store/useUiStore';
import { useAuthStore } from '../store/useAuthStore';

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

export function SideNav() {
  const fullSection = useUiStore((s) => s.fullSection);
  const setFullSection = useUiStore((s) => s.setFullSection);
  const agent = useAuthStore((s) => s.agent);
  const initial = agent?.agentName?.[0] ?? 'A';
  const [hoveredKey, setHoveredKey] = useState<FullWorkspaceSection | null>(null);

  return (
    <aside
      className="fixed left-0 top-0 z-40 hidden h-screen w-14 flex-col items-center py-3 md:flex"
      style={{
        background: 'var(--bg-base)',
        borderRight: '1px solid var(--border-subtle)',
      }}
    >
      <div
        className="mb-3 flex h-[30px] w-[30px] items-center justify-center rounded-lg text-caption font-extrabold"
        style={{
          color: 'var(--gradient-primary-fg)',
          background: 'linear-gradient(135deg, var(--accent-strong), var(--accent))',
          boxShadow: '0 0 12px var(--accent-glow)',
        }}
        title="KASTER CTI"
      >
        K
      </div>

      <nav className="flex flex-col gap-1">
        {ITEMS.map((item) => {
          const isActive = item.key === fullSection;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setFullSection(item.key)}
              title={item.label}
              className="relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors"
              style={{
                background: isActive
                  ? 'var(--accent-dim)'
                  : hoveredKey === item.key
                    ? 'var(--bg-elevated)'
                    : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              }}
              onMouseEnter={() => setHoveredKey(item.key)}
              onMouseLeave={() => setHoveredKey(null)}
            >
              {isActive && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r"
                  style={{ background: 'var(--accent)' }}
                />
              )}
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                {item.icon}
              </span>
            </button>
          );
        })}
      </nav>

      <div
        className="mt-auto flex h-[30px] w-[30px] items-center justify-center rounded-full text-caption font-bold"
        style={{
          background: 'var(--bg-raised)',
          color: 'var(--accent)',
        }}
        title={agent?.agentName ?? '상담원'}
      >
        {initial}
      </div>
    </aside>
  );
}
