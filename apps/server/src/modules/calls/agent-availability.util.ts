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

/**
 * 같은 판정을 DB 질의로 해야 하는 곳(관리자 대시보드의 "일시정지" 집계)이 쓰는 목록.
 *
 * 목록을 따로 적어 두면 반드시 갈린다 — 실제로 화면 집계와 큐 pause 판정이 서로 다른
 * 목록을 들고 있어서, 대시보드에는 쉬는 것으로 보이는 상담원에게 전화가 계속 들어갔다.
 */
export const QUEUE_PAUSING_STATUS_CODES: readonly string[] = [...NOT_TAKING_CALLS];

/**
 * 지금 이 상담원의 큐 멤버를 정지시켜야 하는가.
 *
 * 상태만 보면 앱을 꺼 버린 자리로 전화가 넘어가고, 접속만 보면 이석해 둔 상담원이
 * 앱을 껐다 켜는 순간 이석이 조용히 풀린다. 둘을 함께 봐야 한다.
 *
 * `statusCode` 가 비어 있다는 것은 <b>열린 상태 행이 없다</b>는 뜻이고, 그건
 * 로그인한 적이 없거나 로그아웃했다는 뜻이다. 이걸 "상태 없음 = 정상" 으로 읽으면
 * 로그아웃한 자리가 큐로 돌아온다 — 로그아웃해도 access token 은 15분 더 살아 있어
 * 소켓이 안 닫힐 수 있고, 네트워크가 한 번 끊겼다 붙기만 해도 재연결이 pause 를
 * 풀어 버린다. 값을 알 수 없는 상태(`WHAT_IS_THIS`)와는 다르다. 그건 행이 있으니
 * 로그인해 있다는 뜻이다.
 *
 * 이 판정은 여기 한 곳에만 둔다. 호출자마다 null 을 다르게 해석하기 시작하면
 * 목록이 두 벌 되던 것과 같은 결함이 된다.
 */
export function shouldPauseQueue(input: {
  appConnected: boolean;
  statusCode?: string | null;
}): boolean {
  if (!input.statusCode?.trim()) return true;
  return !input.appConnected || pausesQueueAssignment(input.statusCode);
}
