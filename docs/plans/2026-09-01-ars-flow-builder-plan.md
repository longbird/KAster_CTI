# ARS 플로우 빌더 구현 계획

작성일: 2026-09-01
설계서: [`docs/design/2026-09-01-ars-flow-builder-design.md`](../design/2026-09-01-ars-flow-builder-design.md)
결정 반영: 편집기 = 노드-링크 캔버스(D7), `HTTP_LOOKUP` = Phase 3 (사용자 결정, 2026-09-01)

---

## 0. 이 문서의 범위

| Phase | 내용 | 이 문서의 상세도 |
|---|---|---|
| 0 | 그래프 모델 + 검증기 + 컴파일러 (PBX 미접촉) | **실행 가능한 수준까지** |
| 1 | DID 연결 + 미리보기 diff + 적용 | **실행 가능한 수준까지** |
| 2 | 캔버스 편집 UI | 범위 정의 |
| 3 | `HTTP_LOOKUP` / `COLLECT_DIGITS` + 기존 설정 가져오기 | 범위 정의 |

Phase 0 은 순수 함수뿐이라 **실 PBX 도, DB 도 없이 전부 검증된다.**
Phase 1 부터 운영 PBX 를 건드리므로, Phase 0 완료 없이 Phase 1 을 시작하지 않는다.

---

## Phase 0 — 컴파일러와 검증기

### 0.1 합격 기준 (이 단계의 정의)

**기존 `AsteriskIvrMenu` 를 그래프로 옮겨 컴파일했을 때, 지금 `renderIvrMenu()` 가 내는 문자열과
같은 결과가 나온다.** 같은 입력이면 같은 conf 여야 Phase 1 로 넘어갈 근거가 생긴다.

이걸 스펙으로 고정한다 — `ars-flow.renderer.spec.ts` 에
"기존 단층 IVR 과 동등한 그래프는 기존 렌더 결과와 같다" 케이스를 둔다.

### 0.2 스키마 (신규 마이그레이션 1개)

설계서 §3 의 3개 모델 + `AsteriskDid.flowId`.

기존 마이그레이션은 편집하지 않는다. FK 는 저장소의 지배적 패턴대로 명시적으로 건다
(`20260825_dashboard_snapshots` 스타일). 관계:

- `arsFlows` → `tenants`(Cascade), `branches`(SetNull)
- `arsFlowNodes` → `tenants`(Cascade), `arsFlows`(Cascade)
- `arsFlowEdges` → `tenants`(Cascade), `arsFlows`(Cascade), from/to `arsFlowNodes`(Cascade)
- `AsteriskDid.flowId` → `arsFlows`(SetNull) — **플로우를 지워도 DID 가 사라지면 안 된다.**
  SetNull 이면 그 DID 는 자동으로 기존 표준 경로로 되돌아간다 (D2 의 갈래 순서 덕분)

`entryNodeId` 는 `arsFlowNodes` 를 가리키지만 **FK 를 걸지 않는다** — 순환 FK 가 되어
생성 순서가 꼬인다. 대신 검증기가 존재를 확인한다.

### 0.3 파일 구성

```
src/modules/ars-flow/
  ars-flow.module.ts
  ars-flow.controller.ts                      ← Phase 0 은 CRUD + 검증까지만
  ars-flow.service.ts              + .spec.ts ← 그래프 CRUD, 저장 시 검증 호출
  flow-graph.types.ts                         ← 그래프 표현 (DB 모델과 분리)
  flow-graph.validator.ts          + .spec.ts ← 설계서 D5 의 1~7번
  node-config.parser.ts            + .spec.ts ← 노드 타입별 config Json 경계 검증
  dto/
src/modules/asterisk-config/renderers/
  ars-flow.renderer.ts             + .renderer.spec.ts   ← 순수 컴파일러
```

컴파일러를 `renderers/` 에 두는 이유는 이미 그 디렉터리의 규약(순수 함수 + 짝 spec)이
확립돼 있고, `renderDialplan()` 이 같은 자리에서 호출해야 하기 때문이다.

