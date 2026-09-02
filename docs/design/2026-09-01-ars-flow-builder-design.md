# 비주얼 ARS 플로우 빌더 설계

작성일: 2026-09-01
근거: [`docs/plans/2026-09-01-ai-layer-plan.md`](../plans/2026-09-01-ai-layer-plan.md) 4단계
성격: 설계. 구현 계획은 이 문서가 승인된 뒤 별도 `-plan.md` 로 쓴다.

---

## 0. 한 줄 요약

**없는 기능을 만드는 게 아니라, 네 갈래로 흩어진 호 처리 설정을 하나의 그래프로 합치고
그 그래프를 기존 dialplan 렌더러가 이미 낼 수 있는 문법으로 컴파일한다.**

이 저장소에서 가장 위험한 경로다 — 렌더 결과가 운영 PBX 의 `/etc/asterisk` 를 덮고 reload 된다.
설계의 절반은 "무엇을 만들까" 가 아니라 "무엇을 못 깨뜨리게 할까" 다.

---

## 1. 현재 상태 (착수 전 실측, 2026-09-01)

### 1.1 이미 있는 것

`renderers/dialplan.renderer.ts` 는 **1,418줄**이고, `renderDidExtension()` 이
DID 하나마다 **서로 배타적인 세 갈래** 중 하나를 고른다.

```
renderDidExtension(did)
  ├ did.branchOptOut080?.enabled           → renderDidOptOutRoute()
  │     └ IMMEDIATE_OPT_OUT | DTMF_MENU | SMART_OPT_OUT
  ├ did.smartArs (renderDidSmartArsRoute)  → renderSmartArsContext()
  │     └ digit → QUEUE_ROUTE | TRANSFER | SEND_SMS | OPT_OUT | PLAY_PROMPT
  └ 그 외                                   → renderDidStandardRoute()
        └ 차단목록 → 공휴일 착신전환 → 착신전환 규칙 → IVR 메뉴 → 큐
```

여기에 `AsteriskIvrMenu` / `AsteriskIvrEntry` 가 **단층** IVR 을 하나 더 얹는다.

```asterisk
[ivr-menu-<slug>]
exten => s,1,Answer()
 same => n,Playback(welcome)
 same => n,Background(menu)
 same => n,WaitExten(5)
exten => 1,1,Goto(queue-entry,<queueName>,1)   ; 분기 없음. 큐로만 간다
exten => t,1,Playback(vm-goodbye)
```

즉 **디지트 하나에 액션 하나**뿐이고, 2단계 메뉴도, 조건 분기도, 외부 조회도 없다.

### 1.2 이미 있는 안전장치 (설계가 반드시 얹혀야 할 곳)

| 장치 | 파일 | 하는 일 |
|---|---|---|
| 렌더 파일 목록·검증 | `asterisk-config-validation.ts` | `RENDERED_CONF_FILE_NAMES` 6개 파일과 각 파일의 필수 context 를 고정 |
| 렌더 가드 | `config-render-guard.ts` | "있어야 할 것이 없는" 렌더를 **쓰기 전에 차단** |
| 설정 소유권 | `config-ownership.ts` | `.kaster-cti-config-owner` marker 가 다르면 배포 중단 |
| 버전·적용 추적 | `configVersions` / `configApplyStatus` | payload + checksum, 노드별 desired/applied |
| reload | `asterisk-reload.service.ts` | `RELOAD_COMMANDS` 8개, 끝나면 `captureLkg()` |
| 주입 방어 | `renderer-utils.ts` | `assertNoNewlines()`, `toSlug()` |

`config-render-guard.ts` 의 주석은 이 저장소가 왜 이렇게 방어적인지 그대로 설명한다 —
2026-08-24 에 다른 노드가 자기 테넌트 기준으로 렌더링해 `pjsip.conf` 를 9,220 → 1,678 바이트로
덮었고, **파일이 비어 있지 않아서 기존 검사를 통과했다.** 전화기들은 등록할 계정을 잃었다.

플로우 빌더는 같은 종류의 사고를 낼 수 있다. "그래프를 저장했더니 DID 가 아무 데도 안 걸린 채
렌더링됐다" 는 파일이 비지 않은 채로 전화가 끊기는 상태다.

