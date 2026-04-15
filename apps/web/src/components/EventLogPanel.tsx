import { BellOutlined } from '@ant-design/icons';
import { Card, Empty, Typography } from 'antd';
import dayjs from 'dayjs';
import { useCtiStore } from '../store/useCtiStore';
import type { EventLogItem } from '../types/cti';

const TYPE_LABEL: Record<EventLogItem['type'], { label: string; tone: string }> = {
  'call.created': { label: '신규 콜', tone: 'bg-blue-50 text-blue-600 border-blue-200' },
  'call.updated': { label: '상태 변경', tone: 'bg-sky-50 text-sky-600 border-sky-200' },
  'call.ended': { label: '통화 종료', tone: 'bg-rose-50 text-rose-600 border-rose-200' },
  'screenpop.customer': { label: '고객 팝업', tone: 'bg-amber-50 text-amber-600 border-amber-200' },
  'agent.status.changed': {
    label: '상담원 상태',
    tone: 'bg-purple-50 text-purple-600 border-purple-200',
  },
  'queue.summary.updated': {
    label: '큐 갱신',
    tone: 'bg-cyan-50 text-cyan-600 border-cyan-200',
  },
  info: { label: '정보', tone: 'bg-slate-50 text-slate-600 border-slate-200' },
};

export function EventLogPanel() {
  const events = useCtiStore((s) => s.eventLog);

  return (
    <Card
      title={
        <span className="text-base font-semibold text-slate-800">
          <BellOutlined className="mr-2" />실시간 이벤트
        </span>
      }
      className="rounded-2xl border border-slate-200/70 shadow-sm"
      bodyStyle={{ padding: 0, maxHeight: 360, overflow: 'auto' }}
    >
      {events.length === 0 ? (
        <div className="p-8">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Typography.Text type="secondary">아직 수신된 이벤트가 없습니다</Typography.Text>
            }
          />
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {events.map((item) => {
            const meta = TYPE_LABEL[item.type];
            return (
              <li key={item.id} className="px-4 py-3 hover:bg-slate-50/60">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.tone}`}
                  >
                    {meta.label}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {dayjs(item.timestamp).format('HH:mm:ss')}
                  </span>
                </div>
                <div className="mt-1 text-sm text-slate-700">{item.message}</div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
