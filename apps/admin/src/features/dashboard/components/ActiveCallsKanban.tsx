import { Card, Typography } from 'antd';
import { useEffect, useMemo, useRef } from 'react';
import type { ActiveCallItem } from '../types/dashboard';
import type { CallRow } from '../../live-calls/CallDetailDrawer';
import { CallKanbanColumn } from '../../../shared/components/CallKanbanColumn';
import { KANBAN_COLUMNS, groupByKanbanColumn, toKanbanColumn } from '../../../shared/lib/callStatusMap';
import { useNow } from '../../../shared/hooks/useNow';

interface StampCache {
  queuedAt?: string;
  answeredAt?: string;
}

function makeAdapter() {
  const cache = new Map<string, StampCache>();

  const adapt = (item: ActiveCallItem): CallRow => {
    const existing = cache.get(item.id) ?? {};
    const column = toKanbanColumn(item.status);
    const nowMs = Date.now();

    if (!existing.queuedAt && (column === 'queued' || column === 'ringing' || column === 'talking' || column === 'acw')) {
      const queuedMs = nowMs - Math.max(0, item.waitingSec) * 1000;
      existing.queuedAt = new Date(queuedMs).toISOString();
    }
    if (!existing.answeredAt && column === 'talking') {
      const answeredMs = nowMs - Math.max(0, item.talkingSec) * 1000;
      existing.answeredAt = new Date(answeredMs).toISOString();
    }
    cache.set(item.id, existing);

    return {
      callId: item.id,
      linkedid: item.id,
      ani: item.customerPhone,
      queueName: item.queueName,
      agentName: item.agentName,
      sessionStatus: item.status,
      queuedAt: existing.queuedAt,
      answeredAt: existing.answeredAt,
      talkSeconds: item.talkingSec,
      waitSeconds: item.waitingSec,
    };
  };

  const prune = (liveIds: Set<string>) => {
    for (const id of cache.keys()) {
      if (!liveIds.has(id)) cache.delete(id);
    }
  };

  return { adapt, prune };
}

export function ActiveCallsKanban({ items }: { items: ActiveCallItem[] }) {
  const now = useNow(1000);
  const adapterRef = useRef<ReturnType<typeof makeAdapter> | null>(null);
  if (adapterRef.current === null) adapterRef.current = makeAdapter();

  const rows = useMemo(() => items.map((i) => adapterRef.current!.adapt(i)), [items]);

  useEffect(() => {
    adapterRef.current!.prune(new Set(items.map((i) => i.id)));
  }, [items]);

  const grouped = useMemo(() => groupByKanbanColumn(rows), [rows]);

  return (
    <Card
      size="small"
      title={
        <span>
          🔴 실시간 활성 콜{' '}
          <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 11 }}>
            (총 {items.length}건)
          </Typography.Text>
        </span>
      }
      bodyStyle={{ padding: 10, height: 'calc(100% - 40px)' }}
      style={{ height: '100%' }}
    >
      <div className="active-calls-kanban">
        {KANBAN_COLUMNS.map((col) => (
          <CallKanbanColumn
            key={col.id}
            column={col}
            items={grouped[col.id] ?? []}
            now={now}
            variant="mini"
          />
        ))}
      </div>
    </Card>
  );
}
