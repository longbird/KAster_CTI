# PBX 운영 DB 마이그레이션 적용 절차

## 목적

PBX M1~M3 기능 반영에 필요한 Prisma 마이그레이션을 운영 DB에 적용하기 위한 절차다. 운영 DB 접속과 실행은 운영서버에서 직접 수행한다.

## 적용 대상 마이그레이션

운영 DB의 `_prisma_migrations` 기준으로 아래 마이그레이션이 적용되어 있어야 한다.

- `20260519_queue_distribution_mode`
- `20260520_branch_did_global_unique`
- `20260520_agent_extension_policy`
- `20260520_holiday_rules`
- `20260520_queue_unconditional_target`
- `20260521_trunk_display_number`

## 사전 점검

운영서버에서 `apps/server` 디렉터리로 이동한 뒤 실행한다.

```bash
cd apps/server
printenv DATABASE_URL >/dev/null
npx prisma migrate status
```

운영 DB 백업은 마이그레이션 전에 별도 보관한다.

```bash
pg_dump "$DATABASE_URL" --format=custom --file "kaster_cti_before_pbx_migration_$(date +%Y%m%d_%H%M%S).dump"
```

## 적용

```bash
cd apps/server
npx prisma migrate deploy
npx prisma generate
```

## 사후 DB 검증 SQL

운영 DB에서 아래 SQL이 기대값을 반환해야 한다.

```sql
SELECT migration_name, finished_at
FROM "_prisma_migrations"
WHERE migration_name IN (
  '20260519_queue_distribution_mode',
  '20260520_branch_did_global_unique',
  '20260520_agent_extension_policy',
  '20260520_holiday_rules',
  '20260520_queue_unconditional_target',
  '20260521_trunk_display_number'
)
ORDER BY migration_name;
```

```sql
SELECT 1
FROM pg_indexes
WHERE indexname = 'branchDids_tenantId_didId_key';
```

```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'queues'
  AND column_name IN (
    'distributionMode',
    'unconditionalTargetType',
    'unconditionalTargetValue'
  )
ORDER BY column_name;
```

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'agents'
  AND column_name IN (
    'extensionDisplayName',
    'extensionPolicy'
  )
ORDER BY column_name;
```

```sql
SELECT to_regclass('"tenantHolidayRules"') AS tenant_holiday_rules_table;
```

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'asteriskTrunks'
  AND column_name IN (
    'displayNumberMode',
    'manualDisplayNumber'
  )
ORDER BY column_name;
```

## 애플리케이션 검증

마이그레이션 후 서버 프로세스를 새 코드로 기동한 상태에서 확인한다.

```bash
curl -fsS "$API_BASE_URL/api/v1/health"
curl -fsS "$API_BASE_URL/api/v1/admin/settings/system/time-sync" \
  -H "Authorization: Bearer $SUPERVISOR_ACCESS_TOKEN"
curl -fsS "$API_BASE_URL/api/v1/asterisk-config/preview" \
  -H "Authorization: Bearer $SUPERVISOR_ACCESS_TOKEN" >/tmp/pbx-preview.json
```

관리자 화면에서는 아래 경로를 확인한다.

- 지사 설정: DID 필수, 대표번호, 착신전환 범위 검증
- 호 분배룰: 외부 착신 방식, 무조건 착신 대상
- 착신전환: 자정 넘는 시간표
- 상담원 설정: 내선 표시명
- PBX 설정: 트렁크 표시번호
- 시스템 설정: 시간 동기화 상태
- 번호 자원: DID/내선/호 분배룰 내선/기능 코드 충돌 표시

## 롤백 기준

Prisma 마이그레이션은 이미 적용된 DDL을 자동 롤백하지 않는다. 장애가 발생하면 먼저 애플리케이션을 이전 이미지/커밋으로 되돌리고, DB는 백업 복원 여부를 운영자가 판단한다.

백업 복원은 데이터 손실 위험이 있으므로 운영 중 신규 통화/설정 변경 여부를 확인한 뒤 별도 승인으로만 수행한다.
