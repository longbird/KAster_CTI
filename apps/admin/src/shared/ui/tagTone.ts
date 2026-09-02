/**
 * 태그 색의 단일 출처.
 *
 * antd 의 status preset — success / processing / warning / error / default — 다섯만 쓴다.
 * 이 다섯은 테마의 colorSuccess · colorInfo · colorWarning · colorError 에서 파생되고
 * (antd/lib/tag/style/statusCmp.js), shared/theme/antdTheme.ts 가 그 넷을 styles.css 의
 * --signal · --accent-info · --accent-warn · --accent-danger 와 같은 값으로 맞춰 두었다.
 * 그래서 여기를 거친 태그는 다크 · 라이트 양쪽에서 디자인 토큰을 따라간다.
 *
 * antd 팔레트 이름(green · blue · gold · purple …)은 쓰지 않는다. 테마를 따라가지 않아
 * 같은 뜻이 화면마다 다른 색으로 나갔다. 색은 심각도만 나르고, 무엇인지는 글자가 나른다.
 */
export type TagTone = 'success' | 'processing' | 'warning' | 'error' | 'default';

/** 상담원 근무 상태. styles.css 의 --status-* 를 그대로 따른다. */
export const AGENT_STATUS_TONE: Record<string, TagTone> = {
  AVAILABLE: 'success', // --status-available
  RINGING: 'warning', // --status-ringing
  RINGING_AGENT: 'warning',
  TALKING: 'processing', // --status-talking
  TRANSFERRING: 'processing',
  HOLD: 'warning',
  AFTER_CALL_WORK: 'default', // --status-acw 는 회색이다
  BREAK: 'error', // --status-break
  MEAL: 'warning',
  TRAINING: 'processing',
  MANUAL_PAUSED: 'default',
};

/** 통화 세션 상태. 대기는 주의, 통화는 진행, 끝난 것은 중립. */
export const SESSION_STATUS_TONE: Record<string, TagTone> = {
  NEW: 'processing',
  QUEUED: 'warning',
  RINGING_AGENT: 'warning',
  TALKING: 'processing',
  TRANSFERRING: 'processing',
  AFTER_CALL_WORK: 'default',
  ENDED: 'default',
};

/** 호 전환 단계. */
export const TRANSFER_PHASE_TONE: Record<string, TagTone> = {
  REQUESTED: 'default',
  CONSULT_RINGING: 'warning',
  CONSULT_TALKING: 'processing',
  REBRIDGING: 'processing',
  COMPLETED: 'success',
  FAILED: 'error',
  EXPIRED: 'warning',
};

/** 미응답 사유. 고객이 끊은 것만 위험이고 나머지는 주의다. */
export const MISSED_REASON_TONE: Record<string, TagTone> = {
  CUSTOMER_ABANDONED: 'error',
  QUEUE_TIMEOUT: 'warning',
  QUEUE_NO_ANSWER: 'warning',
  AGENT_NO_ANSWER: 'warning',
  SYSTEM_RECOVERY: 'default',
  NO_ANSWER: 'default',
};
