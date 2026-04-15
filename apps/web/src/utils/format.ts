import dayjs from 'dayjs';

export function formatDateTime(value?: string): string {
  if (!value) return '-';
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss');
}

export function formatDuration(totalSeconds?: number): string {
  if (!totalSeconds && totalSeconds !== 0) return '-';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}