---

## 2. 설계 결정

### D1 — 런타임 해석이 아니라 **컴파일**

두 갈래가 있다.

| | 컴파일 (채택) | 런타임 해석 |
|---|---|---|
| 방식 | 그래프 → dialplan conf → reload | 매 단계 AGI 로 NestJS 에 물어봄 |
| NestJS 장애 시 | **전화는 계속 받는다** | ARS 가 통째로 멈춘다 |
| 디지트당 지연 | 없음 | 왕복 1회 |
| 변경 반영 | reload 필요 | 즉시 |
| 기존 파이프라인 | 그대로 재사용 | 새로 만들어야 함 |

**컴파일을 고른다.** 전화가 계속 걸려오는 시스템에서 미들웨어 장애가 통화 처리를 멈추면 안 된다.
이미 `AmiConnectionService` 도 리더가 아니어도 TCP 는 유지하는 식으로 같은 원칙을 따르고 있다.

단, **구조는 컴파일하고 부수효과는 훅으로** 넘긴다 — 지금 Smart ARS 가 하는 그대로다.
SMS 발송·수신거부 등록은 `System()` 훅이 `KASTER_INTERNAL_SECRET` 을 들고 NestJS 로 콜백한다.

### D2 — 새 모델을 만들되 기존 경로는 건드리지 않고 **공존**시킨다

`renderDidExtension()` 에 **네 번째 갈래**를 맨 앞에 추가한다.

```
renderDidExtension(did)
  ├ did.flowId 가 있으면                    → renderArsFlow()          ← 신규
  ├ did.branchOptOut080?.enabled           → renderDidOptOutRoute()   ← 그대로
  ├ did.smartArs                           → renderSmartArsContext()  ← 그대로
  └ 그 외                                   → renderDidStandardRoute() ← 그대로
```

기존 세 경로를 한 번에 갈아엎지 않는 이유는 하나다 — **운영 중인 사이트가 있다.**
사이트가 DID 단위로 옮겨 타고, 다 옮긴 뒤에 낡은 경로를 걷어낸다.

> 이 저장소의 "한쪽만 고치지 않는다" 규칙과 충돌하지 않는다. 여기 네 갈래는 *같은 결함의 복제*가
> 아니라 *선택지*다. 다만 **낡은 경로를 언제 걷어낼지**를 정하지 않으면 영구 부채가 되므로,
> 걷어내는 조건을 4.4 에 못 박는다.

### D3 — 노드 타입은 **렌더러가 이미 낼 수 있는 것**으로 시작한다

없는 dialplan 문법을 상상해서 노드를 만들지 않는다. 1단계 노드 8종:

| 노드 | 컴파일 결과 | 근거 |
|---|---|---|
| `PLAY` | `Playback()` / `Background()` | `renderPromptPlaybackLines()` |
| `MENU` | `Background()` + `WaitExten()` + 디지트별 `exten =>` | `renderIvrMenu()` |
| `QUEUE` | `Goto(queue-entry,<queue>,1)` | 전 경로 공통 |
| `TRANSFER` | `Goto(transfer-target,<번호>,1)` | `renderSmartArsAction()` |
| `SMS` | `System()` 훅 → NestJS | Smart ARS SEND_SMS |
| `OPT_OUT` | 기존 opt-out context 로 `Goto` | `renderOptOutContexts()` |
| `CONDITION` | `GotoIfTime()` / 공휴일 검사 | `renderHolidayForwardingLines()`, `renderForwardingRuleContext()` |
| `HANGUP` | `Playback()` + `Hangup()` | 전 경로 공통 |

**2단계로 미루는 것**: `COLLECT_DIGITS`(guarded digit AGI 가 이미 있으니 붙이기는 쉽다),
`HTTP_LOOKUP`(= "API 조회". 이것만 진짜 새 원시연산이고 새 AGI 훅이 필요하다).

