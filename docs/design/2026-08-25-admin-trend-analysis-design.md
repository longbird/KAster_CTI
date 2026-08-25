# 관리자 추이 분석 설계

작성일: 2026-08-25
상태: 승인 대기

## 1. 문제

관리자 대시보드는 **지금 이 순간**만 보여준다. 어제 이 시간에 몇 통이 들어왔는지,
대기가 언제 몰렸는지, 상담원이 부족했던 시간대가 언제인지 알 방법이 없다.

비유하면 지금 대시보드는 **속도계**다. 지금 몇 km/h 인지는 알려주지만, 어디서
막혔고 어디서 뚫렸는지는 기록하지 않는다. 필요한 것은 **블랙박스**다.

## 2. 지금 남는 것과 사라지는 것

이 구분이 설계 전체를 가른다.

### 남는 것 — 이벤트라서 DB 에 행이 쌓인다

| 테이블 | 쓸 수 있는 값 | 복원 가능한 지표 |
|---|---|---|
| `callSessions` | `startedAt` `answeredAt` `abandonFlag` `talkSeconds` `queueName` `primaryAgentId` | 호 인입 / 응답 / 포기 / 통화시간 |
| `queueEvents` | `eventType` `eventTime` `waitSeconds` `ringSeconds` `positionNo` | 대기시간 분포, 이탈 시점 |
| `agentStatusHistory` | `statusCode` `startedAt` `endedAt` | 임의 시각의 상담원 상태 분포 |

이 축은 **과거를 소급 조회할 수 있다.** 오늘 만든 화면으로 지난달을 볼 수 있다.

### 사라지는 것 — 순간값이라 지나가면 끝이다

- 대기큐 깊이 (지금 몇 명이 기다리는가)
- 트렁크 점유 채널 수
- SIP 단말 등록 수 / Reachable 수
- AMI 연결 상태, 리더 노드

이 축은 **적재하지 않으면 영원히 알 수 없다.** 그래서 스냅샷 테이블이 필요하다.

### 현재 구현의 한계

`admin.service.ts` 의 `traffic` 은 `callSessions` 를 **오늘 0시~현재 24버킷**으로만
즉석 집계한다 (`row.startedAt.getHours()`). 기간 선택도, 해상도 선택도, 비교도 없다.

`monitoring` 모듈은 `prom-client` 의 Node 기본 메트릭(heap/GC)만 `/metrics` 로
내보내고 **이걸 긁어가는 Prometheus 가 없다.** 즉 지금은 아무 데도 저장되지 않는다.

## 3. 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 순간값 저장 | **스냅샷 테이블** | 추가 인프라 없이 관리자 화면 안에서 끝난다. 사이트별 설치가 쉬워야 한다 |
| 화면 위치 | **새 메뉴 `추이 분석`** | 기간·해상도·지표 선택 공간이 필요하고, 실시간 대시보드는 가볍게 남긴다. 권한도 분리 |
| 해상도·보존 | **1분 90일 / 5분 1년** | 장애 분석은 며칠 안에 하고, 장기 비교는 상세 해상도가 필요 없다 |

Prometheus + Grafana 는 검토했으나 채택하지 않았다. 시계열에는 더 적합하지만
컨테이너 2개가 늘고, 화면이 관리자 대시보드 밖으로 나가며, 권한 체계가 분리된다.

## 4. 데이터 모델

### 4.1 `dashboardSnapshots`

테넌트 × 큐 단위로 한 행. 큐 축이 없으면 "어느 큐가 막혔는가"를 답할 수 없다.
테넌트 전체 합계는 `queueId = NULL` 행 하나로 같이 적재한다.

```prisma
model dashboardSnapshots {
  snapshotId          String   @id @default(uuid()) @db.Uuid
  tenantId            String   @db.Uuid
  /** NULL 이면 테넌트 전체 합계 행 */
  queueId             String?  @db.Uuid
  capturedAt          DateTime @db.Timestamptz(6)
  /** 이 행의 해상도. 롤업이 원본을 덮어쓰지 않게 구분한다 */
  resolution          String   @default("PT1M") @db.VarChar(8)

  // ── 통화 ──
  waitingCalls        Int      @default(0)
  longestWaitSeconds  Int      @default(0)
  talkingCalls        Int      @default(0)
  ringingCalls        Int      @default(0)

  // ── 상담원 ──
  agentsAvailable     Int      @default(0)
  agentsRinging       Int      @default(0)
  agentsTalking       Int      @default(0)
  agentsAcw           Int      @default(0)
  agentsBreak         Int      @default(0)
  agentsLoggedIn      Int      @default(0)

  // ── 리소스 (테넌트 합계 행에만 채운다) ──
  trunkChannelsInUse  Int?
  endpointsTotal      Int?
  endpointsRegistered Int?
  endpointsReachable  Int?
  amiConnected        Boolean?

  createdAt           DateTime @default(now()) @db.Timestamptz(6)

  tenant              tenants  @relation(fields: [tenantId], references: [tenantId])
  queue               queues?  @relation(fields: [queueId], references: [queueId])

  @@unique([tenantId, queueId, resolution, capturedAt])
  @@index([tenantId, resolution, capturedAt(sort: Desc)])
}
```

