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
- [ ] **생성된 Prisma Client 가 새 schema 를 아는지 확인** (7장 참고 — 이미지를 다시 빌드하지 않는 배포에서 빠지기 쉽다)
- [ ] 앱 재기동
- [ ] health/smoke 통과
- [ ] migration 결과와 배포 로그 보관

## 7. 이미지를 다시 빌드하지 않는 배포에서 빠지는 단계

`deploy/sites/<site>/compose.prod.yml` 로 이미지를 다시 빌드하는 배포는 빌드 중에 `prisma generate` 가
돌므로 이 장이 필요 없다. **컴파일된 `dist` 만 올려 컨테이너를 재시작하는 방식**에서는 그 단계가 없다.

DB 에 컬럼은 생겼는데 컨테이너 안의 생성된 Client 는 그 컬럼을 모르는 상태가 되고, 그 필드를
`select` 하는 경로만 500 으로 죽는다. **health 는 200 을 그대로 돌려주므로 smoke 로는 안 잡힌다.**

실제 사례(2026-08-22): `tenantSystemSettings.agentOfferTimeoutSeconds` 를 추가하고 dist 만 올린 뒤
`POST /asterisk-config/reload` 가 `Unknown field ... for select statement` 로 실패했다. PBX 설정
반영 경로가 통째로 막혔다.

### 왜 컨테이너 안에서 바로 못 고치는가

`/app/node_modules/.prisma` 가 **읽기 전용 바인드 마운트**라 `docker exec ... npx prisma generate` 는
`EROFS` 로 실패한다. 같은 이미지를 그 경로만 쓰기 가능하게 마운트해 일회성으로 돌린다.

```bash
# 1. 바뀐 schema 를 호스트의 바인드 마운트 원본에 올린다
scp apps/server/prisma/schema.prisma <host>:<deploy>/server/prisma/schema.prisma

# 2. 같은 이미지로 일회성 컨테이너를 띄워 Client 를 다시 만든다
ssh <host> 'docker run --rm   -v <deploy>/server/prisma:/app/prisma:ro   -v <deploy>/prisma-client:/app/node_modules/.prisma   -w /app <image> npx prisma generate --schema /app/prisma/schema.prisma'

# 3. 새 필드가 실제로 들어갔는지 확인한다 (재시작 전에)
ssh <host> 'grep -c "<새필드명>" <deploy>/prisma-client/client/index.d.ts'

# 4. 재시작
ssh <host> 'docker restart <container>'
```

### 확인은 health 로 하지 마라

새 필드를 실제로 읽는 엔드포인트를 직접 불러라. schema 를 바꾼 이유가 된 그 기능이 확인 대상이다.
