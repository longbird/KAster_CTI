import { pausesQueueAssignment } from './agent-availability.util';

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