### 0.4 그래프 표현

DB 모델을 그대로 컴파일러에 넘기지 않는다. 중간 표현을 둔다.

```ts
export interface FlowGraph {
  flowId: string;
  name: string;
  entryNodeId: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}
export type FlowNodeType =
  | 'PLAY' | 'MENU' | 'QUEUE' | 'TRANSFER' | 'SMS' | 'OPT_OUT' | 'CONDITION' | 'HANGUP';
export interface FlowNode { nodeId: string; nodeType: FlowNodeType; label: string; config: NodeConfig }
export interface FlowEdge {
  edgeId: string; fromNodeId: string; toNodeId: string;
  condition: 'DIGIT' | 'TIMEOUT' | 'INVALID' | 'TRUE' | 'FALSE' | 'DEFAULT';
  digit?: string;
}
```

`posX`/`posY` 는 **의도적으로 빠져 있다.** 좌표가 컴파일에 영향을 주면 안 된다
(설계서 Phase 2: "좌표가 깨져도 컴파일 결과는 같아야 한다"). 컴파일러가 좌표를 아예 못 보게 한다.

`NodeConfig` 는 타입별 유니온이고, `node-config.parser.ts` 가 `Json` → 타입 파싱을 담당한다.
저장소에 zod 가 없으므로 `analysis-response.util.ts` 와 같은 순수 파서 방식을 쓴다.

### 0.5 검증기 (설계서 D5 1~7)

`validateFlowGraph(graph, context)` → `{ errors: FlowIssue[]; warnings: FlowIssue[] }`

| # | 검사 | 등급 |
|---|---|---|
| 1 | `entryNodeId` 가 실제 노드를 가리킨다 | error |
| 2 | 모든 엣지의 from/to 가 존재한다 | error |
| 3 | 진입에서 도달 불가능한 노드가 없다 | **warning** (편집 중일 수 있다) |
| 4 | 한 `MENU` 안에서 디지트가 중복되지 않는다 | error |
| 5 | `QUEUE`/`TRANSFER`/`PLAY` 의 대상이 실재한다 | error |
| 6 | 진입에서의 최대 깊이가 상한(10) 이하 | error |
| 7 | **탈출구 없는 순환이 없다** | error |

7번 정의: 사이클을 이루는 경로 위에 **디지트 입력을 기다리는 `MENU` 노드가 하나도 없으면**
그 사이클은 통화를 가둔다. `PLAY → PLAY → PLAY → 처음` 은 무한 재생이고 고객은 끊을 수밖에 없다.
`MENU` 가 하나라도 끼어 있으면 사람이 다른 디지트를 눌러 빠져나갈 수 있으므로 허용한다.

5번은 순수 함수 밖의 사실(큐·프롬프트 목록)이 필요하므로 `context` 로 주입받는다.
컴파일러가 DB 를 모르는 규약을 깨지 않기 위해서다.

### 0.6 컴파일러

```ts
export interface ArsFlowRenderInput { graph: FlowGraph; did: string; tenantId: string; branchId: string | null }
export function renderArsFlow(input: ArsFlowRenderInput): string
```

출력은 `[ars-flow-<slug>]` 계열 context 문자열 하나. `renderDialplan()` 이 이것을
`extensionsInbound` 에 이어 붙인다 (D4 — 새 conf 파일 없음).

규칙:
- 노드 하나 = priority 라벨 하나. `Goto(ars-flow-<slug>,s,<label>)` 로 잇는다
- 모든 사용자 문자열은 `assertNoNewlines()` 통과. 라벨은 `toSlug()`
- `SMS`/`OPT_OUT` 은 기존 Smart ARS·opt-out 훅 경로를 그대로 재사용한다 — 새 훅을 만들지 않는다
- 각 노드 진입에 `UserEvent` 를 하나 심는다. Smart ARS 가 이미 하는 방식이라 관측 경로가 같아진다

### 0.7 Phase 0 REST

