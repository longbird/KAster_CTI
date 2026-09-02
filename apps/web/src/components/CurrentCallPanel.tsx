import { useEffect, useState } from 'react';
import type { ActiveCall } from '../types/cti';
import { formatPhoneNumber } from '../utils/format';

interface Props {
  call?: ActiveCall;
  holdEnabled?: boolean;
  onPickup: () => Promise<void>;
  onToggleMute: () => Promise<void>;
  onToggleHold: () => Promise<void>;
  onHangup: () => Promise<void>;
}

function formatCallDuration(iso?: string): string {
  if (!iso) return '00:00';
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function CurrentCallPanel({
  call,
  holdEnabled = false,
  onPickup,
  onToggleMute,
  onToggleHold,
  onHangup,
}: Props) {
  // 1초마다 통화 시간 리렌더
  const [, tick] = useState(0);
  useEffect(() => {
    if (!call?.answeredAt) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [call?.answeredAt]);

  if (!call) {
    return (
      <section
        className="rounded-xl p-5"
        style={{
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--accent) 14%, var(--bg-surface)), color-mix(in srgb, var(--accent) 6%, var(--bg-surface)))',
          border: '1px solid var(--accent-border)',
          boxShadow: '0 0 24px rgba(52,211,153,0.08)',
        }}
      >
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full"
            style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)' }}
          >
            <span className="material-symbols-outlined" style={{ color: 'var(--accent)', fontSize: 22 }}>
              call
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>진행 중인 통화 없음</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: 11, opacity: 0.7 }}>
            새 콜이 배정되면 여기에 고객 정보와 통화 제어가 표시됩니다.
          </p>
        </div>
      </section>
    );
  }

  const customer = call.customer;
  const displayName = customer?.customerName ?? (call.ani ? formatPhoneNumber(call.ani) : '미식별 고객');
  const initial = displayName[0]?.toUpperCase() ?? '?';
  const duration = formatCallDuration(call.answeredAt ?? call.startedAt);
  const canPickup = ['QUEUED', 'RINGING_AGENT'].includes(call.sessionStatus) && !call.answeredAt;
  const isOnHold = call.sessionStatus === 'HOLD';

  return (
    <section
      className="rounded-xl p-5"
      style={{
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--accent) 14%, var(--bg-surface)), color-mix(in srgb, var(--accent) 6%, var(--bg-surface)))',
        border: '1px solid var(--accent-border)',
        boxShadow: '0 0 24px rgba(52,211,153,0.08)',
      }}
    >
      {/* Header row: avatar + info + timer */}
      <div className="flex items-center gap-4">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)' }}
        >
          <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 16 }}>{initial}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div
            className="truncate"
            style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 16 }}
          >
            {displayName}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
            {formatPhoneNumber(call.ani)}
            {call.queueName ? ` · ${call.queueName}` : ''}
            {customer?.companyName ? ` · ${customer.companyName}` : ''}
          </div>
        </div>

        <div
          style={{
            color: 'var(--accent)',
            fontSize: 28,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            textShadow: '0 0 16px var(--accent-glow)',
          }}
        >
          {duration}
        </div>
      </div>

      {/* Control row */}
      <div className="mt-4 flex items-center gap-2">
        {canPickup ? (
          <button
            type="button"
            onClick={() => { void onPickup(); }}
            className="flex-1 rounded-md py-2 text-sm font-semibold transition-opacity hover:opacity-90 active:opacity-75"
            style={{ background: 'var(--accent-strong)', color: 'var(--gradient-primary-fg)' }}
          >
            당겨받기
          </button>
        ) : (
          /* spacer keeps layout stable when pickup is not shown */
          <div className="flex-1" />
        )}

        <IconButton
          icon={call.isMuted ? 'mic' : 'mic_off'}
          onClick={() => { void onToggleMute(); }}
          title={call.isMuted ? '음소거 해제' : '음소거'}
          active={call.isMuted}
        />

        <IconButton
          icon={isOnHold ? 'play_arrow' : 'pause'}
          onClick={() => { void onToggleHold(); }}
          title={isOnHold ? '보류 해제' : '보류'}
          disabled={!holdEnabled}
        />

        <button
          type="button"
          onClick={() => { void onHangup(); }}
          className="rounded-md px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-90 active:opacity-75"
          style={{
            background: 'transparent',
            color: 'var(--tone-danger)',
            border: '1px solid rgba(248,81,73,0.3)',
          }}
        >
          종료
        </button>
      </div>
    </section>
  );
}

function IconButton({
  icon,
  onClick,
  title,
  active = false,
  disabled = false,
}: {
  icon: string;
  onClick: () => void;
  title?: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="flex h-9 w-9 items-center justify-center rounded-md transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        background: active ? 'var(--accent-dim)' : 'var(--bg-elevated)',
        border: `1px solid ${active ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
        color: active ? 'var(--accent)' : 'var(--text-primary)',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{icon}</span>
    </button>
  );
}
