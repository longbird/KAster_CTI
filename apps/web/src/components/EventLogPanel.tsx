import dayjs from 'dayjs';
import { useCtiStore } from '../store/useCtiStore';
import type { EventLogItem } from '../types/cti';

const TYPE_META: Record<EventLogItem['type'], { label: string; icon: string; tone: string }> = {
  'call.created': {
    label: 'New Call',
    icon: 'add_call',
    tone: 'bg-primary/10 text-primary',
  },
  'call.updated': {
    label: 'Call Update',
    icon: 'sync',
    tone: 'bg-secondary-container text-on-secondary-container',
  },
  'call.ended': { label: 'Call Ended', icon: 'call_end', tone: 'bg-error-container/30 text-error' },
  'screenpop.customer': {
    label: 'Screen Pop',
    icon: 'person',
    tone: 'bg-surface-container-high text-on-surface-variant',
  },
  'agent.status.changed': {
    label: 'Agent Status',
    icon: 'how_to_reg',
    tone: 'bg-tertiary/10 text-tertiary',
  },
  'queue.summary.updated': {
    label: 'Queue Update',
    icon: 'stacked_line_chart',
    tone: 'bg-surface-container-high text-on-surface-variant',
  },
  info: { label: 'Info', icon: 'info', tone: 'bg-surface-container text-on-surface-variant' },
};

// "The Precision Curator" Real-time Events feed.
// 테두리 없고 divider 없음. 항목 사이 공백만.
export function EventLogPanel() {
  const events = useCtiStore((s) => s.eventLog);

  return (
    <div className="rounded-lg bg-surface-container-low p-1">
      <div className="rounded-lg bg-surface-container-lowest p-6">
        <div className="mb-6 flex items-center justify-between">
          <h4 className="font-headline text-base font-bold text-on-surface">Real-time Events</h4>
          <span className="text-[10px] font-bold uppercase tracking-widest text-outline">
            Live Feed
          </span>
        </div>

        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-container">
              <span className="material-symbols-outlined text-3xl text-outline">
                history_toggle_off
              </span>
            </div>
            <h5 className="font-headline text-base font-semibold text-on-surface">
              No recent events
            </h5>
            <p className="mt-2 max-w-xs text-sm text-outline">
              New incoming activity, call transfers, and queue updates will appear here automatically.
            </p>
          </div>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {events.map((item) => {
              const meta = TYPE_META[item.type];
              return (
                <li
                  key={item.id}
                  className="flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-surface-container-high/50"
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.tone}`}
                  >
                    <span className="material-symbols-outlined text-base">{meta.icon}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-label text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                        {meta.label}
                      </span>
                      <span className="text-[11px] text-outline">
                        {dayjs(item.timestamp).format('HH:mm:ss')}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-on-surface">{item.message}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
