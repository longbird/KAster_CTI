/**
 * 렌더 결과가 "상담원이 통째로 사라진" 모양이면 쓰기를 막는다.
 *
 * 2026-08-24: 같은 `/etc/asterisk` 를 마운트한 다른 노드가 자기 테넌트 기준으로 렌더링해
 * pjsip.conf 를 9,220 -> 1,678 바이트로 덮어썼다. 내선 endpoint 가 하나도 없는 설정이었고,
 * 전화기들은 등록할 계정 자체를 잃었다. 그런데 파일은 <b>비어 있지 않았다</b> — global 과
 * transport 와 트렁크는 그대로였다. 그래서 `validateRenderedConfFiles` 의 "비어 있지 않은가"
 * 검사를 통과했다. (그 검사는 미리보기 화면 전용이라 쓰기를 막지도 못했다.)
 *
 * 여기서는 "무엇이 있는가" 가 아니라 <b>"있어야 할 것이 없는가"</b> 를 본다.
 */

/** 상담원 auth 섹션 수. 트렁크의 `[trunk-...-auth]` 는 세지 않는다. */
function countAgentAuthSections(pjsip: string): number {
  return pjsip
    .split(/\r?\n/)
    .filter((line) => /^\[[^\]]+-auth\]$/.test(line.trim()) && !line.trim().startsWith('[trunk-'))
    .length;
}

/** `[agent-phone-<내선>]` 컨텍스트 수. */
function countAgentPhoneContexts(agentDialplan: string): number {
  return agentDialplan
    .split(/\r?\n/)
    .filter((line) => /^\[agent-phone-[^\]]+\]$/.test(line.trim()))
    .length;
}

/**
 * 직전 적용본 대비 이 비율 아래로 줄면 막는다.
 *
 * env 로 빼지 않는다 — 튜닝 대상이 아니라 안전선이다. 사이트가 낮춰 놓으면
 * 이 검사는 있으나 마나 해진다.
 */
const MIN_INBOUND_SIZE_RATIO = 0.7;

export interface ConfigRenderGuardInput {
  /** 이 테넌트의 활성 상담원 수. 0 이면 검사할 것이 없다. */
  expectedAgentCount: number;
  renderedPjsip: string;
  renderedAgentDialplan: string;
  /** 플로우가 걸린 DID 들이 가리키는 컨텍스트 슬러그. 비면 이 검사를 건너뛴다. */
  expectedArsFlowSlugs?: string[];
  renderedExtensionsQueue?: string;
  renderedExtensionsInbound?: string;
  /** 직전에 실제로 적용된 inbound 내용. 없으면(최초 적용) 축소 검사를 건너뛴다. */
  previousExtensionsInbound?: string | null;
}

/**
 * 막아야 할 이유. 정상이면 null.
 *
 * 세 가지를 본다. 공통점은 <b>"있어야 할 것이 없는가"</b> 다 —
 * 파일이 비어 있지 않아도 통화가 끊길 수 있다는 것이 2026-08-24 사고의 교훈이다.
 */
export function findConfigRenderRegression(input: ConfigRenderGuardInput): string | null {
  return (
    findMissingAgentExtensions(input)
    ?? findMissingArsFlowContexts(input)
    ?? findShrunkInbound(input)
  );
}

/**
 * pjsip 과 dialplan 이 <b>둘 다</b> 비었을 때만 막는다. 전 상담원의 SIP 비밀번호가 비어
 * pjsip 쪽만 0 이 되는 것은 정상 상태라 (렌더러가 의도적으로 건너뛴다) 한쪽만 보면 오탐이 난다.
 */
function findMissingAgentExtensions(input: ConfigRenderGuardInput): string | null {
  if (input.expectedAgentCount <= 0) return null;

  const authSections = countAgentAuthSections(input.renderedPjsip);
  const phoneContexts = countAgentPhoneContexts(input.renderedAgentDialplan);
  if (authSections > 0 || phoneContexts > 0) return null;

  return (
    `상담원 ${input.expectedAgentCount}명이 있는데 렌더 결과에 내선이 하나도 없다 `
    + '(pjsip auth 0개, agent-phone 컨텍스트 0개). 설정을 쓰지 않는다 — '
    + '덮어쓰면 전화기가 등록할 계정을 잃는다.'
  );
}

/**
 * DID 는 플로우 컨텍스트로 Goto 하는데 그 컨텍스트가 렌더되지 않았다면,
 * 그 번호로 걸려온 전화는 존재하지 않는 곳으로 점프한다.
 */
function findMissingArsFlowContexts(input: ConfigRenderGuardInput): string | null {
  const expected = input.expectedArsFlowSlugs ?? [];
  if (expected.length === 0) return null;

  const rendered = input.renderedExtensionsQueue ?? '';
  const missing = expected.filter((slug) => !rendered.includes(`[ars-flow-${slug}]`));
  if (missing.length === 0) return null;

  return (
    `ARS 플로우 컨텍스트가 렌더되지 않았다: ${missing.join(', ')}. `
    + '설정을 쓰지 않는다 — 그 DID 로 걸려온 전화가 없는 컨텍스트로 점프한다.'
  );
}

/**
 * 2026-08-24 pjsip 사고와 같은 유형이다. 그때도 파일은 비어 있지 않았다.
 * 무엇이 있는지가 아니라 <b>직전보다 얼마나 사라졌는지</b>를 본다.
 */
function findShrunkInbound(input: ConfigRenderGuardInput): string | null {
  const previous = input.previousExtensionsInbound;
  const current = input.renderedExtensionsInbound;
  if (!previous || current === undefined) return null;

  const ratio = current.length / previous.length;
  if (ratio >= MIN_INBOUND_SIZE_RATIO) return null;

  return (
    `인바운드 다이얼플랜이 직전 적용본 대비 ${Math.round(ratio * 100)}% 로 줄었다 `
    + `(${previous.length} -> ${current.length} 바이트, 하한 ${Math.round(MIN_INBOUND_SIZE_RATIO * 100)}%). `
    + '설정을 쓰지 않는다 — 조용히 사라진 경로가 있는지 먼저 확인해야 한다.'
  );
}
