/**
 * 이 상태의 상담원에게 큐가 전화를 배정해도 되는가.
 *
 * 화면의 "이석" 은 자리를 비웠다는 뜻이고, 그 사이 책상 전화기가 울리면 안 된다.
 * 상태를 DB 에만 적어 두면 큐는 그대로 배정하므로, 상태와 큐 일시정지는 함께 움직여야 한다.
 *
 * 통화 중(TALKING)·수신 중(RINGING)·후처리(AFTER_CALL_WORK)는 <b>일시정지가 아니다.</b>
 * 그건 Asterisk 가 채널 상태로 이미 알고 있고, 여기서 정지시키면 통화가 끝나도
 * 다시 풀어 줄 때까지 배정이 멈춘다.
 */
const NOT_TAKING_CALLS = new Set([
  'BREAK',
  'MEAL',
  'TRAINING',
  'MANUAL_PAUSED',
]);

export function pausesQueueAssignment(statusCode?: string | null): boolean {
  return NOT_TAKING_CALLS.has((statusCode ?? '').trim().toUpperCase());
}
