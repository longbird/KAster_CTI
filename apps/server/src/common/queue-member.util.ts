import { AGENT_OFFER_CONTEXT } from './call-routing.constants';

/**
 * 큐 멤버 인터페이스 문자열.
 *
 * Asterisk 는 이 문자열로 멤버를 식별한다. `queues.conf` 에 렌더되는 값과 AMI `QueuePause`
 * 의 `Interface` 값이 **글자 하나까지 같아야** 한다. 다르면 pause 가 조용히 실패한다 —
 * AMI 는 오류를 돌려주지만 이석은 화면에 반영돼 있으니, 이석 중인데 전화가 계속 오는
 * 상태가 되고 원인을 찾기 어렵다.
 *
 * 그래서 양쪽이 이 함수 하나만 쓴다. 리터럴을 흩어놓으면 반드시 다시 갈린다.
 */
export function queueMemberInterface(extension: string): string {
  // 전화기를 직접 멤버로 두면 전화기가 응답하는 순간이 곧 브리지라, 상담원에게 물어볼
  // 자리가 없다. Local 채널은 그 안의 Dial 이 응답할 때까지 응답하지 않으므로
  // 수락 전까지 발신자가 큐에 남아 대기음을 계속 듣는다.
  return `Local/${extension}@${AGENT_OFFER_CONTEXT}`;
}