> `COLLECT_DIGITS` 는 Phase 3 에서 들어갔다 (2026-09-02). 받은 숫자는 채널 변수
> `ARS_COLLECTED_DIGITS` 하나에 담기고, `SMS`/`OPT_OUT` 의 `targetSource: 'COLLECTED'` 가
> 그것을 대상 번호로 쓴다 — 080 수신거부의 "다른 번호로 등록" 과 같은 시나리오다.
> 훅이 이미 대상 번호를 인자로 받으므로 서버 쪽 변경은 없다.
> 입력을 받지 않고도 닿을 수 있는 소비 노드는 검증기가 `DIGITS_NOT_COLLECTED` 로 저장을 막는다.
> 구현은 `Read()` + 재시도 라벨이다. guarded digit AGI 는 *한 자리* 전용이라 여기서는 쓰지 않았다.

`HTTP_LOOKUP` 이 콜브릿지 대비 진짜 차별점이지만, **1단계에 넣지 않는다.**
외부 HTTP 를 통화 경로 한가운데에 놓는 것은 타임아웃·재시도·실패 시 폴백을 전부 설계해야 하고,
그건 이 문서 하나에 같이 담을 크기가 아니다.

### D4 — 컴파일러는 **순수 함수**, 기존 렌더러와 같은 규약

`renderers/ars-flow.renderer.ts` + 짝 `.renderer.spec.ts`.
입력은 그래프, 출력은 문자열. DB·파일·AMI 를 모르게 한다 (다른 렌더러 전부 그렇다).

출력은 **`extensionsInbound` 안에** 넣는다. 새 conf 파일을 만들지 않는다.
새 파일을 만들면 `RENDERED_CONF_FILE_NAMES` · 검증 · 배포 스크립트 · 소유권 marker 까지
전부 손대야 하는데, 얻는 게 없다.

모든 사용자 입력 문자열은 예외 없이 `assertNoNewlines()` 를 지나야 한다.
개행 하나가 곧 dialplan 주입이다.

### D5 — 그래프 검증을 **저장 시점과 렌더 시점 두 번** 한다

`config-render-guard.ts` 가 "있어야 할 것이 없는가" 를 보듯, 플로우도 같은 질문을 받는다.

저장 시점(사용자에게 즉시 오류):
1. 진입 노드가 정확히 하나인가
2. 모든 엣지의 목적지 노드가 존재하는가
3. 도달 불가능한 노드가 없는가 (있으면 경고 — 편집 중일 수 있다)
4. `MENU` 의 디지트가 중복되지 않는가
5. `QUEUE` 대상이 실제 `queues` 에 있는가 / `PLAY` 프롬프트가 `AsteriskPrompt` 에 있는가
6. 깊이 상한 (기본 10) 을 넘지 않는가
7. **탈출구 없는 순환이 없는가** — 디지트 입력이나 타임아웃 없이 도는 사이클은 통화가 갇힌다

렌더 시점(쓰기를 차단):
8. 컴파일 결과에 이 DID 의 `exten =>` 진입점이 실제로 있는가
9. 컴파일 결과가 이전 버전 대비 비정상적으로 줄지 않았는가 (2026-08-24 사고 유형)

7번과 9번이 이 설계에서 가장 중요한 두 줄이다. 나머지는 편의고, 이 둘은 통화를 지킨다.

### D6 — 직접 적용 없음. **미리보기 diff → 버전 저장 → 적용 → LKG**

새로 만들 것이 없다. 전부 있다.

- `configVersions` 에 `configType: 'ars-flow'` 로 payload + checksum 저장
- `asterisk-config-validation.ts` 의 기존 diff 로 "이번에 무엇이 바뀌는가" 를 화면에 보여준 뒤 적용
- 적용 후 `asterisk-reload.service.ts` 가 `dialplan reload` → `captureLkg()`
- 문제가 생기면 LKG 스냅샷으로 되돌린다

**적용 버튼은 diff 를 본 뒤에만 활성화한다.** 보지 않고 누를 수 있으면 안 본다.

### D7 — 편집 UI 는 **노드-링크 캔버스** (사용자 결정, 2026-09-01)

