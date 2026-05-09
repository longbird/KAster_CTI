# P3-1 운영 배포/릴리즈 안정화 Preflight

작성일: 2026-05-06

기준:

- 현재 기본 개발 stack: `kaster-server`, `kaster-web`, `kaster-admin`
- 현재 리허설 stack: `rehearsal-20260501`
- site template: `deploy/sites/_template`
- PBX smoke gate: `scripts/pbx-smoke-run-gate.ps1`

## 1. 현재 서버 판정

현재 서버 기준으로 P3-1 착수는 가능하다.

단, 현재 상태는 운영 전환 완료 상태가 아니라 preflight를 정리하고 운영 site 값을 주입할 준비 단계다.

확인된 상태:

- 기본 개발 서버 `kaster-server`는 `GET /api/v1/health/ready`가 정상 응답한다.
- 기본 관리자 앱은 `5174`에서 정상 응답한다.
- 기본 상담원 앱은 `5173`에서 실행 중이다.
- 리허설 stack `rehearsal-20260501`은 gateway, web, admin, server, postgres, redis가 실행 중이다.
- 리허설 gateway는 API host header 기준으로 `GET /api/v1/health/ready`가 정상 응답한다.
- PBX 설정 owner marker는 `/etc/asterisk/.kaster-cti-config-owner` 경로에 존재한다.
- `deploy/sites`에는 현재 `_template`만 있고 실제 운영 site 디렉터리는 아직 없다.
- `scripts/deploy-prod.sh`가 추가되어 site별 compose config, backup, build/up, health gate를 한 번에 실행한다.

따라서 P3-1의 첫 완료 목표는 실제 운영 배포가 아니라, 운영 site 값이 들어왔을 때 중단 조건과 검증 순서가 흔들리지 않도록 고정하는 것이다.

## 2. 운영 site 입력값

운영 site 디렉터리를 만들기 전에 다음 값을 확정한다.

| 항목 | 필요값 | 비고 |
| --- | --- | --- |
| site 코드 | 예: `prod-main`, `customer-a` | 컨테이너명, 이미지명, 볼륨명에 사용 |
| 상담원 앱 도메인 | 예: `cti.example.com` | `SITE_DOMAIN` |
| 관리자 앱 도메인 | 예: `admin.cti.example.com` | `ADMIN_DOMAIN` |
| API 도메인 | 예: `api.cti.example.com` | `API_DOMAIN` |
| HTTP 포트 | 예: `80`, `5180` | 단일 서버 다중 site면 충돌 확인 |
| DB 이름/계정/비밀번호 | 운영 전용 값 | 기존 운영 DB면 migration precheck 필수 |
| JWT secret | 긴 랜덤 문자열 | 기본값 사용 금지 |
| PBX AMI host/port | 운영 PBX 서버 값 | 방화벽/접속 허용 확인 |
| PBX AMI 계정/비밀번호 | 운영 계정 | 서버 env와 PBX 설정이 일치해야 함 |
| PBX 설정 경로 | 기본 `/etc/asterisk` | owner guard 적용 대상 |
| CORS origin | 상담원/관리자 URL | REST/WS 둘 다 확인 |
| smoke DID/caller/queue/agent | 테스트 가능한 값 | smoke gate 입력값 |
| rollback 기준 | 중단/복구 담당자 포함 | 배포 전 확정 |

## 3. 운영 site 디렉터리 설계

운영 site는 `deploy/sites/_template`을 복사해서 만든다.

예시:

```text
deploy/sites/prod-main/
  .env
  compose.prod.yml
  nginx/default.conf.template
```

설계 원칙:

- `_template`은 직접 수정 가능한 실행 site가 아니라 새 site의 기준본이다.
- site별 `.env`에는 운영 secret이 들어가므로 git에 커밋하지 않는다.
- `compose.prod.yml`은 site별로 필요한 포트, 볼륨, 외부 네트워크만 최소 수정한다.
- 프론트엔드 URL은 현재 build-time env 방식이므로 site URL 변경 시 이미지 rebuild가 필요하다.
- 같은 서버에 여러 site를 올릴 경우 `HTTP_PORT`, 컨테이너명, 볼륨명 충돌을 먼저 확인한다.

현재 template의 한계:

- 운영 배포는 `scripts/deploy-prod.sh --site-dir deploy/sites/<site-code>` 기준으로 수행한다.
- image registry push/pull 절차는 아직 자동화되어 있지 않다.
- DB backup과 rollback은 별도 runbook 명령으로 수행해야 한다.

## 4. 배포 전 preflight

### 4.1 파일과 설정 확인

1. 운영 site 디렉터리가 존재하는지 확인한다.
2. `.env`가 `.env.example`의 모든 키를 채웠는지 확인한다.
3. `JWT_SECRET`, DB 비밀번호, AMI secret이 기본값이 아닌지 확인한다.
4. `VITE_API_BASE_URL`, `VITE_WS_URL`, `REST_CORS_ORIGIN`, `WS_CORS_ORIGIN`이 운영 도메인과 일치하는지 확인한다.
5. 운영 서버에서 `HTTP_PORT`가 사용 중인지 확인한다.
6. 운영 PBX AMI host/port에 서버에서 접속 가능한지 확인한다.

중단 조건:

- 필수 env 값 누락
- secret 기본값 사용
- HTTP 포트 충돌
- AMI 접속 불가
- 운영 URL과 CORS/WS URL 불일치

### 4.2 DB migration precheck

