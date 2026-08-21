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
  return `PJSIP/${extension}`;
}
