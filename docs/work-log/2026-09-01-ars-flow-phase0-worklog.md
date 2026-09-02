# ARS 플로우 빌더 Phase 0 작업 로그

작성일: 2026-09-01
계획서: [`docs/plans/2026-09-01-ars-flow-builder-plan.md`](../plans/2026-09-01-ars-flow-builder-plan.md) Phase 0
설계서: [`docs/design/2026-09-01-ars-flow-builder-design.md`](../design/2026-09-01-ars-flow-builder-design.md)

범위: 계획서 0.9 의 작업 순서 1~6 전부. **PBX 를 한 줄도 건드리지 않았다** —
`renderDidExtension` 결선(Phase 1.1)은 하지 않았으므로 컴파일러는 아직 아무 통화도 타지 않는다.

---

## 합격 기준 충족 (계획서 0.1)

> 기존 `AsteriskIvrMenu` 를 그래프로 옮겨 컴파일했을 때, 지금 `renderIvrMenu()` 가 내는 것과 같은 결과.

**계획서에는 "같은 문자열"로 적었지만 "같은 관찰값"으로 판정했다.** 바이트 단위로 맞추려면
컴파일러가 레거시 산출물의 부수적 형식(컨텍스트 이름 `ivr-menu-*`, NoOp·채널변수 없음)까지
흉내 내야 하고, 그건 설계를 산출물에 맞춰 비트는 것이다.

대신 렌더 결과에서 **통화가 실제로 겪는 사실**만 뽑아 비교했다 —
재생 순서, 대기 시간, 디지트별 라우팅, 타임아웃 처리. 결과는 완전히 일치했고,
검증이 빈 값끼리 비교해 통과한 것이 아님을 실제 출력으로 확인했다.

```
LEGACY  playbacks=[welcome, menu, vm-goodbye]  waitExten=5
        digits={1: Goto(queue-entry,sales,1), 2: Goto(queue-entry,support,1)}
        timeout=[Playback(vm-goodbye), Hangup()]
FLOW    (위와 동일)
```

실제 컴파일 결과도 레거시와 거의 같은 모양이다.

```asterisk
[ars-flow-flow-1]
exten => s,1,NoOp(ARS flow 대표번호 안내)
 same => n,Answer()
 same => n,Set(__SMART_ARS_TENANT_ID=tenant-1)
 same => n,Set(__SMART_ARS_BRANCH_ID=branch-1)
 same => n,Set(__ENTRY_DID=16001234)
 same => n,Goto(ars-flow-flow-1,s,node-0-welcome)
 same => n(node-0-welcome),NoOp(ARS node welcome)
 same => n,Playback(welcome)
 same => n,Goto(ars-flow-flow-1-node-1-menu,s,1)

[ars-flow-flow-1-node-1-menu]
exten => s,1,NoOp(ARS menu menu)
 same => n,Background(menu)
 same => n,WaitExten(5)
exten => 1,1,Goto(queue-entry,sales,1)
exten => 2,1,Goto(queue-entry,support,1)
exten => t,1,Playback(vm-goodbye)
 same => n,Hangup()
```

## 만든 것

| # | 항목 | 파일 |
|---|---|---|
| 1 | 스키마 | `prisma/migrations/20260901_ars_flow/` — `arsFlows`/`arsFlowNodes`/`arsFlowEdges` + `AsteriskDid.flowId` |
| 2 | 그래프 표현 | `ars-flow/flow-graph.types.ts` (좌표 없음), `node-config.parser.ts` |
| 3 | 검증기 | `ars-flow/flow-graph.validator.ts` — 설계서 D5 1~7 |
| 4 | 컴파일러 | `asterisk-config/renderers/ars-flow.renderer.ts` (순수 함수) |
| 5 | 서비스 | `ars-flow/ars-flow.service.ts` — 그래프 통째 교체, 저장 시 검증 |
| 6 | REST | `ars-flow.controller.ts` + DTO 3개, `docs/openapi.json` +507줄 |

## 착수 중 알게 된 것

### 1. `toSlug` 는 한글을 전부 걷어낸다 — 한글 플로우명이면 슬러그가 빈다