1. 운영 DB가 신규인지 기존 DB인지 확인한다.
2. 기존 DB면 backup을 먼저 수행한다.
3. `prisma migrate status`로 적용 상태를 확인한다.
4. migration 적용 전후 schema drift가 있는지 확인한다.
5. migration 실패 시 컨테이너 재시작 루프가 발생하지 않도록 중단 절차를 준비한다.

중단 조건:

- backup 미수행
- migration status 실패
- 기존 운영 DB baseline 불일치
- migration 적용 중 destructive 변경 감지

### 4.3 PBX 설정 owner guard

PBX 설정 경로를 mount하거나 reload를 수행하기 전 owner marker를 확인한다.

확인 대상:

```text
/etc/asterisk/.kaster-cti-config-owner
```

판정:

- marker가 없으면 신규 site가 owner를 설정할 수 있는지 운영자가 승인해야 한다.
- marker가 현재 site code와 같으면 진행 가능하다.
- marker가 다른 site code면 즉시 중단한다.

현재 서버 확인값:

- owner marker 파일은 존재한다.
- 리허설 stack은 `/etc/asterisk`와 `/var/lib/asterisk/sounds/custom`을 mount하고 있다.
- 기본 개발 server는 PBX 설정 mount 없이 동작하도록 분리되어야 한다.

중단 조건:

- 다른 site가 owner인 PBX 설정 경로에 반영 시도
- 기본 개발 stack과 리허설/운영 stack이 같은 PBX 설정 경로를 동시에 write mount
- reload 대상과 owner marker가 불일치

## 5. 배포 실행 순서

현재 저장소 기준 실행 방식:

```bash
cd deploy/sites/<site-code>
docker compose -f compose.prod.yml --env-file .env config
docker compose -f compose.prod.yml --env-file .env build
docker compose -f compose.prod.yml --env-file .env up -d
```

권장 순서:

1. compose config 검증
2. image build
3. DB backup
4. migration status 확인
5. stack up
6. server logs에서 migration 성공 확인
7. health 확인
8. gateway route 확인
9. 관리자 앱 접근 확인
10. 상담원 앱 접근 확인
11. PBX 설정 dry-run 확인
12. PBX smoke gate 실행

중단 조건:

- compose config 실패
- build 실패
- migration 실패
- server health 실패
- gateway API route 실패
- 관리자/상담원 앱 정적 파일 응답 실패
- PBX dry-run validation 실패
- PBX smoke gate `Final verdict: PASS` 미달

## 6. 배포 후 smoke 순서

### 6.1 health

확인:

```bash
curl -fsS http://<api-host>/api/v1/health/ready
```

기대:

```json
{"success":true,"data":{"ready":true},"error":null}
```

### 6.2 gateway route

확인:

- 상담원 host `/`는 상담원 앱 HTML을 반환한다.
- 관리자 host `/`는 관리자 앱 HTML을 반환한다.
- API host `/api/v1/health/ready`는 JSON을 반환한다.
- API host `/socket.io/`는 WebSocket handshake 대상 서버로 전달된다.

주의:

- IP와 port로 직접 접근하면 첫 번째 nginx server block이 선택될 수 있다.
- 운영 검증은 반드시 운영 host header 또는 실제 도메인 기준으로 수행한다.

### 6.3 관리자/상담원 앱 접근

확인:

- 관리자 앱 첫 화면 HTTP 200
- 상담원 앱 첫 화면 HTTP 200
- login API 성공
- 관리자 권한 API 성공
- 상담원 공지 API 성공

### 6.4 PBX smoke gate

기준 스크립트:

```powershell
scripts/pbx-smoke-run-gate.ps1
```

필수 입력:

- `-SiteName`
- `-ScenarioFile`
- `-CallerId`
- `-Did`
- `-QueueName`
- `-AgentExtension`
- `-ApiBaseUrl`
- `-WsBaseUrl`
- `-ApiHostHeader`

완료 기준:

- validate 통과
- dry-run 통과
- SIP 인입 또는 테스트 UAS 흐름 통과
- WebSocket capture에서 주요 call event 관측
- CTI DB/AMI/log 수집 리포트 생성
- 최종 리포트 `Final verdict: PASS`

## 7. 기본 개발 stack 기준 P2 기능 검증 항목

P3 착수 전 현재 기본 개발 stack에서 최소 확인할 항목은 다음이다.

| 영역 | 확인 항목 | 기대 |
| --- | --- | --- |
| server | `GET /api/v1/health/ready` | ready true |
| admin | `GET /` on `5174` | HTTP 200 |
| web | `GET /` on `5173` | HTTP 200 |
| auth | supervisor login | access/refresh 발급 |
| 공지 | agent token으로 `GET /announcements` | envelope 응답 |
| 운영 모니터링 | supervisor token으로 `GET /admin/monitoring/operations` | status/outbox/recovery/ws 지표 |
| 통화 리포트 | supervisor token으로 `GET /calls/history` | history envelope 응답 |
| IVR 실패 | supervisor token으로 `GET /admin/reports/ivr-failures` | list/pagination 응답 |
| 녹취 감사 | supervisor token으로 `GET /admin/reports/recording-download-audits` | masked field 포함 응답 |

## 8. 다음 작업

1. 운영 site 값을 확정한다.
2. `deploy/sites/<site-code>` 디렉터리를 생성한다.
3. P3 preflight 결과 파일을 `docs/qa/`에 남긴다.
4. `scripts/deploy-prod.sh`를 실제 site 값으로 dry-run 또는 staging site에 적용한다.
5. 리허설 stack을 P2 최신 코드로 재빌드해 P3 smoke를 반복한다.
