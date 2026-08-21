/**
 * AMI 채널 이름에서 leg 의 정체를 읽어 낸다.
 *
 * 통화 제어(마이크 끄기·끊기·전환·홀드)는 전부 "상담원 쪽 채널"이 무엇인지 알아야 한다.
 * 고객 쪽 트렁크 채널을 잡으면 엉뚱한 다리를 끊게 된다.
 *
 * 채널 이름은 `PJSIP/1001-0000001b` 또는 `PJSIP/trunk-070-5234-6380-00000021` 꼴이다.
 * 엔드포인트 이름이 `trunk-` 로 시작하면 통신사 쪽, 아니면 상담원 내선이다.
 * 이 규칙은 `pjsip.renderer.ts` 가 트렁크를 `[trunk-<slug>]` 로 렌더하는 것과 짝이다.
 */
export const TRUNK_ENDPOINT_PREFIX = 'trunk-';

/**
 * 큐가 상담원에게 호를 넘기기 전에 거치는 중간 채널. `Local/1001@agent-offer-00000007;1` 꼴이다.
 * 이름이 내선으로 시작하기 때문에 그냥 두면 상담원 단말 leg 로 오인된다.
 */
const LOCAL_CHANNEL_PREFIX = 'Local/';

/** `PJSIP/1001-0000001b` → `1001`. 모양이 다르면 null. */
export function getChannelEndpointName(channelName?: string | null): string | null {
  const channel = channelName?.trim();
  if (!channel) return null;

  const slash = channel.indexOf('/');
  if (slash < 0 || slash === channel.length - 1) return null;

  // Local 채널은 두 가닥(;1 ;2)으로 갈라진다. 가닥 번호는 엔드포인트 이름이 아니다.
  const afterSlash = channel.slice(slash + 1).split(';')[0];

  // 채널 접미사(-0000001b)를 떼어 낸다. 엔드포인트 이름 자체에 하이픈이 있을 수 있으므로
  // 마지막 하이픈만 본다.
  const lastDash = afterSlash.lastIndexOf('-');
  const endpoint = lastDash > 0 ? afterSlash.slice(0, lastDash) : afterSlash;
  return endpoint || null;
}

/**
 * leg 종류. <b>이 문자열은 계약이다</b> — 당겨받기는 고객 leg 를 `['inbound','customer']` 로 찾고
 * 나머지 통화 제어는 상담원 leg 를 `'agent'` 로 찾는다. 시드 스크립트도 같은 값을 쓴다.
 * 바꾸면 `calls.service.ts` 의 leg 조회를 전부 함께 고쳐야 한다.
 */
export type CallLegType = 'agent' | 'inbound' | 'local';

/**
 * 이 채널이 상담원 쪽인지 고객(통신사) 쪽인지.
 * 판단이 안 되면 상담원으로 보지 않는다 — 잘못 잡아 상담원 다리를 끊는 것보다
 * 제어를 거부하는 편이 낫다.
 */
export function classifyLeg(channelName?: string | null): CallLegType | null {
  const endpoint = getChannelEndpointName(channelName);
  if (!endpoint) return null;

  // 중간 다리를 상담원 단말로 보면 마이크 끄기·끊기가 엉뚱한 채널에 걸린다.
  // 요청은 성공했다고 나오는데 전화기는 그대로인, 원인을 찾기 어려운 고장이 된다.
  if (channelName!.trim().startsWith(LOCAL_CHANNEL_PREFIX)) return 'local';

  return endpoint.startsWith(TRUNK_ENDPOINT_PREFIX) ? 'inbound' : 'agent';
}

/**
 * 이 채널이 끊긴 것을 통화 종료로 볼 것인가.
 *
 * 큐가 상담원에게 호를 넘기는 중간 채널은 통화 중에도 사라진다 — 브리지 최적화로 빠지거나,
 * 상담원이 거절해서 끊긴다. 그걸 종료로 보면 12초 통화한 세션이 시작과 동시에 ENDED 로
 * 닫히고(실측), 거절해도 다음 상담원으로 넘어가지 못한 채 발신자만 남는다.
 *
 * 무엇인지 모르면 종료로 본다. 놓친 종료는 세션을 열린 채 남기지만, 잘못된 무시는
 * 통화 기록을 통째로 잃는다.
 */
export function hangupEndsCall(channelName?: string | null): boolean {
  return classifyLeg(channelName) !== 'local';
}

/**
 * 채널 이름이나 큐 멤버 인터페이스에서 상담원 내선을 읽어 낸다.
 *
 * `PJSIP/1001-0000001b`, `PJSIP/1001`, `Local/1001@agent-offer-00000007;1` 이 모두 `1001` 이다.
 * 통신사 채널에는 내선이 없으므로 null 이다.
 */
export function getAgentExtensionFromChannel(channelName?: string | null): string | null {
  const endpoint = getChannelEndpointName(channelName);
  if (!endpoint) return null;
  if (endpoint.startsWith(TRUNK_ENDPOINT_PREFIX)) return null;

  // Local 채널은 내선 뒤에 @context 가 붙는다.
  const extension = endpoint.split('@')[0].trim();
  return extension || null;
}
