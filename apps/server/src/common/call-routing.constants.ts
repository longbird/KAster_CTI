export const DEFAULT_DISTRIBUTION_RULE_QUEUE_NAME = 'default-distribution';
export const DEFAULT_DISTRIBUTION_RULE_DISPLAY_NAME = '기본 호 분배룰';

// PBX 가 SIP 를 수신하는 UDP 포트의 기본값 (tenantSystemSettings.sipRegisterPort).
// 한 곳에 모아두는 이유: 예전에 schema.prisma(36070) / 마이그레이션(5060) / 렌더러(36070) 가
// 서로 다른 값을 들고 있었고, 그 상태로 오래 지나갔다. 리터럴을 흩어놓으면 반드시 다시 갈린다.
//
// 이 값을 바꾸면 함께 바꿔야 하는 것:
//   - prisma/schema.prisma 의 @default
//   - 새 마이그레이션의 ALTER ... SET DEFAULT
//   - infra/security/pbx-sip-hardening/* 방화벽 템플릿 (엉뚱한 포트를 지키게 된다)
//   - scripts/pbx-sip-security-prepare.sh 의 SIP_PORT 기본값
//   - infra/asterisk/pjsip.conf 초안의 [transport-udp] bind (렌더러가 덮어쓰지만 초안을 보고 따라 하면 갈린다)
export const DEFAULT_SIP_REGISTER_PORT = 48950;

/**
 * 큐가 상담원에게 호를 넘기기 전에 수락/거절을 기다리는 시간(초).
 *
 * 짧으면 상담원이 놓치고, 길면 발신자가 이유 없이 기다린다.
 * 이 값을 바꾸면 dialplan(AGI 인자)과 서버 롱폴 타임아웃이 함께 움직여야 한다 —
 * 서버가 먼저 끊으면 AGI 가 빈손으로 돌아오고, dialplan 이 먼저 포기하면
 * 상담원이 수락을 눌렀는데 이미 다음 사람에게 넘어가 있다.
 */
export const DEFAULT_AGENT_OFFER_TIMEOUT_SECONDS = 10;

/**
 * 관리자가 고를 수 있는 대기 시간의 범위(초).
 *
 * 이 범위는 **롱폴 엔드포인트가 받아주는 범위와 같아야 한다.** 관리자 입력이 더 넓으면
 * 관리자가 저장한 값이 dialplan → AGI 를 타고 서버에 도착했을 때 검증에 걸려 400 이 되고,
 * AGI 는 실패하면 ACCEPT 로 fail-open 한다 — 전 상담원이 묻지도 않고 자동 수락되어
 * 수락/거절 기능이 통째로 무력화된다. 그래서 리터럴을 흩지 않고 여기 한 곳에 둔다.
 *
 * 이 값을 쓰는 곳:
 *   - `modules/calls/dto/agent-offer-wait.dto.ts` (AGI 가 호출하는 롱폴 검증)
 *   - `modules/admin/dto/update-system-settings.dto.ts` (관리자 저장 검증)
 *   - `modules/asterisk-config/renderers/agent-dialplan.renderer.ts` (렌더 직전 클램프)
 *   - `apps/admin/src/features/system-settings/agentOfferTimeout.ts` (화면 입력 제한.
 *     패키지가 달라 import 할 수 없으므로 짝 테스트가 이 파일을 읽어 값이 갈리면 실패시킨다)
 *
 * 상한 60초의 근거: 롱폴 요청이 그 시간만큼 서버 커넥션을 붙잡는다.
 */
export const MIN_AGENT_OFFER_TIMEOUT_SECONDS = 1;
export const MAX_AGENT_OFFER_TIMEOUT_SECONDS = 60;

/**
 * 어떤 값이 오든 dialplan 에 박아도 안전한 대기 시간으로 만든다.
 *
 * DB 에는 범위 밖 값이 남아 있을 수 있다 — 마이그레이션 이전 행, DB 직접 수정.
 * 그걸 그대로 내보내면 위의 fail-open 사고가 난다.
 */
export function clampAgentOfferTimeoutSeconds(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return DEFAULT_AGENT_OFFER_TIMEOUT_SECONDS;
  }
  const seconds = Math.trunc(value);
  if (seconds < MIN_AGENT_OFFER_TIMEOUT_SECONDS) return MIN_AGENT_OFFER_TIMEOUT_SECONDS;
  if (seconds > MAX_AGENT_OFFER_TIMEOUT_SECONDS) return MAX_AGENT_OFFER_TIMEOUT_SECONDS;
  return seconds;
}

/**
 * dialplan 이 호출하는 AGI. 실제 파일은 `AsteriskReloadService` 가 쓴다.
 *
 * **절대경로로 부른다.** 이름만 적으면 Asterisk 가 `astagidir`(기본 `agi-bin`)에서 찾는데
 * 이 배포에는 그 디렉터리가 없다. 못 찾아도 AGI 는 조용히 실패하고, dialplan 은
 * fail-open 이라 모든 호가 확인 없이 통과한다 — 기능이 꺼진 줄도 모르게 된다.
 */
/**
 * 큐가 상담원에게 호를 넘기기 전에 거치는 dialplan context.
 * 큐 멤버 문자열과 dialplan 헤더가 같은 값을 써야 한다.
 */
export const AGENT_OFFER_CONTEXT = 'agent-offer';

/**
 * 큐별 제안 대기 시간을 채널에 심는 sub-context, 그리고 그 값이 담기는 채널 변수.
 *
 * 두 렌더러가 이 이름을 나눠 쓴다 — `dialplan.renderer` 가 큐 진입에서 심고,
 * `agent-dialplan.renderer` 가 상담원을 부르기 직전에 읽는다. 이름이 갈리면 읽는 쪽이
 * 언제나 빈 값을 보게 되고, 그러면 관리자가 호분배룰에 넣은 값이 **조용히 무시된다**
 * (폴백이 있어 통화는 정상으로 보이므로 아무도 눈치채지 못한다).
 */
export const AGENT_OFFER_TIMEOUT_CONTEXT = 'agent-offer-timeout';
export const AGENT_OFFER_TIMEOUT_VARIABLE = 'KASTER_OFFER_TIMEOUT';

export const AGENT_OFFER_AGI_NAME = 'kaster-agent-offer.agi';
export const AGENT_OFFER_AGI_PATH = `/var/lib/asterisk/sounds/custom/${AGENT_OFFER_AGI_NAME}`;
