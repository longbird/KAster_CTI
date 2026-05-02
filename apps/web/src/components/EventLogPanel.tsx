import dayjs from 'dayjs';
import { useCtiStore } from '../store/useCtiStore';
import type { EventLogItem } from '../types/cti';

const TYPE_META: Record<EventLogItem['type'], { label: string; icon: string; color: string; bg: string }> = {
  'call.created':          { label: '신규 콜',   icon: 'add_call',            color: 'var(--signal)',        bg: 'var(--signal-soft)' },
  'call.updated':          { label: '콜 변경',   icon: 'sync',                color: 'var(--accent-info)',   bg: 'var(--accent-info-soft)' },
  'call.ended':            { label: '통화 종료', icon: 'call_end',            color: 'var(--accent-danger)', bg: 'var(--accent-danger-soft)' },
  'screenpop.customer':    { label: '고객 팝업', icon: 'person',              color: 'var(--fg-2)',          bg: 'var(--bg-2)' },
  'agent.status.changed':  { label: '상담원 상태', icon: 'how_to_reg',         color: 'var(--accent-warn)',   bg: 'var(--accent-warn-soft)' },
  'queue.summary.updated': { label: '큐 갱신',   icon: 'stacked_line_chart', color: 'var(--fg-2)',          bg: 'var(--bg-2)' },
  info:                    { label: '안내',      icon: 'info',                color: 'var(--fg-2)',          bg: 'var(--bg-2)' },
};

// v2 Operator — hairline rows, mono timestamp.
export function EventLogPanel() {
  const events = useCtiStore((s) => s.eventLog);

  return (
    <div className="k-panel">
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--line-1)' }}>
        <h4 className="text-[15px] font-semibold text-[var(--fg-1)]">실시간 이벤트</h4>
        <div className="flex items-center gap-1.5">
          <span className="k-dot k-dot-live" style={{ background: 'var(--signal)' }} />
          <span className="k-eyebrow">LIVE</span>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div
            className="mb-3 flex h-12 w-12 items-center justify-center rounded-md"
            style={{ border: '1px solid var(--line-2)', background: 'var(--bg-2)' }}
          >
            <span className="material-symbols-outlined text-2xl text-[var(--fg-3)]">history_toggle_off</span>
          </div>
          <h5 className="text-sm font-semibold text-[var(--fg-1)]">최근 이벤트 없음</h5>
          <p className="mt-1 max-w-xs text-[11px] text-[var(--fg-3)]">
            신규 수신, 통화 전환, 큐 변경 내역이 자동으로 여기에 표시됩니다.
          </p>
        </div>
      ) : (
        <ul className="max-h-80 overflow-y-auto">
          {events.map((item, idx) => {
            const meta = TYPE_META[item.type];
            return (
              <li
                key={item.id}
                className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-[var(--bg-2)]"
                style={{ borderBottom: idx !== events.length - 1 ? '1px solid var(--line-1)' : undefined }}
              >
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm"
                  style={{ background: meta.bg, border: `1px solid ${meta.color}`, color: meta.color }}
                >
                  <span className="material-symbols-outlined text-[14px]">{meta.icon}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="k-eyebrow" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="k-mono text-[10px] text-[var(--fg-3)]">
                      {dayjs(item.timestamp).format('HH:mm:ss')}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-[var(--fg-1)]">{item.message}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
