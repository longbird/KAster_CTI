export type TimeSyncStatus = 'OK' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';

const STATUS_META: Record<TimeSyncStatus, { label: string; color: string }> = {
  OK: { label: '정상', color: 'success' },
  WARNING: { label: '주의', color: 'warning' },
  CRITICAL: { label: '위험', color: 'error' },
  UNKNOWN: { label: '확인 불가', color: 'default' },
};

export function getTimeSyncStatusMeta(status?: string | null) {
  return STATUS_META[(status as TimeSyncStatus) ?? 'UNKNOWN'] ?? STATUS_META.UNKNOWN;
}