드래그로 노드를 잇는 진짜 플로우 빌더로 간다. `reactflow` 를 새 의존성으로 들인다.
관리자 번들이 이미 4.6MB(gz 1.4MB)이고 Vite 가 500KB 초과 경고를 내고 있으므로,
**이 화면만 `React.lazy` 로 분할 로드**한다 — 플로우 빌더를 안 여는 관리자는 내려받지 않는다.

착수 시 확인할 것: 관리자 앱은 Vite 5 + React 18 이다. `reactflow`(v11) 와
`@xyflow/react`(v12) 중 어느 쪽이 이 조합에 맞는지 install 전에 확인하고, 스타일시트가
필요하므로 CSP 가 아니라 번들에 포함되는지도 본다.

---

## 3. 데이터 모델 (초안)

```prisma
model arsFlows {
  flowId      String  @id @default(uuid()) @db.Uuid
  tenantId    String  @db.Uuid
  branchId    String? @db.Uuid
  name        String  @db.VarChar(128)
  description String?
  status      String  @default("DRAFT") @db.VarChar(16)  // DRAFT | PUBLISHED | ARCHIVED
  entryNodeId String? @db.Uuid
  version     Int     @default(1)
  @@unique([tenantId, name])
}

model arsFlowNodes {
  nodeId   String @id @default(uuid()) @db.Uuid
  tenantId String @db.Uuid
  flowId   String @db.Uuid
  nodeType String @db.VarChar(24)   // PLAY | MENU | QUEUE | TRANSFER | SMS | OPT_OUT | CONDITION | HANGUP
  label    String @db.VarChar(128)
  config   Json                     // 노드 타입별 설정. 타입별 파서가 경계에서 검증한다
  posX     Int    @default(0)       // 편집기 좌표. 컴파일에는 쓰지 않는다
  posY     Int    @default(0)
  @@index([tenantId, flowId])
}

model arsFlowEdges {
  edgeId       String  @id @default(uuid()) @db.Uuid
  tenantId     String  @db.Uuid
  flowId       String  @db.Uuid
  fromNodeId   String  @db.Uuid
  toNodeId     String  @db.Uuid
  condition    String  @db.VarChar(24)  // DIGIT | TIMEOUT | INVALID | TRUE | FALSE | DEFAULT
  digit        String? @db.VarChar(2)
  sortOrder    Int     @default(0)
  @@unique([flowId, fromNodeId, condition, digit])
  @@index([tenantId, flowId])
}
```

`AsteriskDid` 에 `flowId String? @db.Uuid` 를 추가한다. 이것이 D2 의 네 번째 갈래 스위치다.

`config` 를 `Json` 으로 두는 대신 노드 타입마다 컬럼을 나누는 안도 있었지만,
8종이 서로 겹치는 필드가 거의 없어 컬럼이 40개 가까이 나온다. **경계에서 파싱**하는 쪽을 택한다
(`analysis-response.util.ts` 와 같은 방식 — 저장소에 zod 가 없으므로 순수 파서).

---

## 4. 단계

### Phase 0 — 컴파일러와 검증만 (PBX 를 건드리지 않음)

스키마 + `ars-flow.renderer.ts` + 그래프 검증기. **전부 순수 함수라 실 PBX 없이 검증된다.**
기존 IVR 메뉴를 그래프로 옮겨 컴파일했을 때 **지금 렌더 결과와 같은 문자열이 나오는지**를
스펙으로 고정한다. 이게 이 단계의 합격 기준이다 — 같은 입력이면 같은 conf 여야 안심하고 넘어간다.

### Phase 1 — DID 연결 + 미리보기 + 적용

`renderDidExtension` 4번째 갈래, `configVersions` 연동, diff 미리보기, 적용, LKG.
**한 개 DID 로 파일럿**한 뒤 확대한다. 이 단계는 실 PBX 검증 없이 완료로 적지 않는다.

### Phase 2 — 편집 UI

노드-링크 캔버스(D7). `features/ars-flow-builder/`, 지연 로드.
캔버스는 그래프 JSON 의 표현일 뿐이고 **진실원은 그래프**다 — 좌표가 깨져도 컴파일 결과는 같아야 한다.

### Phase 3 — 흡수와 정리

