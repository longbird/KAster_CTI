# Prisma schema ↔ migration 드리프트 해소 계획

- 작성일: 2026-08-08
- 발견 경위: CI 신설 시 추가한 `server (prisma schema drift)` job 이 최초 실행에서 검출
- 상태: **미해소.** CI 에서는 분리했고 이 문서가 후속 과제다

## 1. 무엇이 어긋났나

`prisma/migrations/` 는 전부 수기 작성이고 `schema.prisma` 와 따로 관리돼 왔다.
그 결과 **55개 테이블 / 171건**이 어긋나 있다.

재현:

```bash
cd apps/server
# 셰도 DB 가 필요하다 (로컬이면 docker compose up -d postgres 후 빈 DB 하나)
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "postgresql://kaster:kaster@localhost:5432/shadow" \
  --exit-code
```

## 2. 유형별 분류

| 유형 | 건수 | 영향 | 판단 |
|---|---:|---|---|
| `gen_random_uuid()` DB 기본값 vs `@default(uuid())` | 49 | Prisma 가 앱에서 UUID 를 채우므로 평상시 무해. **raw SQL insert 경로에서만 차이** | 낮음 |
| `updatedAt` 의 `NOW()` 기본값 유무 | 16 | 위와 동일 | 낮음 |
| 인덱스명 snake_case vs camelCase (`tenants_tenant_code_key` ↔ `tenants_tenantCode_key`) | 39 | 동작 영향 없음. 다만 마이그레이션 도구가 매번 차이로 본다 | 낮음 |
| **`tenantSystemSettings.sipRegisterPort` 기본값 5060 vs 36070** | 1 | **의미 있는 차이.** raw SQL 로 행을 만들면 5060, Prisma 로 만들면 36070 이 들어간다 | **확인 필요** |

증거 일부:

```text
[*] Changed the `AsteriskDid` table
  [*] Altered column `id` (default changed from `Some(DbGenerated(Some("gen_random_uuid()")))` to `None`)
[*] Changed the `tenantSystemSettings` table
  [*] Altered column `sipRegisterPort` (default changed from `Some(Value(Int(5060)))` to `Some(Value(Int(36070)))`)
[*] Changed the `tenants` table
  [*] Renamed index `tenants_tenant_code_key` to `tenants_tenantCode_key`
```

## 3. 왜 지금 안 고쳤나

- 해소하려면 **실 PostgreSQL 에 마이그레이션을 적용해보고** 조정해야 한다. 로컬 Docker 가
  없어 검증 없이 손대면 운영 DB 를 깨뜨릴 위험이 있다.
- 드리프트 대부분은 무해하지만 어느 것이 무해한지 판정하려면 운영 DB 의 **현재 실제 상태**를
  봐야 한다. 마이그레이션이 진실인지 스키마가 진실인지는 배포된 DB 가 답한다.
- CI 신설 범위를 넘는다. 붙이자마자 영구히 빨간 job 을 두면 CI 전체가 무시된다.

## 4. 해소 절차 (제안)

1. 운영/스테이징 DB 에서 실제 상태를 뜬다.
   ```bash
   npx prisma db pull --schema=/tmp/actual.prisma
   ```
2. `schema.prisma` 와 비교해 **어느 쪽이 실제와 맞는지** 판정한다.
3. `sipRegisterPort` 기본값부터 확정한다. 5060(SIP 표준) 과 36070(현재 스키마) 중
   운영에서 쓰는 값이 무엇인지 확인이 필요하다.
4. 무해한 항목(uuid/now 기본값, 인덱스명)은 정합 마이그레이션 1건으로 한 번에 맞춘다.
5. 맞춘 뒤 CI 에 드리프트 job 을 되살린다 (아래 5장).

## 5. CI 복구 방법

`.github/workflows/ci.yml` 의 `server-schema` job 에 아래 step 을 되돌린다.
`--exit-code` 는 0=차이없음 / 2=차이있음 / 그외=명령실패이므로 셋을 구분해야 한다.

```yaml
      - name: detect schema/migration drift
        run: |
          set +e
          out=$(npx prisma migrate diff \
            --from-migrations prisma/migrations \
            --to-schema-datamodel prisma/schema.prisma \
            --shadow-database-url "$SHADOW_DATABASE_URL" \
            --exit-code 2>&1)
          rc=$?
          echo "$out"
          case "$rc" in
            0) echo "드리프트 없음" ;;
            2) echo "::error::schema.prisma 와 prisma/migrations 가 어긋납니다."; exit 1 ;;
            *) echo "::error::migrate diff 실행 실패 (exit $rc)."; exit 1 ;;
          esac
        env:
          SHADOW_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/shadow
```

`DATABASE_URL` 은 job 에 남아 있지만 **postgres 서비스 컨테이너는 제거했다** (쓰는 step 이
없는데 매 실행마다 기동하면 낭비다). 되살릴 때 아래도 함께 추가한다.

```yaml
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: shadow
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
```

## 6. 그때까지의 방어선

드리프트 job 없이도 아래는 CI 에서 계속 돈다.

- `npx prisma validate` — 스키마 문법·관계 무결성
- `src/modules/resilience/schema-contract.spec.ts` — 신규 resilience 6테이블에 한해
  `schema.prisma` 와 `migration.sql` 의 테이블 집합이 일치하는지 검사

즉 **새로 추가하는 테이블은 드리프트가 생기지 않도록** 계약 테스트로 막고 있고,
이 문서의 과제는 그 이전부터 누적된 분량이다.
