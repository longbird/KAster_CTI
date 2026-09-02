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

/**
 * 칸반 열의 accent 는 **열을 구분하는 표식**이지 통화 상태의 심각도가 아니다.
 * (통화 한 건의 상태는 카드의 태그와 왼쪽 테두리가 나른다.)
 * 그래서 네 열이 서로 다른 색을 갖되, 값은 토큰에서만 가져온다.
 */
export const KANBAN_COLUMNS: readonly KanbanColumnMeta[] = [
  { id: 'queued', label: '대기', accentVar: 'var(--accent-warn)', emptyText: '대기 중인 통화 없음' },
  { id: 'ringing', label: '벨 울림', accentVar: 'var(--accent-info)', emptyText: '호출 중인 통화 없음' },
  { id: 'talking', label: '통화 중', accentVar: 'var(--signal)', emptyText: '통화 중 없음' },
  { id: 'acw', label: '후처리', accentVar: 'var(--status-acw)', emptyText: '후처리 없음' },
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