`HTTP_LOOKUP` / `COLLECT_DIGITS` 추가. 기존 IVR 메뉴·Smart ARS·opt-out 설정을 그래프로
**가져오기(import)** 하는 변환기. 그 다음에야 낡은 경로를 걷어낸다.

### 4.4 낡은 경로를 걷어내는 조건

부채를 영구화하지 않기 위해 조건을 미리 못 박는다. 아래 셋이 모두 참일 때만 삭제한다.

1. 운영 중인 모든 사이트의 모든 DID 가 `flowId` 를 갖는다
2. 가져오기 변환기가 기존 설정 → 그래프 → conf 를 돌렸을 때 **기존 conf 와 바이트 단위로 같다**
   > **이 표현은 달성 불가능하다** (2026-09-02 실측). 두 렌더러는 컨텍스트 이름부터 다르고
   > (`[ivr-menu-x]` vs `[ars-flow-x]`) 플로우는 메뉴마다 별도 컨텍스트를 만든다.
   > 실제로 확인해야 하는 것은 **관찰 동등** — 같은 안내 파일, 같은 대기 시간,
   > 같은 디지트→목적지 매핑, 같은 종료 동작이다. IVR 메뉴는 이 판정을 spec 으로 고정했다
   > (`ivr-menu.importer.spec.ts`). 근거: `docs/work-log/2026-09-02-ars-flow-phase3-worklog.md` §4
3. 실 PBX 에서 각 경로(수신거부·Smart ARS·표준)를 한 번씩 통화로 확인했다

---

## 5. 결정이 필요한 것

두 가지 모두 2026-09-01 에 결정됐다.

### 5.1 편집기 형태 → **노드-링크 캔버스** (D7)

트리 편집기(새 의존성 0)와 저울질했으나 캔버스로 결정됐다.
번들 부담은 이 화면만 지연 로드해서 상쇄한다. `posX`/`posY` 는 원래 캔버스를 수용하려고 둔 필드라
데이터 모델은 그대로 쓴다.

### 5.2 `HTTP_LOOKUP` → **Phase 3**

통화 경로 한가운데의 외부 HTTP 는 타임아웃·재시도·실패 폴백·시크릿 보관을 전부 설계해야 하고,
ARS 가 멈추는 사고가 가장 나기 쉬운 지점이다. 기본기(컴파일러·검증·적용·롤백)를 실 PBX 에서
안정시킨 뒤에 올린다. 콜브릿지 대비 차별점의 핵심이라는 점은 변하지 않으므로 Phase 3 를 비워두지 않는다.

> 설계서를 썼다 (2026-09-02): [`2026-09-02-ars-http-lookup-design.md`](2026-09-02-ars-http-lookup-design.md).

---

## 6. 위험과 대응

| 위험 | 대응 |
|---|---|
| 잘못된 그래프가 DID 를 어디에도 안 걸리게 렌더 | D5-8: 렌더 결과에 진입 `exten =>` 가 없으면 쓰기 차단 |
| 탈출구 없는 순환 → 통화가 갇힘 | D5-7: 저장 자체를 거부 |
| dialplan 주입 (프롬프트명·라벨에 개행) | 모든 문자열이 `assertNoNewlines()` 통과 |
| 다른 사이트 PBX 덮어쓰기 | 기존 `.kaster-cti-config-owner` marker 그대로 적용 |
| reload 후 문제 발견 | LKG 스냅샷 복구 + 파일럿 DID 1개로 먼저 |
| 렌더 결과가 조용히 줄어듦 | D5-9: 이전 버전 대비 축소 감지 (2026-08-24 유형) |
| 기존 3경로 회귀 | D2: 코드를 건드리지 않고 갈래만 추가. 기존 `*.renderer.spec.ts` 가 회귀 감시 |

---

## 7. 이 설계가 만들지 않는 것

- 런타임 플로우 인터프리터 (D1)
- 새 conf 파일 (D4)
- 새 메뉴 권한 키 — `asterisk` 키를 그대로 쓴다
- 트리 형태의 대체 편집기 (5.1 에서 탈락)
- 기존 IVR/Smart ARS/opt-out 설정 화면의 대체 (Phase 3 이후)
- 통화 중 외부 API 조회 (Phase 2~3)
