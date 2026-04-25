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

// v2 Operator — hairline panel, single signal accent, mono timer.
export function CurrentCallPanel({
  call,
  holdEnabled = false,
  onPickup,
  onToggleMute,
  onToggleHold,
  onHangup,
}: Props) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!call?.answeredAt) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [call?.answeredAt]);

  if (!call) {
    return (
      <div className="k-panel p-10">
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-md border border-[var(--line-2)] bg-[var(--bg-2)]">
            <span className="material-symbols-outlined text-2xl text-[var(--fg-3)]">call</span>
          </div>
          <h5 className="text-sm font-semibold text-[var(--fg-1)]">진행 중인 통화 없음</h5>
          <p className="max-w-xs text-xs text-[var(--fg-3)]">
            새 콜이 배정되면 여기에 고객 정보와 통화 제어가 표시됩니다.
          </p>
        </div>
      </div>
    );
  }

  const customer = call.customer;
  const duration = formatCallDuration(call.answeredAt ?? call.startedAt);
  const canPickup = ['QUEUED', 'RINGING_AGENT'].includes(call.sessionStatus) && !call.answeredAt;

  return (
    <div className="k-panel relative overflow-hidden p-6">
      {/* Eyebrow + live dot */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="k-dot k-dot-live" style={{ background: 'var(--signal)' }} />
          <span className="k-eyebrow">LIVE CALL</span>
        </div>
        <span className="k-chip is-talking">
          <span className="k-chip-dot" style={{ background: 'var(--accent-info)' }} />
          통화 중
          <span className="k-chip-code">TALKING</span>
        </span>
      </div>

      <div className="relative z-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        {/* 고객 정보 */}
        <div className="flex min-w-0 items-center gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-md border border-[var(--line-2)] bg-[var(--bg-2)]">
            <span className="material-symbols-outlined text-3xl text-[var(--fg-2)]">person</span>
          </div>
          <div className="min-w-0">
            <h3 className="text-xl font-bold tracking-tight text-[var(--fg-1)]">
              {customer?.customerName ?? '미식별 고객'}
            </h3>
            <p className="mt-1 flex items-center gap-2 text-xs text-[var(--fg-3)]">
              <span className="material-symbols-outlined text-sm">call</span>
              <span className="k-mono text-[var(--fg-2)]">{formatPhoneNumber(call.ani)}</span>
              {customer?.companyName && <span>· {customer.companyName}</span>}
              {customer?.grade && (
                <span className="ml-1 rounded-sm border border-[var(--line-2)] bg-[var(--bg-2)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--fg-1)]">
                  {customer.grade}
                </span>
              )}
            </p>
            <div className="mt-4 flex items-center gap-4">
              <span className="k-num text-3xl font-semibold text-[var(--signal)]">{duration}</span>
              <div className="flex h-5 items-end gap-0.5">
                <div className="waveform-bar w-0.5 rounded-sm" style={{ background: 'var(--signal)', animationDelay: '0.0s' }} />
                <div className="waveform-bar w-0.5 rounded-sm" style={{ background: 'var(--signal)', animationDelay: '0.15s' }} />
                <div className="waveform-bar w-0.5 rounded-sm" style={{ background: 'var(--signal)', animationDelay: '0.3s' }} />
                <div className="waveform-bar w-0.5 rounded-sm" style={{ background: 'var(--signal)', animationDelay: '0.45s' }} />
                <div className="waveform-bar w-0.5 rounded-sm" style={{ background: 'var(--signal)', animationDelay: '0.6s' }} />
              </div>
            </div>
          </div>
        </div>

        {/* 콜 제어 버튼 */}
        <div className="flex flex-wrap gap-2">
          {canPickup ? (
            <button
              onClick={async () => {
                await onPickup();
              }}
              className="k-btn k-btn-primary"
              style={{ height: 36, paddingInline: 16 }}
            >
              <span className="material-symbols-outlined">phone_in_talk</span>
              당겨받기
            </button>
          ) : null}
          <IconButton
            icon={call.isMuted ? 'mic' : 'mic_off'}
            label={call.isMuted ? '음소거 해제' : '음소거'}
            onClick={async () => {
              await onToggleMute();
            }}
          />
          <IconButton
            icon={call.sessionStatus === 'HOLD' ? 'play_arrow' : 'pause'}
            label={call.sessionStatus === 'HOLD' ? '보류 해제' : '보류'}
            disabled={!holdEnabled}
            onClick={async () => {
              await onToggleHold();
            }}
          />
          <IconButton icon="phone_forwarded" label="전환" />
          <button
            onClick={async () => {
              await onHangup();
            }}
            className="k-btn k-btn-danger"
            style={{ height: 36, paddingInline: 18 }}
          >
            <span className="material-symbols-outlined">call_end</span>
            종료
          </button>
        </div>
      </div>
    </div>
  );
}

function IconButton({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: string;
  label: string;
  onClick?: () => void | Promise<void>;
  disabled?: boolean;
}) {
  return (
    <button
      title={label}
      disabled={disabled}
      onClick={() => {
        void onClick?.();
      }}
      className="k-btn k-btn-icon"
      style={{ height: 36, width: 36 }}
    >
      <span className="material-symbols-outlined">{icon}</span>
    </button>
  );
}
