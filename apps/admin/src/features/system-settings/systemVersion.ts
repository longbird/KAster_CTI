export interface SystemVersionView {
  version: string;
  commit: string | null;
  buildTime: string | null;
  nodeVersion: string | null;
  nodeId: string | null;
  startedAt: string;
  uptimeSeconds: number;
}

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

export function formatUptime(seconds?: number | null): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '-';

  const days = Math.floor(seconds / SECONDS_PER_DAY);
  const hours = Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}일`);
  if (days > 0 || hours > 0) parts.push(`${hours}시간`);
  parts.push(`${minutes}분`);

  return parts.join(' ');
}
