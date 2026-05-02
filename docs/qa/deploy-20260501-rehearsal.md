# 운영 서버 배포 리허설 결과

일시: 2026-05-01
대상 서버: `blueadm@49.247.46.86`
리허설 경로: `/home/blueadm/kaster_cti_rehearsals/20260501_222458`
site dir: `deploy/sites/rehearsal-20260501`
gateway 포트: `5180`

## 목적

P0/P1 로컬 검증 산출물을 운영형 compose/site template 기준으로 실제 운영 서버에서 빌드, migration, 기동 가능한지 확인한다.

기존 개발형 컨테이너(`kaster-server`, `kaster-admin`, `kaster-web`)는 건드리지 않고 별도 리허설 디렉터리와 별도 compose project로 진행했다.

## 진행 결과

| 단계 | 결과 | 증적 |
| --- | --- | --- |
| 원격 접속 | 통과 | `ssh -F NUL blueadm@49.247.46.86` |
| Docker 확인 | 통과 | Docker `28.2.2`, Compose `v2.32.4` |
| site env 생성 | 통과 | 민감값 제외, 필수 env key 생성 확인 |
| compose config | 통과 | `docker compose ... config` |
| deploy script 문법 | 통과 | `bash -n scripts/deploy-prod.sh` |
| server image build | 통과 | `npx prisma generate && npm run build` 성공 |
| web image build | 통과 | Vite production build 성공 |
| admin image build | 통과 | Vite production build 성공 |
| DB migration | 실패 | `20260414_ops_followup`에서 P3018 |
| stack 기동 | 미진행 | migration 실패로 중단 |
| health/API/WebSocket 확인 | 미진행 | stack 미기동 |

## 발견한 사전 보정

운영 compose의 server service가 Dockerfile 기본 entrypoint를 덮어쓰며 `node dist/main.js`를 실행하도록 되어 있었다. 실제 서버 빌드 산출물은 `dist/src/main.js`이며 Dockerfile의 `docker-entrypoint.sh`가 이를 실행한다.

보정:

- `deploy/sites/_template/compose.prod.yml`에서 server `command` override 제거
- `AUTO_SEED_DEMO_DATA=false`를 운영 기본값으로 추가
- `deploy/sites/_template/.env.example`에 `AUTO_SEED_DEMO_DATA=false` 추가

## 차단 원인

`prisma migrate deploy`가 신규 DB에서 다음 오류로 중단됐다.

```text
Error: P3018
Migration name: 20260414_ops_followup
Database error code: 42P01
ERROR: relation "rawAmiEvents" does not exist
```

원인:

- `20260414_init` 수동 SQL은 `raw_ami_events`, `event_outbox`, `call_sessions`처럼 snake_case 테이블과 컬럼을 생성한다.
- 이후 migration과 현재 Prisma schema는 `"rawAmiEvents"`, `"eventOutbox"`, `"callSessions"`처럼 camelCase 식별자를 기대한다.
- 따라서 신규 운영 DB에서는 첫 migration 적용 후 후속 migration이 기존 테이블을 찾지 못한다.

추가 확인:

- `_prisma_migrations`에는 `20260414_init`만 완료됐고 `20260414_ops_followup`은 실패 로그가 남았다.
- 실패 후 생성된 리허설 컨테이너와 볼륨은 `docker compose down -v --remove-orphans`로 정리했다.

## 현재 판정

운영 서버 배포 리허설은 `DB migration chain 불일치`로 차단됐다.

이미지 빌드와 compose config는 통과했으므로 서버/프론트 빌드 문제가 아니라 신규 운영 DB 초기화 경로 문제다.

## 다음 보정 작업

1. 운영 DB 신규 설치 기준으로 Prisma migration chain을 정리한다.
2. 기존 개발/운영 DB가 이미 존재할 수 있으므로, 다음 중 하나를 선택한다.
   - 신규 운영 설치용 baseline migration을 별도로 재구성한다.
   - 기존 migration 앞단에 snake_case 초기 스키마를 camelCase Prisma 식별자로 변환하는 호환 migration을 추가한다.
3. 보정 후 같은 리허설 site로 `scripts/deploy-prod.sh --site-dir deploy/sites/rehearsal-20260501 --skip-backup`을 재실행한다.
4. migration 통과 후 `GET /api/v1/health`, `GET /api/v1/health/ready`, Swagger, 관리자 앱, 상담원 앱, WebSocket 연결을 확인한다.
