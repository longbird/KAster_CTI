import type { AgentStatusCode, SessionStatus } from '../types/cti';

// 전체 앱에서 재사용하는 상태 메타데이터. 각 상태의 한국어 라벨과 Antd Tag 색,
// tone (hero 카드 배경 / border 강조용) 을 한 곳에서 관리.

export interface StatusMeta {
  label: string;
  color: string; // Antd Tag color
  // 화면 강조 톤. hero 카드 border/background 를 바꿀 때 참조.
  tone: 'info' | 'warn' | 'ok' | 'danger' | 'neutral';
}

export const SESSION_META: Record<SessionStatus, StatusMeta> = {
  NEW: { label: '신규', color: 'default', tone: 'neutral' },
  IVR: { label: 'IVR', color: 'gold', tone: 'warn' },
  QUEUED: { label: '대기', color: 'orange', tone: 'warn' },
  RINGING_AGENT: { label: '벨 울림', color: 'cyan', tone: 'info' },
  TALKING: { label: '통화 중', color: 'blue', tone: 'info' },
  HOLD: { label: '보류', color: 'purple', tone: 'warn' },
  TRANSFERRING: { label: '전환 중', color: 'magenta', tone: 'warn' },
  AFTER_CALL_WORK: { label: '후처리', color: 'green', tone: 'ok' },
  ENDED: { label: '종료', color: 'default', tone: 'neutral' },
};

export const CALL_STATUS_LABEL = Object.fromEntries(
  Object.entries(SESSION_META).map(([key, value]) => [key, value.label]),
) as Record<SessionStatus, string>;

export const CALL_STATUS_COLOR = Object.fromEntries(
  Object.entries(SESSION_META).map(([key, value]) => [key, value.color]),
) as Record<SessionStatus, string>;

export const AGENT_META: Record<AgentStatusCode, StatusMeta> = {
  AVAILABLE: { label: '대기', color: 'green', tone: 'ok' },
  RINGING: { label: '벨 울림', color: 'gold', tone: 'warn' },
  TALKING: { label: '통화 중', color: 'blue', tone: 'info' },
  AFTER_CALL_WORK: { label: '후처리', color: 'purple', tone: 'warn' },
  BREAK: { label: '휴식', color: 'red', tone: 'danger' },
  MEAL: { label: '식사', color: 'orange', tone: 'warn' },
  TRAINING: { label: '교육', color: 'cyan', tone: 'info' },
  MANUAL_PAUSED: { label: '일시정지', color: 'default', tone: 'neutral' },
};

// hero 카드 border / 배경 틴트. v2 Operator — hairline + soft tint.
export const TONE_CLASS: Record<StatusMeta['tone'], string> = {
  info: 'border-[rgba(96,165,250,0.35)] bg-[var(--accent-info-soft)]',
  warn: 'border-[rgba(251,191,36,0.35)] bg-[var(--accent-warn-soft)]',
  ok: 'border-[var(--signal-dim)] bg-[var(--signal-soft)]',
  danger: 'border-[rgba(248,113,113,0.35)] bg-[var(--accent-danger-soft)]',
  neutral: 'border-[var(--line-1)] bg-[var(--bg-1)]',
};

// 공통 카드 외곽 클래스 — v2 panel
export const PANEL_CLASS =
  'rounded-md border border-[var(--line-1)] bg-[var(--bg-1)]';
