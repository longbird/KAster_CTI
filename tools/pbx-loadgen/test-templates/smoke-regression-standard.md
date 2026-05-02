# PBX Smoke / Regression 표준

작성일: 2026-05-01

## 목적

운영 반영 전후에 같은 형식으로 PBX 서버, CTI 서버, WebSocket, DB 상태를 확인한다. site별 DID, 큐, 상담원 내선, 허용 발신번호만 바꾸고 시나리오는 재사용한다.

## 표준 세트

| 세트 | 목적 | 최소 통과 기준 |
| --- | --- | --- |
| inbound-smoke | DID 인입과 CTI 세션 생성 확인 | SIP 200, `call.created/call.updated`, `/calls/active` 조회 |
| ivr-smoke | DTMF 라우팅과 timeout/fallback 확인 | 입력별 큐 또는 액션 일치, 잘못된 입력 실패 원인 기록 |
| queue-distribution-smoke | 큐 대기/분배 상태 확인 | `/queues/summary` 대기/링잉/통화 값 변화 |
| agent-connect-smoke | 상담원 연결과 종료 상태 확인 | `RINGING_AGENT -> TALKING -> ENDED` 순서 |
| transfer-smoke | blind/attended 전환 명령 확인 | REST ack, 후속 전환 이벤트 또는 실패 사유 |
| opt-out-smoke | 수신거부 등록/해제 확인 | 대표번호 경로 등록, 설정 dry-run 차이 확인 |
| regression-core | 위 smoke를 동일 DID/큐 조합으로 반복 | 실패율, 평균 응답 시간, 이벤트 누락 0건 |

## 실행 순서

1. 반영 전 `pbx-config-preflight-smoke.ps1`로 CTI API와 PBX 설정 dry-run을 확인한다.
2. site 값 파일을 기준으로 smoke 세트를 실행한다.
3. 설정 반영 또는 배포를 수행한다.
4. 같은 smoke 세트를 다시 실행한다.
5. regression-core는 운영 창에서만 실행하고 결과 JSON/CSV를 보관한다.

## 결과 분류

| 실패 위치 | 판단 기준 |
| --- | --- |
| PBX 서버 | SIP 실패, DTMF 미동작, reload 실패, 음원 재생 실패 |
| CTI 서버 | REST 실패, DB 상태 누락, 이벤트 outbox backlog |
| WebSocket | DB/REST 상태는 맞지만 이벤트가 누락되거나 지연됨 |
| 테스트 앱 | SIP/REST 입력값 오류, allowlist/계정 설정 불일치 |

## 필수 증적

- 실행 시각, site, DID, 큐, 상담원 내선
- loadgen command line
- SIP 결과 요약
- CTI REST 조회 결과
- WebSocket 이벤트 수신 목록
- 실패 시 다음 조사 위치
