import { renderQueuesConf } from '../modules/asterisk-config/renderers/queues.renderer';
import { queueMemberInterface } from './queue-member.util';

describe('queueMemberInterface', () => {
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
