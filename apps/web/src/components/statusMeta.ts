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

// hero 카드 border / 배경 틴트. Tailwind 클래스 그룹.
export const TONE_CLASS: Record<StatusMeta['tone'], string> = {
  info: 'border-blue-200 bg-blue-50/40',
  warn: 'border-amber-200 bg-amber-50/40',
  ok: 'border-emerald-200 bg-emerald-50/40',
  danger: 'border-rose-200 bg-rose-50/40',
  neutral: 'border-slate-200 bg-white',
};

// 공통 카드 외곽 클래스. Antd Card 의 기본 테두리/그림자보다 더 현대적.
export const PANEL_CLASS =
  'rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.04)]';
