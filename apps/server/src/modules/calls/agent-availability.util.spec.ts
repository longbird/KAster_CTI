import {
  QUEUE_PAUSING_STATUS_CODES,
  pausesQueueAssignment,
  shouldPauseQueue,
} from './agent-availability.util';

describe('pausesQueueAssignment', () => {
  // 자리를 비운 상태다. 그 사이 책상 전화기가 울리면 안 된다.
  it.each(['BREAK', 'MEAL', 'TRAINING', 'MANUAL_PAUSED'])(
    'stops the queue assigning calls while the agent is %s',
    (status) => {
      expect(pausesQueueAssignment(status)).toBe(true);
    },
  );

  it('lets the queue assign again once the agent is available', () => {
    expect(pausesQueueAssignment('AVAILABLE')).toBe(false);
  });

  /**
   * 통화 중·수신 중·후처리는 Asterisk 가 채널 상태로 이미 안다. 여기서 정지시키면
   * 통화가 끝나도 다시 풀어 줄 때까지 배정이 멈춘 채로 남는다.
   */
  it.each(['TALKING', 'RINGING', 'AFTER_CALL_WORK'])(
    'leaves %s to Asterisk instead of pausing the member',
    (status) => {
      expect(pausesQueueAssignment(status)).toBe(false);
    },
  );

  it.each([null, undefined, '', '   ', 'WHAT_IS_THIS'])(
    'treats %p as available rather than silently pausing an agent',
    (status) => {
      expect(pausesQueueAssignment(status as string | null)).toBe(false);
    },
  );

  it('ignores case and stray spaces', () => {
    expect(pausesQueueAssignment('  break ')).toBe(true);
  });
});

describe('QUEUE_PAUSING_STATUS_CODES', () => {
  // 목록이 두 벌이면 화면은 "일시정지" 인데 큐는 계속 배정한다.
  // 판정 함수와 목록이 같은 집합에서 나와야 두 화면이 같은 말을 한다.
  it('exposes exactly the statuses pausesQueueAssignment agrees with', () => {
    for (const statusCode of QUEUE_PAUSING_STATUS_CODES) {
      expect(pausesQueueAssignment(statusCode)).toBe(true);
    }
    expect([...QUEUE_PAUSING_STATUS_CODES].sort()).toEqual([
      'BREAK',
      'MANUAL_PAUSED',
      'MEAL',
      'TRAINING',
    ]);
  });
});

describe('shouldPauseQueue', () => {
  it('keeps assigning calls while the app is connected and the agent is available', () => {
    expect(shouldPauseQueue({ appConnected: true, statusCode: 'AVAILABLE' })).toBe(false);
  });

  // 앱이 꺼진 자리로 전화를 넘기면 발신자는 아무도 없는 내선에서 벨만 듣는다.
  it('pauses the member when the app is gone even though the status says AVAILABLE', () => {
    expect(shouldPauseQueue({ appConnected: false, statusCode: 'AVAILABLE' })).toBe(true);
  });

  // 이석해 둔 채 앱을 껐다 켠 경우다. 접속했다고 무조건 풀면 이석이 사라진다.
  it('keeps the member paused when the agent parked themselves on a break', () => {
    expect(shouldPauseQueue({ appConnected: true, statusCode: 'BREAK' })).toBe(true);
  });

  it('leaves TALKING to Asterisk while the app is connected', () => {
    expect(shouldPauseQueue({ appConnected: true, statusCode: 'TALKING' })).toBe(false);
  });

  it.each([null, undefined])('pauses a disconnected agent with %p status', (statusCode) => {
    expect(shouldPauseQueue({ appConnected: false, statusCode })).toBe(true);
  });

  /**
   * 열린 상태 행이 없다 = 로그인한 적이 없거나 로그아웃했다.
   *
   * 이걸 "상태 없음 = 정상" 으로 읽으면 로그아웃한 자리가 큐로 돌아온다:
   * 로그아웃해도 access token 은 15분 더 살아 있어서 소켓이 안 닫힐 수 있고,
   * 네트워크가 한 번 끊겼다 붙기만 해도 재연결이 pause 를 풀어 버린다.
   */
  it.each([null, undefined, '', '   '])(
    'pauses a seat with %p status even while the app is connected — that seat is logged out',
    (statusCode) => {
      expect(shouldPauseQueue({ appConnected: true, statusCode })).toBe(true);
    },
  );

  // 알 수 없는 값이라도 행이 있다는 것은 로그인해 있다는 뜻이다. 행 없음과 다르다.
  it('leaves an unknown but present status alone', () => {
    expect(shouldPauseQueue({ appConnected: true, statusCode: 'WHAT_IS_THIS' })).toBe(false);
  });
});
