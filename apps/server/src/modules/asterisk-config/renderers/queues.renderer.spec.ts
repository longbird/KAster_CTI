import { renderQueuesConf } from './queues.renderer';
import { queueMemberInterface } from '../../../common/queue-member.util';

describe('renderQueuesConf', () => {
  /**
   * 호를 넘기기 전에 상담원에게 물어보는 구조에서는 "시간 초과" 가 정상 결과다.
   * 잠깐 자리를 비웠거나 다른 일을 보던 10초일 뿐이다. 그걸 안 받은 것으로 보고
   * Asterisk 가 자동 이석시키면 그 상담원은 큐에서 빠지고, 화면에는 여전히 "대기" 로
   * 보인다. 아무도 눈치채지 못한 채 그 자리로 전화가 안 온다 — 실제로 그랬다.
   *
   * 자리 비움은 상담원이 앱에서 누르는 이석으로만 정한다.
   */
  it('시간 초과를 자리 비움으로 바꾸지 않는다', () => {
    // 관리자가 켜 두었더라도 끈다. 이 설정은 호를 넘기기 전에 물어보는 구조가
    // 생기기 전에 만들어졌고, 지금은 서로 맞지 않는다.
    const result = renderQueuesConf([{
      queueName: 'sales',
      distributionMode: 'ROUND_ROBIN',
      autopause: true,
      members: [{ extension: '1001', agentName: '홍길동', penalty: 0, memberOrder: 0 }],
    } as any]);

    expect(result).toContain('autopause=no');
    expect(result).not.toContain('autopause=yes');
  });

  it('큐 섹션과 일반 설정을 렌더링한다', () => {
    const result = renderQueuesConf([
      {
        queueName: 'sales-queue',
        strategy: 'leastrecent',
        ringTimeoutSeconds: 15,
        retrySeconds: 3,
        wrapupSeconds: 30,
        maxWaitSeconds: 45,
        autopause: true,
        members: [],
      },
    ]);

    expect(result).toContain('[general]');
    expect(result).toContain('[sales-queue]');
    expect(result).toContain('strategy=leastrecent');
    expect(result).toContain('timeout=15');
    expect(result).toContain('retry=3');
    expect(result).toContain('wrapuptime=30');
    // 관리자 설정과 무관하게 꺼진다 — 위 "시간 초과를 자리 비움으로 바꾸지 않는다" 참조.
    expect(result).toContain('autopause=no');
  });

  it('멤버를 memberOrder와 penalty 기준으로 정렬한다', () => {
    const result = renderQueuesConf([
      {
        queueName: 'support',
        strategy: 'rrmemory',
        ringTimeoutSeconds: 20,
        retrySeconds: 5,
        wrapupSeconds: 10,
        maxWaitSeconds: 60,
        autopause: false,
        members: [
          { extension: '1003', agentName: 'C', penalty: 2, memberOrder: 2 },
          { extension: '1002', agentName: 'B', penalty: 1, memberOrder: 1 },
          { extension: '1001', agentName: 'A', penalty: 0, memberOrder: 1 },
        ],
      },
    ]);

    const first = result.indexOf(`member => ${queueMemberInterface('1001')},0,A`);
    const second = result.indexOf(`member => ${queueMemberInterface('1002')},1,B`);
    const third = result.indexOf(`member => ${queueMemberInterface('1003')},2,C`);

    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
    expect(result).toContain('autopause=no');
  });
});
