import type { CSSProperties } from 'react';
import type { AgentStatusCode, SessionStatus } from '../types/cti';

/**
 * 상태 색의 단일 출처.
 *
 * 예전에는 같은 상태의 색이 네 군데에서 따로 정해졌다 — 여기의 antd 팔레트 이름,
 * AgentStatusTag 의 인라인 hex, FloatingDialerWindow 의 라이트 전용 Tailwind 클래스,
 * 그리고 CSS 별칭. 그래서 통화 중이 화면에 따라 초록이기도 파랑이기도 했다.
 *
 * 이제 각 상태는 tone 하나만 갖고, tone 은 styles/index.css 의 --tone-* 로 간다.
 * 그 토큰은 테마마다 값이 있어 라이트/다크가 같이 따라온다.
 * 색은 심각도만 나르고, 무엇인지는 글자가 나른다.
 */
export type StatusTone = 'info' | 'warn' | 'ok' | 'danger' | 'neutral';

export interface StatusMeta {
  label: string;
  tone: StatusTone;
}

const TONE_VAR: Record<StatusTone, string> = {
  ok: 'var(--tone-ok)',
  info: 'var(--tone-info)',
  warn: 'var(--tone-warn)',
  danger: 'var(--tone-danger)',
  neutral: 'var(--tone-neutral)',
};

export function toneColor(tone: StatusTone): string {
  return TONE_VAR[tone];
}

/** 칩·배지용 글자 + 옅은 배경 + 테두리 한 벌. */
export function toneStyle(tone: StatusTone): CSSProperties {
  const color = TONE_VAR[tone];
  return {
    color,
    background: `color-mix(in srgb, ${color} 12%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
  };
}

export const SESSION_META: Record<SessionStatus, StatusMeta> = {
  NEW: { label: '신규', tone: 'neutral' },
  IVR: { label: 'IVR', tone: 'warn' },
  QUEUED: { label: '대기', tone: 'warn' },
  RINGING_AGENT: { label: '벨 울림', tone: 'warn' },
  TALKING: { label: '통화 중', tone: 'info' },
  HOLD: { label: '보류', tone: 'warn' },
  TRANSFERRING: { label: '전환 중', tone: 'info' },
  AFTER_CALL_WORK: { label: '후처리', tone: 'neutral' },
  ENDED: { label: '종료', tone: 'neutral' },
};

export const AGENT_META: Record<AgentStatusCode, StatusMeta> = {
  AVAILABLE: { label: '대기', tone: 'ok' },
  RINGING: { label: '벨 울림', tone: 'warn' },
  // 통화 중은 대기와 달라야 한다. 예전에는 둘 다 초록이라 배지로 구분할 수 없었다.
  TALKING: { label: '통화 중', tone: 'info' },
  AFTER_CALL_WORK: { label: '후처리', tone: 'neutral' },
  BREAK: { label: '휴식', tone: 'danger' },
  MEAL: { label: '식사', tone: 'warn' },
  TRAINING: { label: '교육', tone: 'info' },
  MANUAL_PAUSED: { label: '일시정지', tone: 'neutral' },
};

export function sessionLabel(status: string): string {
  return SESSION_META[status as SessionStatus]?.label ?? status;
}

export function sessionColor(status: string): string {
  const meta = SESSION_META[status as SessionStatus];
  return meta ? toneColor(meta.tone) : 'var(--tone-neutral)';
}
