export type KanbanColumn = 'queued' | 'ringing' | 'talking' | 'acw';

const STATUS_TO_COLUMN: Record<string, KanbanColumn> = {
  NEW: 'queued',
  QUEUED: 'queued',
  RINGING_AGENT: 'ringing',
  TALKING: 'talking',
  HOLD: 'talking',
  TRANSFERRING: 'talking',
  AFTER_CALL_WORK: 'acw',
};

export function toKanbanColumn(status: string | null | undefined): KanbanColumn {
  if (!status) return 'queued';
  return STATUS_TO_COLUMN[status] ?? 'queued';
}

export interface KanbanColumnMeta {
  id: KanbanColumn;
  label: string;
  accentVar: string;
  emptyText: string;
}

export const KANBAN_COLUMNS: readonly KanbanColumnMeta[] = [
  { id: 'queued', label: '대기', accentVar: '#f59e0b', emptyText: '대기 중인 통화 없음' },
  { id: 'ringing', label: '벨 울림', accentVar: '#3b82f6', emptyText: '호출 중인 통화 없음' },
  { id: 'talking', label: '통화 중', accentVar: '#10b981', emptyText: '통화 중 없음' },
  { id: 'acw', label: '후처리', accentVar: '#8b5cf6', emptyText: '후처리 없음' },
];

export function groupByKanbanColumn<T extends { status?: string | null; sessionStatus?: string | null }>(
  items: readonly T[],
): Record<KanbanColumn, T[]> {
  const result: Record<KanbanColumn, T[]> = { queued: [], ringing: [], talking: [], acw: [] };
  for (const item of items) {
    const col = toKanbanColumn(item.sessionStatus ?? item.status);
    result[col].push(item);
  }
  return result;
}