`@@unique` 가 중복 적재의 최종 방어선이다. 리더 전환 순간 두 노드가 같은 분에
동시 적재해도 `P2002` 로 한쪽이 떨어진다.

### 4.2 용량

큐 3개 + 합계 1행 = 분당 4행 기준:

```
1분 × 90일  × 4 =  518,400행
5분 × 275일 × 4 =  316,800행
합계 약 84만행 ≈ 120~180MB
```

큐가 10개면 약 3배. 여전히 부담 없는 규모다.

## 5. 적재 (`DashboardSnapshotService`)

```
매 1분 (setInterval)
  └ AmiLeaderElectionService.isLeader() 가드      ← 없으면 노드 수만큼 중복 적재
      ├ 통화·상담원 축: Prisma 집계 (기존 queuesService.getSummary 재사용)
      ├ 리소스 축: AMI 조회
      │    PJSIPShowContacts  → 등록/Reachable 단말 수
      │    CoreShowChannels   → 트렁크 점유 채널 수
      └ createMany({ skipDuplicates: true })
```

AMI 조회 배관은 **이미 있다.** `ami.sendActionWithResponse({Action}, {eventList: true})`
가 `ContactList` / `EndpointList` 프레임을 모아 돌려주고, `agents.service.ts` 와
`recovery-coordinator.service.ts` 에 호출 예가 있다. 새로 만들 것이 없다.

AMI 가 끊겨 있으면 리소스 축은 `null` 로 적재하고 `amiConnected: false` 를 남긴다.
**행을 건너뛰지 않는다** — 빈 구간과 "AMI 가 죽어 있던 구간"은 다른 사실이고,
장애 분석에서 후자가 더 중요하다.

### 롤업·정리 (`DashboardSnapshotRetentionService`)

매일 1회(리더 전용):
1. 90일 초과 `PT1M` 행을 5분 평균으로 접어 `PT5M` 행으로 쓴다
2. 접은 `PT1M` 행을 지운다
3. 1년 초과 `PT5M` 행을 지운다

`waiting` 류는 평균, `longestWaitSeconds` 는 최대로 접는다. 최장 대기를 평균 내면
피크가 사라져 지표의 의미가 없어진다.

## 6. 조회 API

```
GET /api/v1/admin/trends
  ?from=2026-08-01T00:00:00+09:00
  &to=2026-08-25T00:00:00+09:00
  &resolution=PT1M|PT5M|PT1H|P1D
  &queueId=<uuid>          (생략 시 테넌트 합계)
  &metrics=calls,queue,agents,resources
```

응답은 기존 `{success,data,error}` envelope 유지.

```jsonc
{
  "range": { "from": "...", "to": "...", "resolution": "PT5M" },
  "points": [
    {
      "at": "2026-08-25T09:00:00+09:00",
      "inbound": 12, "answered": 10, "abandoned": 2,     // callSessions 집계
      "avgWaitSeconds": 8, "avgTalkSeconds": 143,        // callSessions 집계
      "waitingCalls": 3, "longestWaitSeconds": 41,       // 스냅샷
      "agentsAvailable": 2, "agentsTalking": 4,          // 스냅샷
      "trunkChannelsInUse": 6, "endpointsReachable": 4   // 스냅샷
    }
  ]
}
```

**두 출처를 한 응답으로 합친다.** 통화 축은 `callSessions` 에서 요청 시점에 집계하고
(과거 소급 조회 가능), 리소스 축은 스냅샷에서 읽는다. 스냅샷이 없는 과거 구간은
리소스 필드가 `null` 로 나가고 화면은 그 구간을 끊어 그린다 — 0 으로 채우면
"트렁크가 놀고 있었다"는 거짓말이 된다.

`PT1H` / `P1D` 는 저장하지 않고 조회 시 집계한다. 저장 해상도는 2단계뿐이다.

### 권한

`MENU_KEYS` 에 `trends` 추가 → `menu-permission.service.ts`(서버) 와
`menuConfig.tsx`(관리자) 를 **같은 커밋에서** 맞춘다. 기본은 supervisor/admin.

## 7. 화면 (`apps/admin/src/features/trends/`)

