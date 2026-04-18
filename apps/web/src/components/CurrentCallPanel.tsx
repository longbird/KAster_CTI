import { useEffect, useState } from 'react';
import type { ActiveCall } from '../types/cti';

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

// "The Precision Curator" 의 Active Call Panel — 프라이머리 그라디언트 hero 카드.
// glassmorphism 컨트롤 + 고정 waveform.
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
      <div className="rounded-lg bg-surface-container-lowest p-12 shadow-panel">
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container">
            <span className="material-symbols-outlined text-3xl text-outline">call</span>
          </div>
          <h5 className="font-headline text-base font-semibold text-on-surface">진행 중인 통화 없음</h5>
          <p className="max-w-xs text-sm text-outline">
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
    <div
      className="relative overflow-hidden rounded-xl p-8 text-white shadow-panel"
      style={{ background: 'linear-gradient(135deg, #003fb1 0%, #1a56db 100%)' }}
    >
      {/* Decorative blur */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/5 blur-3xl" />

      <div className="relative z-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        {/* 고객 정보 */}
        <div className="flex min-w-0 items-center gap-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-white/10 backdrop-blur-md">
            <span className="material-symbols-outlined text-4xl">person</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-headline text-2xl font-bold tracking-tight">
              {customer?.customerName ?? '미식별 고객'}
            </h3>
            <p className="mt-1 flex items-center gap-2 font-label text-sm text-blue-100">
              <span className="material-symbols-outlined text-sm">call</span>
              {call.ani ?? '-'}
              {customer?.companyName && <span>· {customer.companyName}</span>}
              {customer?.grade && (
                <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">
                  {customer.grade}
                </span>
              )}
            </p>
            <div className="mt-4 flex items-center gap-3">
              <span className="rounded-full bg-tertiary-fixed px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-tertiary">
                진행 중 통화
              </span>
              <span className="font-headline text-lg font-bold">{duration}</span>
              <div className="flex h-5 items-end gap-0.5">
                <div
                  className="waveform-bar w-0.5 rounded-full bg-tertiary-fixed"
                  style={{ animationDelay: '0.0s' }}
                />
                <div
                  className="waveform-bar w-0.5 rounded-full bg-tertiary-fixed"
                  style={{ animationDelay: '0.15s' }}
                />
                <div
                  className="waveform-bar w-0.5 rounded-full bg-tertiary-fixed"
                  style={{ animationDelay: '0.3s' }}
                />
                <div
                  className="waveform-bar w-0.5 rounded-full bg-tertiary-fixed"
                  style={{ animationDelay: '0.45s' }}
                />
                <div
                  className="waveform-bar w-0.5 rounded-full bg-tertiary-fixed"
                  style={{ animationDelay: '0.6s' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 콜 제어 버튼 — glassmorphism */}
        <div className="flex flex-wrap gap-3">
          {canPickup ? (
            <button
              onClick={async () => {
                await onPickup();
              }}
              className="glass-panel flex h-12 items-center gap-2 rounded-full px-5 text-white transition-all hover:bg-white/20 active:scale-95"
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
            className="flex h-12 items-center gap-2 rounded-full bg-error px-6 font-headline font-bold text-white shadow-lg transition-all hover:opacity-90 active:scale-95"
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
      className="glass-panel flex h-12 w-12 items-center justify-center rounded-full text-white transition-all hover:bg-white/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="material-symbols-outlined">{icon}</span>
    </button>
  );
}
