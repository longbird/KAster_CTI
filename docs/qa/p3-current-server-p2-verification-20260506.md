# P3 착수 전 현재 서버 P2 기능 검증

작성일: 2026-05-06

대상:

- 기본 개발 서버: `http://49.247.46.86:3000`
- 상담원 앱: `http://49.247.46.86:5173`
- 관리자 앱: `http://49.247.46.86:5174`

## 1. 판정

현재 기본 개발 stack 기준 P2 기능 검증은 통과로 판정한다.

확인된 범위:

- server ready
- 상담원 앱 HTTP 200
- 관리자 앱 HTTP 200
- supervisor 로그인
- agent 로그인
- 상담원 공지 API
- 운영 모니터링 API
- 통화 이력 API
- IVR 실패 리포트 API
- 녹취 다운로드 감사 API

## 2. 검증 결과

| 항목 | 결과 | 증적 |
| --- | --- | --- |
| server ready | PASS | `GET /api/v1/health/ready`가 `ready: true` 반환 |
| 상담원 앱 | PASS | `GET :5173/` HTTP 200 |
| 관리자 앱 | PASS | `GET :5174/` HTTP 200 |
| supervisor 로그인 | PASS | `supervisor1 / 2001` access token 발급 |
| agent 로그인 | PASS | `agent1001 / 1001` access token 발급 |
| 공지 API | PASS | agent token으로 `GET /api/v1/announcements` 성공, 1건 반환 |
| 운영 모니터링 | PASS | supervisor token으로 `GET /api/v1/admin/monitoring/operations` 성공 |
| 통화 이력 | PASS | supervisor token으로 `GET /api/v1/calls/history?page=1&pageSize=5` 성공 |
| IVR 실패 리포트 | PASS | supervisor token으로 `GET /api/v1/admin/reports/ivr-failures?page=1&pageSize=5` 성공 |
| 녹취 다운로드 감사 | PASS | supervisor token으로 `GET /api/v1/admin/reports/recording-download-audits?page=1&pageSize=5` 성공 |

## 3. 운영 모니터링 응답 요약

`GET /api/v1/admin/monitoring/operations` 응답 요약:

- `status`: `ok`
- `leader`: `true`
- `checks.db`: `up`
- `checks.redis`: `up`
- `checks.ami`: `connected`
- `outbox.pending`: `0`
- `outbox.status`: `ok`
- `recovery.lastHour`: `0`
- `recovery.status`: `ok`
- `websocket.clients`: `0`
- `websocket.status`: `ok`
- `alerts`: `[]`

이 결과는 P3-2 외부 알림 연동의 기준 데이터로 사용할 수 있다.

## 4. 확인된 제한

다음 항목은 이번 검증 범위에서 제외했다.

- PBX smoke gate 실제 실행
- 운영 site 디렉터리 생성
- 운영 DB migration 적용
- 실제 상담원 PC SIP/오디오 검증
- 외부 알림 발송

제외 이유:

- PBX smoke gate는 site별 DID, caller, queue, agent, SIP UAS password가 확정되어야 한다.
- 운영 site 디렉터리는 실제 site code와 운영 URL/secret이 필요하다.
- 실제 상담원 PC 검증은 현장 PC, 내선, 헤드셋, 접근 시간이 필요하다.

## 5. 다음 단계

1. 운영 site 값을 확정한다.
2. `deploy/sites/<site-code>`를 생성한다.
3. `docs/operations/p3-release-preflight-20260506.md` 순서대로 preflight를 실행한다.
4. 리허설 stack을 P2 최신 코드로 재빌드한 뒤 P3 smoke gate를 반복한다.
5. smoke gate 결과를 `docs/qa/`에 저장한다.
