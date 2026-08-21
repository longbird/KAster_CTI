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

/** `PJSIP/1001-0000001b` → `1001`. 모양이 다르면 null. */
export function getChannelEndpointName(channelName?: string | null): string | null {
  const channel = channelName?.trim();
  if (!channel) return null;

  const slash = channel.indexOf('/');
  if (slash < 0 || slash === channel.length - 1) return null;

  const afterSlash = channel.slice(slash + 1);

  // 채널 접미사(-0000001b)를 떼어 낸다. 엔드포인트 이름 자체에 하이픈이 있을 수 있으므로
  // 마지막 하이픈만 본다.
  const lastDash = afterSlash.lastIndexOf('-');
  const endpoint = lastDash > 0 ? afterSlash.slice(0, lastDash) : afterSlash;
  return endpoint || null;
}

export type CallLegType = 'agent' | 'trunk';

/**
 * 이 채널이 상담원 쪽인지 통신사 쪽인지.
 * 판단이 안 되면 상담원으로 보지 않는다 — 잘못 잡아 상담원 다리를 끊는 것보다
 * 제어를 거부하는 편이 낫다.
 */
export function classifyLeg(channelName?: string | null): CallLegType | null {
  const endpoint = getChannelEndpointName(channelName);
  if (!endpoint) return null;

  return endpoint.startsWith(TRUNK_ENDPOINT_PREFIX) ? 'trunk' : 'agent';
}
