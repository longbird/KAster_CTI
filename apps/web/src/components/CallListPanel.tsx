import { useState } from 'react';
import { useCtiStore } from '../store/useCtiStore';
import { CALL_STATUS_LABEL, CALL_STATUS_COLOR } from './statusMeta';

type FilterMode = 'all' | 'talking' | 'queued';

const CHIPS: { key: FilterMode; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'talking', label: '통화 중' },
  { key: 'queued', label: '대기열' },
];

export function CallListPanel() {
  const activeCalls = useCtiStore((s) => s.activeCalls);
  const selectedCallId = useCtiStore((s) => s.selectedCallId);
  const selectCall = useCtiStore((s) => s.selectCall);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');

  const filtered = activeCalls.filter((c) => {
    if (filter === 'talking' && c.sessionStatus !== 'TALKING') return false;
    if (filter === 'queued' && c.sessionStatus !== 'QUEUED') return false;
    if (q && !(c.ani?.includes(q) || c.customer?.customerName?.includes(q))) return false;
    return true;
  });

  return (
    <aside
      className="flex h-full w-[240px] flex-shrink-0 flex-col"
      style={{
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-subtle)',
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-3"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 13 }}>
          활성 통화
        </span>
        <span
          className="rounded px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
        >
          {activeCalls.length}
        </span>
      </div>

      <div className="flex flex-col gap-2 px-3 py-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="번호/이름 검색"
          className="h-8 rounded px-2 text-[12px] outline-none"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        />
        <div className="flex gap-1">
          {CHIPS.map((chip) => {
            const active = chip.key === filter;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setFilter(chip.key)}
                className="flex-1 rounded py-1 text-[11px] font-semibold transition-colors"
                style={{
                  background: active ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                  border: active ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)',
                }}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {filtered.map((call) => {
          const selected = call.callId === selectedCallId;
          const statusLabel = CALL_STATUS_LABEL[call.sessionStatus] ?? call.sessionStatus;
          const statusColor = CALL_STATUS_COLOR[call.sessionStatus] ?? 'var(--text-secondary)';
          return (
            <button
              key={call.callId}
              type="button"
              onClick={() => selectCall(call.callId)}
              className="mb-2 block w-full rounded-md p-3 text-left transition-colors"
              style={{
                background: selected ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                border: `1px solid ${selected ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
              }}
            >
              <div style={{ color: statusColor, fontSize: 10, fontWeight: 600, marginBottom: 2 }}>
                ● {statusLabel}
              </div>
              <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>
                {call.customer?.customerName ?? call.ani ?? '미식별'}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                {call.queueName} · {call.ani}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