`toSlug` 는 `[^a-z0-9]` 를 전부 `-` 로 바꾸고 앞뒤를 잘라내므로 `"대표번호 안내"` → `""` 다.
컴파일러는 **`flowId` 로 폴백**한다. 이름이 바뀌어도 컨텍스트가 흔들리지 않는 이점도 함께 얻는다.

> **기존 코드에 남아 있는 같은 문제**: `renderIvrMenu()` 는 한글 메뉴 이름에 대해
> `IVR menu name "..." produces an empty slug` 로 **던진다.** 즉 지금 시스템은 IVR 메뉴 이름에
> 사실상 ASCII 를 요구한다. 이번 범위 밖이라 고치지 않았고, 여기 남긴다.

### 2. `renderIvrMenu` 결과는 `extensionsInbound` 가 아니라 `extensionsQueue` 로 들어간다

동등성 테스트를 처음에 `extensionsInbound` 에서 찾다가 빈 값을 비교할 뻔했다.
`extensions_inbound.conf` 에는 `Goto(ivr-menu-<slug>,s,1)` 만 있고 컨텍스트 정의는
`extensions_queue.conf` 에 있다.

### 3. 훅 경로가 복제될 뻔해서 공용 파일로 뺐다

`OPT_OUT_HOOK_PATH` / `SMART_ARS_HOOK_PATH` / `shellQuote` 가 `dialplan.renderer.ts` 안에
private 로 있었다. 플로우 컴파일러가 **같은 훅**을 부르므로
`renderers/hook-paths.ts` 로 빼고 `shellQuote` 는 `renderer-utils.ts` 로 옮겼다.
복제했다면 한쪽만 고쳐졌을 때 조용히 어긋난다. 추출 후 기존 렌더러 스펙 121건 그대로 통과.

## 설계 판단 (계획서에 없던 것)

- **터미널 노드(QUEUE/TRANSFER/HANGUP)는 점프 지점에 인라인한다.** 라벨 블록을 따로 만들지 않는다.
  라벨을 하나 더 거치면 읽는 사람도 통화도 이유 없이 한 칸 더 돈다. 레거시 모양과 같아지는 부수 효과도 있다.
- **도달하지 못하는 노드는 렌더하지 않는다.** 검증에서는 경고(저장은 허용)지만,
  죽은 dialplan 을 PBX 에 올릴 이유는 없다.
- **탈출구 판정**: 순환 경로 위에 `MENU` 가 하나라도 있으면 사람이 다른 디지트로 빠져나갈 수 있다.
  그래서 `MENU` 를 뺀 부분그래프에 남은 순환이 곧 갇히는 순환이다.

## 검증 결과 (2026-09-01 실행)

| 항목 | 명령 | 결과 |
|---|---|---|
| 스키마 유효성 | `npx prisma validate` | valid |
| 클라이언트 생성 | `npx prisma generate` + 모델 3개 확인 | OK |
| 서버 전체 | `npm test` | **1124 passed / 127 suites, 실패 0** |
| 린트 | `npm run lint` | 0 error |
| 빌드 | `npm run build` | exit 0 |
| OpenAPI | `npm run openapi:export` | +507줄 (엔드포인트 7개) |

**Red-Green (계획서 0.8)** — 검증 7번 `TRAPPED_CYCLE`:
검사를 뺀 채로 구현 → `메뉴 없는 순환은 오류` / `자기 자신으로 도는 엣지도 오류` 2건 실패(18건 통과)
→ 검사 추가 → 45건 전부 통과.

## 남은 것

1. **마이그레이션 미적용.** 통화 AI 분석 마이그레이션과 같은 이유다 — 로컬 Docker 가 꺼져 있고
   `DATABASE_URL` 이 원격 개발서버를 가리킨다. 두 마이그레이션을 함께 적용할지 판단이 필요하다.
2. **Phase 1 (DID 연결·렌더 가드·적용).** 여기부터 운영 PBX 를 건드린다.
3. **기존 `renderIvrMenu` 의 한글 이름 제약** (위 1번) — 별건이므로 결정 필요.