| 메서드 | 경로 | 권한 |
|---|---|---|
| GET | `/admin/ars-flows` | `asterisk` 메뉴 view |
| GET | `/admin/ars-flows/:flowId` | view |
| POST | `/admin/ars-flows` | create |
| PATCH | `/admin/ars-flows/:flowId` | update — 그래프 전체를 한 번에 교체 |
| DELETE | `/admin/ars-flows/:flowId` | delete |
| POST | `/admin/ars-flows/:flowId/validate` | view — 저장 없이 검증만 |
| POST | `/admin/ars-flows/:flowId/preview` | view — **컴파일 결과 문자열만** 반환. 파일을 쓰지 않는다 |

**새 메뉴 권한 키를 만들지 않는다.** 기존 `asterisk` 키를 쓴다 (설계서 §7).

쓰기 엔드포인트가 있으므로 `test/write-availability-coverage.spec.ts` 의 `FULLY_GATED` 에
`ars-flow.controller.ts` 를 등록하고 클래스 레벨 `@RequiresWriteAvailability('general')` 을 건다.
PBX 설정 쓰기는 장애 모드에서 막는 것이 이 저장소의 기존 정책이다.

노드 순서를 통째로 교체하는 PATCH 로 둔 이유: 노드/엣지를 개별 CRUD 로 만들면
"저장 중간 상태" 가 검증을 통과하지 못해 매번 실패한다. 그래프는 한 덩어리로 다룬다.

### 0.8 Phase 0 검증 방법

| 주장 | 근거 명령 |
|---|---|
| 스키마 반영 | `npx prisma validate` + `npx prisma generate` |
| 컴파일러·검증기 | `npx jest src/modules/ars-flow src/modules/asterisk-config/renderers/ars-flow` — 실패 0 |
| **기존 IVR 동등성** | 위 spec 안의 동등성 케이스 통과 |
| 전체 회귀 | `cd apps/server && npm test` — 실패 0 |
| 린트·빌드 | `npm run lint` / `npm run build` |
| OpenAPI | `npm run openapi:export` |

**Red-Green 대상**: 검증기 7번(탈출구 없는 순환). 먼저 갇히는 그래프로 실패하는 테스트를 만들고,
검사를 넣어 통과시킨다. 검사를 빼면 다시 실패해야 한다.

### 0.9 작업 순서 (TDD)

1. 스키마 + 마이그레이션 → `prisma validate` / `generate`
2. `flow-graph.types.ts` + `node-config.parser.ts` + spec (순수)
3. `flow-graph.validator.ts` + spec (순수) — 7번을 Red-Green 으로
4. `ars-flow.renderer.ts` + spec (순수) — **기존 IVR 동등성 케이스 포함**
5. `ars-flow.service.ts` + spec (그래프 CRUD, 저장 시 검증)
6. 컨트롤러 + DTO + write-availability 등록 + `openapi:export`

1~4 가 이 단계의 본체다. 5~6 은 그 위의 껍데기다.

---

## Phase 1 — DID 연결과 적용

### 1.1 렌더러 결선

`renderDidExtension()` 맨 앞에 갈래 하나를 추가한다. **기존 세 갈래의 코드는 건드리지 않는다.**

```ts
if (did.flow) return renderArsFlow({ graph: did.flow, did: did.did, ... });
```

`DialplanInput` 에 플로우 그래프를 실어 보내려면 `asterisk-config.service.ts` 의
조회 부분에 플로우 로딩이 붙는다. 이 파일은 기존 6개 렌더러가 모두 지나는 곳이므로
**추가만 하고 기존 조회는 손대지 않는다.**

### 1.2 렌더 가드 (설계서 D5 8·9)

`config-render-guard.ts` 에 검사를 **추가**한다 (기존 검사 유지).

- 8: `flowId` 가 걸린 DID 가 N개인데 렌더 결과의 `[ars-flow-*]` context 가 N개보다 적으면 차단
- 9: 이번 `extensionsInbound` 가 직전 적용본 대비 일정 비율 이상 줄었으면 차단

9번의 임계값은 env 로 빼지 않는다 — 튜닝 대상이 아니라 안전선이다. 상수로 두고 spec 으로 고정한다.

