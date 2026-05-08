# PR2-4 — 상담원 업무시간 시간대별 분포 차트

> BlueSky `ViewSearchStaffWorkTime` 등가물. plan: `~/.claude/plans/8-temporal-gray.md` PR 2-4.

## 변경 요약

`agentStatusHistory` 의 (startedAt, endedAt, statusCode) 행을 조회 윈도우와 교차해서 시간대 bucket 으로 prorate 분배해 합산하는 신규 endpoint + Antd Charts 기반의 stacked column 차트.

## DB 변경
없음 (집계 쿼리만).

## 서버

### Endpoint
- `GET /admin/reports/agent-work-time?from=&to=&granularity=hour|half_hour|day&groupBy=agent|group&agentId=&agentGroupId=`
- 가드: `JwtAuthGuard + RolesGuard + @Roles('supervisor','admin')` + `menuPermission.assert('kpi','view')` (별도 메뉴 키 추가 없이 기존 `kpi` 메뉴 권한 재사용).

### 집계 규칙
- 단순 `groupBy(date_trunc(...))` 가 아니라 다음을 모두 처리:
  - **윈도우 경계 처리**: `effectiveStart = max(startedAt, from)`, `effectiveEnd = min(coalesce(endedAt, now()), to)`. `effectiveEnd <= effectiveStart` 면 행 제외.
  - **열린 구간**: `endedAt IS NULL` 인 행은 `min(now(), to)` 로 닫음.
  - **여러 bucket 에 걸친 행**: 각 bucket 의 겹친 초만큼 분배 (PostgreSQL `generate_series` + `LEAST/GREATEST` 교차 산출).
  - 결과는 `bucketStart × agentId × statusCode` 매트릭스. 응답에서 `groupBy=group` 이면 `seriesKey/seriesLabel` 을 group 으로 치환.
- `durationSeconds` 컬럼은 단일행 합산 검증용으로만 두고, 시간대별 합산에는 직접 쓰지 않음 (행이 bucket 경계를 넘어갈 때 부정확).

### 코드 위치
- DTO: `apps/server/src/modules/admin/dto/list-agent-work-time-query.dto.ts`
- Service: `AdminService.listAgentWorkTime` (admin.service.ts 끝부분, `prisma.$queryRaw` raw SQL)
- Controller: `AdminController.listAgentWorkTime` (`GET /admin/reports/agent-work-time`)

### 응답 구조
```ts
{
  granularity: 'hour' | 'half_hour' | 'day',
  groupBy: 'agent' | 'group',
  windowSeconds: number,        // bucket 폭(검증용)
  from: string, to: string,
  buckets: Array<{
    bucketStart: string,        // ISO
    seriesKey: string,          // agentId or agentGroupId
    seriesLabel: string,        // agentName or groupName
    statusCode: string,         // AVAILABLE/TALKING/...
    seconds: number
  }>
}
```

## 프론트

### 신규
- `apps/admin/src/features/kpi/AgentWorkTimeChart.tsx`
  - `@ant-design/charts` 의 `Column` (stack=true) — 시간 bucket X축, 상태별 색상 누적, 분 단위 표시.
  - 컨트롤: 기간(RangePicker), granularity(30분/1시간/1일), groupBy(상담원별/그룹별), 상담원 필터, 그룹 필터.
  - 데이터 fetch 의존성 변경 시 자동 재조회.
  - 한글 status 라벨 매핑 내장 (AVAILABLE→대기, TALKING→통화 중, ...).

### 수정
- `apps/admin/src/features/kpi/KpiPage.tsx` — 큐별 현황 카드와 시간대별 트래픽 사이에 `<AgentWorkTimeChart />` 삽입.

### 의존성
- `apps/admin/package.json` 에 `@ant-design/charts` 추가 (전체 admin 에서 첫 차트 라이브러리 도입).

## 검증 결과

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` (server) | ✅ exit=0 |
| `npx tsc -b` (admin) | ✅ exit=0 (출력 없음 — clean) |
| dev DB 마이그레이션 | 불필요 (DB 변경 없음) |
| 실 데이터 검증 | ⏳ 사용자 측 수동 — 운영 DB 의 `agentStatusHistory` 보유 행으로 차트 렌더 확인 필요 |

## 운영 인수인계

- 마이그레이션 불필요. server/admin 빌드 + 재배포만.
- 사용 흐름: 업무 현황 조회(KPI) → "상담원 업무시간 분포" 카드에서 기간/granularity/groupBy/필터 선택 → 자동 stack column 갱신.
- 빈 결과는 `Empty` 컴포넌트로 "조회 결과 없음" 표시.
- raw SQL 은 camelCase quoted identifier 사용 (`"agentStatusHistory"`, `"startedAt"` 등). schema.prisma 의 모델/필드명을 그대로 따름.

## 변경 파일 목록

### 신규
- `apps/server/src/modules/admin/dto/list-agent-work-time-query.dto.ts`
- `apps/admin/src/features/kpi/AgentWorkTimeChart.tsx`
- `docs/work-log/20260507-pr2-4-agent-work-time-chart.md`

### 수정
- `apps/server/src/modules/admin/admin.service.ts` (listAgentWorkTime + import)
- `apps/server/src/modules/admin/admin.controller.ts` (GET endpoint + import)
- `apps/admin/src/features/kpi/KpiPage.tsx` (import + 차트 삽입)
- `apps/admin/package.json` (@ant-design/charts 추가)
- `apps/admin/package-lock.json`
