# SIP INVITE Abuse Defense Design

## 1. 목표와 범위

외부에서 `INVITE sip:00...@<PBX>` 또는 내선 번호를 위조한 SIP 요청이 반복 유입될 때 요금 발생과 PBX 자원 소모를 줄인다.

범위는 이 프로젝트의 CTI 서버, Prisma 저장소, Redis 카운터, PBX 설정 생성기까지로 제한한다. 다른 PBX 코드나 외부 서버 프로세스는 설계 근거로 사용하지 않는다.

## 2. 제안 모듈 구조

- `apps/server/src/modules/sip-security/sip-security.module.ts`
  - SIP 공격 탐지 서비스를 앱에 등록한다.
- `apps/server/src/modules/sip-security/sip-security.service.ts`
  - AMI `SecurityEvent` 계열 이벤트를 분석한다.
  - Redis sliding window 카운터로 번호/IP별 공격 점수를 누적한다.
  - 임계치를 넘으면 Prisma `sipSecurityBlocks`에 TTL 기반 차단 상태를 저장한다.
- `apps/server/src/modules/sip-security/sip-security.controller.ts`
  - supervisor/admin이 현재 활성 차단 목록을 조회한다.
- `apps/server/src/modules/ami/ami-connection.service.ts`
  - 리더 노드에서 정규화 이벤트를 받은 뒤 세션 엔진 처리 전 SIP 보안 탐지기에 전달한다.
- `apps/server/src/modules/asterisk-config/renderers/agent-dialplan.renderer.ts`
  - 상담원 endpoint context에서 현재 REGISTER contact가 없는 내선의 전화기 직접 발신을 1차 차단한다.

## 3. 도메인 엔티티 / Prisma 모델 후보

`sipSecurityBlocks`

- `tenantId`: 테넌트 범위.
- `blockType`: `NUMBER` 또는 `IP`.
- `blockKey`: `NUMBER:<number>` 또는 `IP:<ip>`.
- `value`: 실제 번호 또는 IP.
- `reason`: `SIP_NUMBER_ABUSE`, `SIP_IP_ABUSE`, `UNREGISTERED_EXTENSION_CLAIM` 등.
- `blockedUntil`: 차단 만료 시각.
- `hitCount`: 누적 탐지 횟수.
- `sourceIp`, `sourceNumber`, `targetNumber`: 대표 관측값.
- `metadata`: 최근 이벤트 요약.

080 수신거부용 `AsteriskBlocklistEntry`와 섞지 않는다. 공격 임시 차단은 운영 의미, TTL, 승격 정책이 다르기 때문이다.

## 4. 이벤트 흐름

1. PBX가 AMI 이벤트를 CTI 서버로 보낸다.
2. `AmiConnectionService`가 이벤트를 정규화한다.
3. 리더 노드만 `SipSecurityService.processAmiEvent()`를 호출한다.
4. 서비스가 `SecurityEvent`, `InvalidAccountID`, `ChallengeResponseFailed`, `InvalidPassword`, `RequestNotAllowed`, `No matching endpoint` 성격의 이벤트만 평가한다.
5. Redis에 짧은 TTL 카운터를 증가시킨다.
6. 같은 번호가 짧은 시간에 반복되면 `NUMBER` 차단을 등록한다.
7. 같은 IP가 여러 번호를 바꿔가며 반복하면 `IP` 차단으로 승격한다.
8. 운영자는 `GET /api/v1/sip-security/blocks`에서 현재 차단 상태를 확인한다.

## 5. 3단계 방어 정책

### 1차: REGISTER 내선 확인

상담원 endpoint 발신 경로에서는 현재 REGISTER contact가 없는 내선이면 발신 라우팅 전에 `Hangup()` 한다.

극히 일부 전화기 직접 발신 요구사항은 예외로 허용한다. 단, 다음 조건을 모두 만족해야 한다.

- 상담원 `outboundDialPermissions.phoneDirect`가 `true`이다.
- `outboundDialPermissions.phoneDirectAllowedIps`에 허용 IP 또는 CIDR이 1개 이상 등록되어 있다.
- PBX `pjsip.conf` endpoint에 `deny=0.0.0.0/0.0.0.0`와 `permit=<허용 IP>`가 생성되어 REGISTER와 INVITE가 지정 IP에서만 들어온다.
- 다이얼플랜에서 `PJSIP_DIAL_CONTACTS(<내선>)`가 비어 있지 않은지 확인한 뒤에만 직접 발신 라우팅을 수행한다.

트렁크 인입에는 이 규칙을 적용하지 않는다. 정상 통신사 인입은 내선 REGISTER 상태와 무관하며, 트렁크 `identify match`와 DID allowlist로 판단해야 한다.

### 2차: 번호 임시 차단

동일한 `sourceNumber`가 짧은 시간 내 반복적으로 비정상 요청을 만들면 `NUMBER` 차단을 등록한다.

번호는 쉽게 위조되므로 단독 영구 차단에는 사용하지 않는다. 기본 TTL은 10분으로 둔다.

### 3차: IP 임시 차단

동일 IP가 여러 번호를 바꿔가며 공격하면 `IP` 차단으로 승격한다. 이 단계가 실제 강한 방어 계층이다.

저장소에는 차단 상태를 남기고, 운영 적용은 fail2ban/nftables 연동으로 확장한다. 현재 구현의 첫 단계는 CTI 서버가 차단 판단과 감사 가능한 상태를 만드는 것이다.

## 6. 장애/정합성 포인트

- 멀티노드 중복 처리는 기존 AMI 리더 선출을 따른다. 리더 노드만 차단 카운터를 증가시킨다.
- Redis 장애 시 자동 차단 카운터는 실패할 수 있으나 통화 세션 처리를 막지 않는다.
- 번호 차단은 오탐 가능성이 있으므로 짧은 TTL만 적용한다.
- IP 차단은 통신사/사내/VPN 허용 IP를 제외하는 allowlist 적용이 필요하다.
- 차단 기록은 DB에 남겨 운영자가 원인, 만료 시각, 대표 source/target을 확인할 수 있어야 한다.

## 7. 구현 우선순위

1. `sipSecurityBlocks` Prisma 모델과 마이그레이션 추가.
2. `SipSecurityService` 추가: AMI 보안 이벤트 파싱, Redis 카운터, DB 차단 upsert.
3. `AmiConnectionService`에서 리더 노드 보안 이벤트 전달.
4. `GET /sip-security/blocks` 조회 API 추가.
5. 상담원 endpoint 다이얼플랜에 REGISTER contact 확인 가드 추가.
6. 단위 테스트로 번호/IP 승격과 다이얼플랜 가드 회귀 검증.
7. 후속 단계에서 fail2ban/nftables 적용 스크립트가 DB/Redis 차단 목록을 반영하도록 확장.

## 8. 바로 생성할 파일 목록

- `apps/server/prisma/migrations/20260802_sip_security_blocks/migration.sql`
- `apps/server/src/modules/sip-security/sip-security.module.ts`
- `apps/server/src/modules/sip-security/sip-security.service.ts`
- `apps/server/src/modules/sip-security/sip-security.controller.ts`
- `apps/server/src/modules/sip-security/sip-security.service.spec.ts`
- `docs/design/2026-08-02-sip-invite-abuse-defense-design.md`
