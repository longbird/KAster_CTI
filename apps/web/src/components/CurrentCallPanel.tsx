import {
  ClockCircleOutlined,
  CrownOutlined,
  PhoneOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Card, Empty, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import type { ActiveCall } from '../types/cti';
import { SESSION_META, TONE_CLASS } from './statusMeta';

interface CurrentCallPanelProps {
  call?: ActiveCall;
}

function formatDurationSince(iso?: string): string {
  if (!iso) return '-';
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function gradeTone(grade?: string): string {
  if (grade === 'VIP') return 'bg-amber-100 text-amber-700 border-amber-200';
  if (grade === 'GOLD') return 'bg-yellow-100 text-yellow-700 border-yellow-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
}

export function CurrentCallPanel({ call }: CurrentCallPanelProps) {
  if (!call) {
    return (
      <Card
        className="rounded-2xl border border-slate-200/70 shadow-sm"
        bodyStyle={{ padding: 48 }}
      >
        <div className="flex flex-col items-center gap-3">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Typography.Text type="secondary">현재 진행 중인 통화가 없습니다</Typography.Text>
            }
          />
          <Typography.Text type="secondary" className="text-xs">
            새 콜이 배정되면 여기에 고객 정보와 통화 세부 정보가 표시됩니다.
          </Typography.Text>
        </div>
      </Card>
    );
  }

  const meta = SESSION_META[call.sessionStatus];
  const customer = call.customer;

  return (
    <Card
      className={`rounded-2xl border shadow-sm ${TONE_CLASS[meta.tone]}`}
      bodyStyle={{ padding: 24 }}
    >
      {/* Hero: 고객 / 상태 */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar
            size={64}
            icon={<UserOutlined />}
            className="!bg-white !text-slate-500"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title level={3} className="!mb-0 !text-slate-800">
                {customer?.customerName ?? '미식별 고객'}
              </Typography.Title>
              {customer?.grade && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${gradeTone(
                    customer.grade,
                  )}`}
                >
                  <CrownOutlined className="text-[10px]" />
                  {customer.grade}
                </span>
              )}
            </div>
            <Typography.Text type="secondary" className="text-sm">
              <PhoneOutlined className="mr-1" />
              {call.ani ?? '-'}
              {customer?.companyName && (
                <span className="ml-2">· {customer.companyName}</span>
              )}
            </Typography.Text>
          </div>
        </div>
        <Tag color={meta.color} className="!m-0 !rounded-full !px-3 !py-1 !text-sm">
          {meta.label}
        </Tag>
      </div>

      {/* 통화 메타 pill row */}
      <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-white/80 p-3 sm:grid-cols-4">
        <MetaCell
          icon={<ClockCircleOutlined />}
          label="통화 시간"
          value={formatDurationSince(call.answeredAt)}
        />
        <MetaCell
          label="대기 시간"
          value={
            call.queuedAt && call.answeredAt
              ? `${Math.max(
                  0,
                  Math.floor(
                    (new Date(call.answeredAt).getTime() - new Date(call.queuedAt).getTime()) / 1000,
                  ),
                )}s`
              : '-'
          }
        />
        <MetaCell label="큐" value={call.queueName ?? '-'} />
        <MetaCell
          label="시작"
          value={call.startedAt ? dayjs(call.startedAt).format('HH:mm:ss') : '-'}
        />
      </div>

      {/* 고객 메모 + 최근 주문 */}
      {customer?.memo && (
        <div className="mt-4 rounded-xl border border-slate-200/70 bg-white/80 p-3">
          <Typography.Text type="secondary" className="text-xs font-medium uppercase tracking-wide">
            고객 메모
          </Typography.Text>
          <Typography.Paragraph className="!mb-0 !mt-1 !text-slate-700">
            {customer.memo}
          </Typography.Paragraph>
        </div>
      )}

      {customer?.recentOrders && customer.recentOrders.length > 0 && (
        <div className="mt-4">
          <Typography.Text
            type="secondary"
            className="mb-2 block text-xs font-medium uppercase tracking-wide"
          >
            최근 주문
          </Typography.Text>
          <div className="flex flex-wrap gap-2">
            {customer.recentOrders.map((order, idx) => (
              <span
                key={idx}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
              >
                {order}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 저수준 기술 정보 (접어서 보여주기) */}
      <details className="mt-4 rounded-lg bg-slate-50/50 p-2 text-xs">
        <summary className="cursor-pointer select-none text-slate-500">
          기술 정보 (linkedid / dnis / ids)
        </summary>
        <div className="mt-2 space-y-1 text-slate-500">
          <div>
            <span className="text-slate-400">callId:</span> {call.callId}
          </div>
          <div>
            <span className="text-slate-400">linkedid:</span> {call.linkedid}
          </div>
          <div>
            <span className="text-slate-400">DNIS:</span> {call.dnis ?? '-'}
          </div>
        </div>
      </details>
    </Card>
  );
}

function MetaCell({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </div>
      <div className="truncate text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}
