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
 * dialplan 이 호출하는 AGI. 실제 파일은 `AsteriskReloadService` 가 쓴다.
 *
 * **절대경로로 부른다.** 이름만 적으면 Asterisk 가 `astagidir`(기본 `agi-bin`)에서 찾는데
 * 이 배포에는 그 디렉터리가 없다. 못 찾아도 AGI 는 조용히 실패하고, dialplan 은
 * fail-open 이라 모든 호가 확인 없이 통과한다 — 기능이 꺼진 줄도 모르게 된다.
 */
export const AGENT_OFFER_AGI_NAME = 'kaster-agent-offer.agi';
export const AGENT_OFFER_AGI_PATH = `/var/lib/asterisk/sounds/custom/${AGENT_OFFER_AGI_NAME}`;
