# CTI 실시간 이벤트 계약

작성일: 2026-04-30
기준 계획서: `docs/project-integrated-plan.md`

## 범위

이 문서는 CTI 서버가 Socket.IO `/ws` namespace로 발행하는 운영 이벤트와 클라이언트가 구독해야 하는 이벤트를 고정한다.

## 공통 전송 기준

- namespace: `/ws`
- 인증: Socket.IO `auth.token` 또는 `query.token`의 JWT
- envelope: WebSocket 이벤트는 REST envelope을 쓰지 않고 이벤트 이름과 payload를 직접 전달한다.
- 범위: 서버가 `tenantId`를 아는 이벤트는 Socket.IO `tenant:{tenantId}` room으로 전달한다.
- REST 보정: 재연결, 이벤트 누락, 화면 최초 진입은 REST 조회로 현재 상태를 보정한다.

## 이벤트 목록

| 이벤트 | 생산자 | 주요 소비자 | payload | 발생 조건 | REST 보정 |
| --- | --- | --- | --- | --- | --- |
| `call.created` | CTI 서버 outbox | 상담원 웹, 관리자 앱, 데스크톱 앱 | active call | 신규 통화 세션 생성 | `GET /calls/active` |
| `call.updated` | CTI 서버 outbox | 상담원 웹, 관리자 앱, 데스크톱 앱 | active call | 통화 상태 변경 | `GET /calls/:callId`, `GET /calls/active` |
| `call.ended` | CTI 서버 outbox | 상담원 웹, 관리자 앱, 데스크톱 앱 | `{ callId, endedAt, talkSeconds }` | 통화 종료 | `GET /calls/:callId` |
| `screenpop.customer` | CTI 서버 outbox enrichment | 상담원 웹, 데스크톱 앱 | `{ callId, customer }` | 신규 통화와 고객 매칭 성공 | 고객 상세 API |
| `agent.status.changed` | 인증/상태 변경 서비스 | 상담원 웹, 관리자 앱, 데스크톱 앱 | `{ agentId, statusCode, reasonCode }` | 로그인 또는 상태 변경 | `GET /me/session`, `GET /agents` |
| `queue.summary.updated` | 상태 변경/outbox | 상담원 웹, 관리자 앱, 데스크톱 앱 | queue summary array | 통화/상담원 상태가 큐 요약에 영향 | `GET /queues/summary` |

## 구현 순서

1. 서버 이벤트 이름 상수화
2. 클라이언트 구독 이벤트 목록 정합화
3. payload 타입 차이 제거
4. 관리자 앱 WebSocket 소비 추가
5. 테스트 앱에서 WebSocket 이벤트 검증 추가

## 현재 차이와 후속 작업

- 관리자 앱은 Socket.IO 클라이언트를 추가했고, 대시보드 훅은 `call.*`, `agent.status.changed`, `queue.summary.updated` 수신 시 기존 REST 조회를 즉시 재실행한다. 화면별 payload 직접 reducer는 후속 작업으로 둔다.
- `screenpop.customer`는 고객 enrichment가 있을 때만 발행된다. 고객 미매칭 인입은 별도 screen pop 없이 `call.created`/`call.updated` 흐름에 남고, payload의 `customer`는 `null`이거나 없을 수 있다.
- 서버는 `tenantId`가 있는 이벤트를 tenant room으로 전달한다. Redis 장애 fallback도 같은 tenant room 기준으로 동작한다.
- 상담원 웹 앱과 데스크톱 앱은 `agent.status.changed`를 현재 로그인한 agentId와 일치할 때만 자기 상태로 반영한다.
- 통화 lifecycle 이벤트의 상담원별 필터링은 아직 정책 확정 전이다. 큐/관리자 화면은 같은 tenant 내 여러 콜을 볼 수 있으므로 agent room 분리는 후속 작업에서 화면별 요구와 함께 정리한다.
- `mute` 요청은 서버가 Redis mute state를 갱신한 뒤 `call.updated`를 발행해 다른 클라이언트도 `isMuted`를 받게 한다.
- `transfer` 요청은 서버가 세션을 `TRANSFERRING`으로 갱신한 뒤 `call.updated`를 발행한다.
- `hold`/`resume` 요청은 REST ack만으로 UI 상태를 확정하지 않는다. 최종 `HOLD`/`TALKING` 전환은 PBX 후속 이벤트에서 생성되는 `call.updated`를 기준으로 한다.
- `hangup` 요청은 REST ack만으로 UI에서 통화를 제거하거나 `ENDED`로 확정하지 않는다. 최종 종료는 PBX 후속 이벤트에서 생성되는 `call.ended`를 기준으로 한다.
- 데스크톱 앱은 이제 `screenpop.customer`를 구독하고 매칭된 고객을 `activeCall`에 저장한다. 다만 고객 상세 필드의 범위와 표시는 서버 payload 및 고객 상세 API 기준으로 별도 정렬한다.
- 상담 전환 취소/완료의 실패 복구 UX는 통화 제어 상태 서버 동기화 후속 작업에서 확정한다.
