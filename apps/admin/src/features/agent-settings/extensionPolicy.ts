export type ExtensionLockMode = 'UNLOCKED' | 'OUTBOUND_LOCKED' | 'FULL_LOCKED';

export const EXTENSION_LOCK_MODE_OPTIONS: Array<{ value: ExtensionLockMode; label: string }> = [
  { value: 'UNLOCKED', label: '미잠금' },
  { value: 'OUTBOUND_LOCKED', label: '외부발신 잠금' },
  { value: 'FULL_LOCKED', label: '전체 잠금' },
];

const EXTENSION_LOCK_MODE_LABELS = Object.fromEntries(
  EXTENSION_LOCK_MODE_OPTIONS.map((item) => [item.value, item.label]),
) as Record<ExtensionLockMode, string>;

export function getExtensionLockModeLabel(mode?: string | null) {
  if (!mode) return EXTENSION_LOCK_MODE_LABELS.UNLOCKED;
  return EXTENSION_LOCK_MODE_LABELS[mode as ExtensionLockMode] ?? mode;
}
