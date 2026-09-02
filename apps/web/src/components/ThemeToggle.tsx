import { useUiStore } from '../store/useUiStore';

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const themeMode = useUiStore((s) => s.themeMode);
  const setThemeMode = useUiStore((s) => s.setThemeMode);

  return (
    <div className="inline-flex items-center rounded-full border border-outline-variant/25 bg-surface-container p-1 shadow-sm">
      <ThemeButton
        active={themeMode === 'light'}
        icon="light_mode"
        label={compact ? '라이트' : '라이트 모드'}
        onClick={() => setThemeMode('light')}
        compact={compact}
      />
      <ThemeButton
        active={themeMode === 'dark'}
        icon="dark_mode"
        label={compact ? '다크' : '다크 모드'}
        onClick={() => setThemeMode('dark')}
        compact={compact}
      />
    </div>
  );
}

function ThemeButton({
  active,
  icon,
  label,
  onClick,
  compact,
}: {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
  compact: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-caption font-bold tracking-wide transition-all ${
        active
          ? 'bg-surface-container-lowest text-primary shadow-sm'
          : 'text-on-surface-variant hover:text-on-surface'
      }`}
      title={label}
    >
      <span className="material-symbols-outlined text-base leading-none">{icon}</span>
      {!compact ? <span>{label}</span> : null}
    </button>
  );
}
