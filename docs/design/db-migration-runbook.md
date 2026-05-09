# 운영 DB Migration Runbook

작성일: 2026-05-01

## 원칙

- 운영 DB에는 `prisma migrate deploy`만 사용한다.
- `prisma db push`는 운영 적용 절차가 아니다.
- `npm run prisma:sync`의 `db push` fallback은 `ALLOW_PRISMA_DB_PUSH_FALLBACK=true`를 명시한 로컬/개발 DB 보정에만 허용한다.
- schema 변경이 없는 배포와 있는 배포를 분리한다.
- 실패 시 무리한 rollback보다 백업 복원 또는 forward-fix를 선택한다.

## 1. 사전 확인

```bash
cd apps/server
npx prisma migrate status
npx prisma generate
npm run build
```

확인 항목:

- 새 migration 디렉터리가 의도된 변경만 포함하는지 확인
- destructive SQL이 있는 경우 고객 데이터 영향 검토
- 운영 DB baseline 차이가 있으면 배포 중지 후 별도 보정 계획 작성

## 2. 백업

사이트 compose 기준:

```bash
mkdir -p deploy/sites/<site>/backups
docker compose -f deploy/sites/<site>/compose.prod.yml --env-file deploy/sites/<site>/.env exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip -c > deploy/sites/<site>/backups/postgres-$(date +%Y%m%d-%H%M%S).sql.gz
```

백업 파일 크기가 0이면 배포를 중지한다.

## 3. 적용

```bash
docker compose -f deploy/sites/<site>/compose.prod.yml --env-file deploy/sites/<site>/.env run --rm server \
  npx prisma migrate deploy
```

## 4. 사후 확인

```bash
docker compose -f deploy/sites/<site>/compose.prod.yml --env-file deploy/sites/<site>/.env run --rm server \
  npx prisma migrate status
```

API 확인:

- `GET /api/v1/health`
- 로그인
- 관리자 대시보드
- PBX dry-run
- 대표 통화 smoke

## 5. 실패 처리

| 실패 위치 | 조치 |
| --- | --- |
| migration 적용 전 preflight 실패 | 배포 중지, migration 수정 |
| migration 중 실패, 데이터 변경 없음 | 원인 수정 후 `migrate deploy` 재시도 |
| migration 중 일부 적용 | 백업 복원 또는 forward-fix migration 작성 |
| 앱 배포 후 오류 | 이전 이미지로 서비스 rollback, DB는 forward-fix 우선 |

## 6. 배포 유형별 체크리스트

### Schema 변경 없음

- [ ] 앱 build 통과
- [ ] `.env` 변경 검토
- [ ] 운영 백업 생성
- [ ] 서비스 재기동
- [ ] health/smoke 통과

### Schema 변경 있음

- [ ] migration SQL 검토
- [ ] `migrate status` 확인
- [ ] 운영 백업 생성
- [ ] `migrate deploy` 성공
- [ ] 앱 재기동
- [ ] health/smoke 통과
- [ ] migration 결과와 배포 로그 보관
