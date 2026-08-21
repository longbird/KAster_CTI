import { renderQueuesConf } from '../modules/asterisk-config/renderers/queues.renderer';
import { queueMemberInterface } from './queue-member.util';

describe('queueMemberInterface', () => {
  /**
   * 전화기를 직접 멤버로 두면 전화기가 응답하는 순간이 곧 브리지라 물어볼 자리가 없다.
   * 자동응답 전화기에서는 큐 대기가 0초가 되고 대기음도 한 조각만 들린다 — 실제로 그랬다.
   */
  it('전화기가 아니라 물어보는 자리를 큐 멤버로 둔다', () => {
    expect(queueMemberInterface('1001')).toBe('Local/1001@agent-offer');
  });

  /**
   * queues.conf 에 적히는 문자열과 AMI QueuePause 의 Interface 가 글자 하나까지 같아야 한다.
   * 다르면 pause 가 실패하는데 화면에는 이석으로 보여, 이석 중인데 전화가 계속 오는
   * 상태가 된다. 한쪽만 바뀌는 것을 여기서 잡는다.
   */
  it('matches the member line the queue renderer writes', () => {
    const rendered = renderQueuesConf([{
      queueName: 'sales',
      distributionMode: 'ROUND_ROBIN',
      members: [{ extension: '1001', agentName: '홍길동', penalty: 0, memberOrder: 0 }],
    } as any]);

    expect(rendered).toContain(`member => ${queueMemberInterface('1001')},0,홍길동`);
  });
});
