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
