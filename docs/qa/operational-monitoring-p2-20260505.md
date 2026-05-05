# P2-3 운영 모니터링과 알림 검증

일시: 2026-05-05

대상: 기본 개발 서버 `blueadm@49.247.46.86:/home/blueadm/kaster_cti`

## 구현 범위

- `GET /api/v1/admin/monitoring/operations` API를 추가했다.
- 기존 `/api/v1/health` 요약에 더해 운영 화면용 지표를 한 응답으로 묶었다.
- 관리자 `시스템 모니터링` 화면에 운영 지표 섹션을 추가했다.
- 10초 polling으로 health와 운영 지표를 갱신한다.

## 지표와 임계값

| 지표 | 정상 | 주의 | 장애 |
| --- | --- | --- | --- |
| DB | `up` | - | `down` |
| Redis | `up` | `degraded` | `down` |
| AMI | `connected` | - | `disconnected` |
| eventOutbox backlog | 0-9건 | 10-99건 | 100건 이상 |
| RECOVERY_TIMEOUT 최근 1시간 | 0건 | 1-9건 | 10건 이상 |
| WebSocket client 수 | 0건 이상 | - | 현재 1차 기준 없음 |
| stuck call | 0건 | 1건 이상 | - |

## 알림 기준

1차 구현은 관리자 화면 내 경고 배너로 알림을 표시한다.

- DB down: critical
- Redis down: critical
- AMI disconnected: critical
- eventOutbox backlog 10건 이상: warning
- eventOutbox backlog 100건 이상: critical
- RECOVERY_TIMEOUT 최근 1시간 1건 이상: warning
- RECOVERY_TIMEOUT 최근 1시간 10건 이상: critical
- stuck call 1건 이상: warning

외부 알림 채널은 아직 연결하지 않는다. Slack, 문자, 이메일 등 외부 채널은 운영 채널 확정 후 P3에서 별도 구현한다.

## 로컬 검증

- `cd apps/server && npm test -- --runTestsByPath test/admin-permissions.integration.spec.ts`
- `cd apps/server && npm test -- --runTestsByPath test/admin-permissions.integration.spec.ts test/calls-service.integration.spec.ts test/announcements.controller.spec.ts test/auth-softphone-config.integration.spec.ts`
- `cd apps/server && npm run build`
- `cd apps/admin && npm run build`

결과: 서버 4개 suite, 37개 test 통과. 서버/관리자 빌드 통과.

## 원격 검증

- `docker compose -f docker-compose.dev.yml up -d --build server admin`: 통과
- `GET http://127.0.0.1:3000/api/v1/health`: `db=up`, `redis=up`, `ami=connected`
- `docker inspect kaster-server --format '{{json .Mounts}}'`: `[]`
- `GET http://49.247.46.86:5174/monitoring`: HTTP 200
- `GET /api/v1/admin/monitoring/operations`: supervisor JWT로 호출 성공

실제 운영 지표 응답:

```text
status=ok
db=up
redis=up
ami=connected
outbox.pending=0
outbox.status=ok
recovery.lastHour=0
recovery.status=ok
websocket.clients=0
websocket.status=ok
alerts=[]
```

서버 최근 로그에서 `error|exception|failed` 패턴은 관측되지 않았다.