### 1.3 버전·미리보기·적용

- 저장 시 `configVersions` 에 `configType: 'ars-flow'` 로 그래프 payload + checksum
- 관리자가 **diff 를 본 뒤에만** 적용 버튼이 열린다 (설계서 D6)
- 적용은 기존 `asterisk-config.service` 의 쓰기 → `asterisk-reload.service` 경로를 그대로 탄다
- reload 후 기존 `captureLkg()` 가 스냅샷을 남긴다 — 새로 만들 것이 없다

### 1.4 파일럿

**DID 한 개**로 먼저 붙인다. 실 PBX 에서 통화로 확인하기 전에는 완료로 적지 않는다.
확인 항목: 진입 → 메뉴 안내 → 디지트 → 큐 연결, 타임아웃, 잘못된 디지트, 그리고
**플로우를 지웠을 때 그 DID 가 표준 경로로 정상 복귀하는지**(0.2 의 SetNull).

### 1.5 Phase 1 검증 방법

Phase 0 의 항목 전부 + 아래.

| 주장 | 근거 |
|---|---|
| 기존 3경로 무회귀 | `dialplan.renderer.spec.ts` 기존 케이스 전부 통과 |
| 렌더 가드 동작 | Red-Green — 플로우가 빠진 렌더로 차단되는지 |
| 실 PBX 반영 | 파일럿 DID 통화 기록 (로컬 테스트만으로 완료 처리하지 않는다) |

---

## Phase 2 — 캔버스 편집기 (범위)

- `apps/admin/src/features/ars-flow-builder/`, `React.lazy` 지연 로드
- `reactflow` 계열 도입 — **install 전에** Vite 5 + React 18 조합에서 v11(`reactflow`)과
  v12(`@xyflow/react`) 중 어느 쪽이 맞는지 확인한다. 스타일시트 포함 방식도 함께 본다
- 캔버스는 그래프 JSON 의 표현일 뿐이고 진실원은 그래프다
- 저장 전 클라이언트에서도 검증 결과를 보여준다 (서버 검증이 최종 판정)
- 미리보기 패널에 컴파일된 conf 를 그대로 띄운다 — 무엇이 나가는지 숨기지 않는다

## Phase 3 — 확장과 흡수 (범위)

- `COLLECT_DIGITS` (guarded digit AGI 재사용)
- `HTTP_LOOKUP` — 타임아웃·재시도·실패 폴백·시크릿 보관을 **별도 설계서**로 먼저 쓴다
- 기존 IVR 메뉴 / Smart ARS / opt-out 설정 → 그래프 **가져오기 변환기**
- 설계서 §4.4 의 세 조건이 모두 참이 된 뒤에야 낡은 경로를 걷어낸다

---

## 위험과 미리 정한 대응

| 위험 | 대응 | 어디서 |
|---|---|---|
| 그래프가 통화를 가둠 | 저장 자체를 거부 | 0.5 검증 7 |
| DID 가 아무 데도 안 걸림 | 렌더 결과 개수 대조로 쓰기 차단 | 1.2 가드 8 |
| 렌더 결과 조용한 축소 | 직전 적용본 대비 비율 검사 | 1.2 가드 9 |
| dialplan 주입 | 전 문자열 `assertNoNewlines()` | 0.6 |
| 기존 3경로 회귀 | 코드 미변경 + 기존 spec 이 감시 | 1.1 |
| 플로우 삭제로 DID 유실 | FK `SetNull` → 표준 경로 복귀 | 0.2 |
| 번들 비대화 | 편집기만 지연 로드 | Phase 2 |

---

## 승인 요청

**Phase 0 (0.1~0.9) 착수 승인이 필요하다.** Phase 0 은 PBX 를 건드리지 않고 전부 순수 함수라
되돌리기 비용이 낮지만, 아래 둘은 뒤에서 바꾸기 비싸다.

- **0.4** — 컴파일러가 좌표(`posX`/`posY`)를 아예 못 보게 격리
- **0.7** — 노드 개별 CRUD 가 아니라 그래프 통째 교체(PATCH)
