import { renderQueuesConf } from './queues.renderer';

describe('renderQueuesConf', () => {
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
    expect(result).toContain('autopause=yes');
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

    const first = result.indexOf('member => PJSIP/1001,0,A');
    const second = result.indexOf('member => PJSIP/1002,1,B');
    const third = result.indexOf('member => PJSIP/1003,2,C');

    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
    expect(result).toContain('autopause=no');
  });
});
