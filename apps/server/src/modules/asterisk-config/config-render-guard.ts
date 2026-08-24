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

export interface ConfigRenderGuardInput {
  /** 이 테넌트의 활성 상담원 수. 0 이면 검사할 것이 없다. */
  expectedAgentCount: number;
  renderedPjsip: string;
  renderedAgentDialplan: string;
}

/**
 * 막아야 할 이유. 정상이면 null.
 *
 * pjsip 과 dialplan 이 <b>둘 다</b> 비었을 때만 막는다. 전 상담원의 SIP 비밀번호가 비어
 * pjsip 쪽만 0 이 되는 것은 정상 상태라 (렌더러가 의도적으로 건너뛴다) 한쪽만 보면 오탐이 난다.
 */
export function findConfigRenderRegression(input: ConfigRenderGuardInput): string | null {
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