```
┌──────────────────────────────────────────────────────┐
│ [오늘|어제|7일|30일|직접] [1분|5분|1시간|1일] [큐 ▾] │
├──────────────────────────────────────────────────────┤
│ 호 흐름     인입 / 응답 / 포기                        │
├──────────────────────────────────────────────────────┤
│ 대기 상황   대기 호수 / 최장 대기(초)                 │
├──────────────────────────────────────────────────────┤
│ 상담원      대기 / 통화 / 후처리 / 휴식  (누적 영역)  │
├──────────────────────────────────────────────────────┤
│ 리소스      트렁크 점유 / 등록 단말 / AMI             │
└──────────────────────────────────────────────────────┘
```

- 4개 차트가 **같은 x축**을 공유하고 커서를 공유한다. "대기가 몰린 그 시각에
  상담원이 몇이었나"를 눈으로 잇는 것이 이 화면의 목적이다
- 차트 라이브러리는 **넣지 않는다.** 기존 `TrafficChartCard` 가 순수 CSS 로
  그리고 있고, `apps/admin` 에 차트 의존성이 없다. 같은 방식으로 SVG polyline 을
  쓴다 (요청되지 않은 의존성 추가 금지)
- AMI 가 끊겼던 구간은 선을 끊고 회색 배경으로 표시한다

## 8. 파일 배치

| 파일 | 책임 | 신규/수정 |
|---|---|---|
| `prisma/schema.prisma` + migration | `dashboardSnapshots` | 수정 |
| `modules/trends/dashboard-snapshot.service.ts` | 1분 적재 (리더 가드) | 신규 |
| `modules/trends/snapshot-rollup.ts` | 롤업 순수 함수 (평균/최대) | 신규 |
| `modules/trends/dashboard-snapshot-retention.service.ts` | 롤업·삭제 sweep | 신규 |
| `modules/trends/trend-query.service.ts` | 두 출처 병합 조회 | 신규 |
| `modules/trends/trend-bucket.ts` | 버킷 경계 계산 순수 함수 | 신규 |
| `modules/trends/trends.controller.ts` | `GET /admin/trends` | 신규 |
| `modules/trends/trends.module.ts` | 조립 | 신규 |
| `app.module.ts` | `TrendsModule` 등록 | 수정 |
| `common/menu-permission.service.ts` | `MENU_KEYS` 에 `trends` | 수정 |
| `admin/src/features/trends/api/trendsApi.ts` | 조회 | 신규 |
| `admin/src/features/trends/components/TrendsPage.tsx` | 화면 | 신규 |
| `admin/src/features/trends/components/TrendChart.tsx` | SVG 차트 | 신규 |
| `admin/src/features/trends/trendSeries.ts` | 정규화·스케일 순수 함수 | 신규 |
| `admin/src/app/router.tsx` | 라우트 | 수정 |
| `admin/src/shared/permissions/menuConfig.tsx` | 메뉴 | 수정 |

각 순수 함수 파일에는 짝 `*.spec.ts` / `*.test.ts` 를 함께 만든다.

## 9. 단계

**1단계 — 적재부터.** 스냅샷 테이블 + 적재 서비스 + 보존 sweep.
화면이 없어도 **오늘부터 데이터가 쌓이기 시작한다.** 이게 먼저인 이유는,
적재를 늦게 시작하면 그만큼의 과거가 영원히 비기 때문이다.

**2단계 — 조회 API.** `GET /admin/trends`, 두 출처 병합.

**3단계 — 화면.** 4개 차트, 기간·해상도·큐 선택.

3단계까지 마쳐야 사용자가 쓸 수 있지만, 1단계만 배포해도 손해가 없고
이득(데이터 축적)은 즉시 시작된다.

## 10. 하지 않는 것

- 차트 라이브러리 도입 (기존 방식으로 충분)
- 알림·임계치 경보 (요청 범위 밖. `AlertsPanel` 이 이미 있다)
- CSV/엑셀 내보내기 (요청되면 그때)
- 상담원 개인별 추이 (`monitoring/agents` 화면이 이미 담당)
- CPU/메모리/디스크 (`prom-client` 영역. 필요하면 Prometheus 재검토)

## 11. 위험

| 위험 | 대응 |
|---|---|
| 주기 작업에 리더 가드를 빠뜨림 | 노드 수만큼 중복 적재. `@@unique` 가 최종 방어선. 리뷰 체크 항목 |
| AMI 조회가 1분마다 PBX 에 부하 | `PJSIPShowContacts` / `CoreShowChannels` 는 읽기 전용 조회다. 5초 타임아웃, 실패 시 `null` 적재 후 다음 주기로 |
| 큐가 많은 현장에서 행 증가 | 큐 10개면 분당 11행. 여전히 작다. 문제가 되면 큐 축 적재 주기만 5분으로 |
| 스냅샷 없는 과거 구간 | 리소스 필드 `null` → 화면에서 선을 끊는다. 0 으로 채우지 않는다 |
