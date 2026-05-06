import dayjs from 'dayjs';
import { useCtiStore } from '../store/useCtiStore';
import type { EventLogItem } from '../types/cti';

const TYPE_META: Record<EventLogItem['type'], { label: string; icon: string; tone: string }> = {
  'call.created': {
    label: '신규 콜',
    icon: 'add_call',
    tone: 'bg-primary/10 text-primary',
  },
  'call.updated': {
    label: '콜 변경',
    icon: 'sync',
    tone: 'bg-secondary-container text-on-secondary-container',
  },
  'call.ended': { label: '통화 종료', icon: 'call_end', tone: 'bg-error-container/30 text-error' },
  'screenpop.customer': {
    label: '고객 팝업',
    icon: 'person',
    tone: 'bg-surface-container-high text-on-surface-variant',
  },
  'agent.status.changed': {
    label: '상담원 상태',
    icon: 'how_to_reg',
    tone: 'bg-tertiary/10 text-tertiary',
  },
  'queue.summary.updated': {
    label: '큐 갱신',
    icon: 'stacked_line_chart',
    tone: 'bg-surface-container-high text-on-surface-variant',
  },
  info: { label: '안내', icon: 'info', tone: 'bg-surface-container text-on-surface-variant' },
};

// "The Precision Curator" Real-time Events feed.
// 테두리 없고 divider 없음. 항목 사이 공백만.
export function EventLogPanel() {
  const events = useCtiStore((s) => s.eventLog);

  return (
    <div
      className="min-w-0 overflow-hidden rounded-lg p-3"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h4 style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>
          실시간 이벤트
        </h4>
        <span
          style={{
            color: 'var(--accent)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          실시간
        </span>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div
            className="mb-2 flex h-10 w-10 items-center justify-center rounded-full"
            style={{ background: 'var(--bg-raised)' }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 20, color: 'var(--text-secondary)' }}
            >
              history_toggle_off
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
            최근 이벤트 없음
          </p>
        </div>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto overflow-x-hidden pr-1">
          {events.map((item) => {
            const meta = TYPE_META[item.type];
            return (
              <li
                key={item.id}
                className="flex items-start gap-2 rounded p-2"
                style={{ background: 'var(--bg-surface)' }}
              >
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${meta.tone}`}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                    {meta.icon}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="truncate"
                      style={{
                        color: 'var(--text-secondary)',
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {meta.label}
                    </span>
                    <span
                      className="shrink-0"
                      style={{ color: 'var(--text-muted)', fontSize: 10 }}
                    >
                      {dayjs(item.timestamp).format('HH:mm:ss')}
                    </span>
                  </div>
                  <p
                    className="mt-0.5 truncate"
                    style={{ color: 'var(--text-primary)', fontSize: 12 }}
                  >
                    {item.message}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
