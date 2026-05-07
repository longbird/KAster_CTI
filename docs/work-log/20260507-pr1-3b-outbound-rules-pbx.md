# PR1-3B — 아웃바운드 룰 PBX 렌더 반영

> plan: `~/.claude/plans/8-temporal-gray.md` PR 1-3, 체크포인트 B.

## 변경 요약

PR1-3A 에서 만든 `outboundCallerIdRules` 를 실제 Asterisk dialplan 에 주입한다.

## 렌더러 변경

`apps/server/src/modules/asterisk-config/renderers/agent-dialplan.renderer.ts`

### Input 시그니처 확장
- `AgentDialplanInput.outboundCallerIdRules?: OutboundCallerIdRuleInput[]` 신설.
- 빈 배열/undefined 면 dialplan 동작 변화 없음 — 단일 `defaultOutboundCallerId` 인라인 Set 유지 (회귀 가드).

### 새 컨텍스트 `[outbound-cid-rules]`
- `enabled === true && matchType !== 'REGEX'` 인 룰을 priority asc 정렬 후 native exten 으로 등록.
- 룰별 매칭 타입을 dialplan exten 패턴으로 변환:
  - `DIALPLAN_PATTERN`: pattern 그대로 (예: `_NXX`).
  - `EXACT`: pattern 그대로 (예: `01012345678`).
  - `PREFIX` (예: `010`) → `_010.` (Asterisk 패턴).
  - `REGEX`: dialplan 으로 표현 불가 → 컨텍스트에 NoOp 코멘트만 기록.
- 동일 exten 패턴 충돌 시 priority 작은 룰 1개만 채택 (이미 sort 결과로 자동).
- 룰 매칭 후 `Set(CALLERID(num)=…)` + `Set(CALLERID(name)=…)` + `Return()`.
- fallback `_X.`: 모든 미매칭 → `defaultOutboundCallerId` 적용.

### `[outbound-main-{ext}]` 변경
- 룰이 있으면(`hasUsableRules`) 인라인 `Set(CALLERID(num)=…)` 두 줄을 `Gosub(outbound-cid-rules,${EXTEN},1)` 한 줄로 교체.
- 룰이 없거나 모두 REGEX/disabled 면 기존 인라인 Set 유지 — **회귀 zero**.

### 렌더링 순서
sections 배열 끝에 `cidRulesContext` 를 append. 기존 8개 컨텍스트는 그대로.

## 서비스 통합

`apps/server/src/modules/asterisk-config/asterisk-reload.service.ts`

- `fetchOutboundCallerIdRules(tenantId)` 신규 private — `enabled=true` 룰만 priority asc, createdAt asc 로 fetch.
- `applyTenantConfig` / `previewConfFiles` 두 경로 모두에서 룰을 fetch 해서 `renderAgentDialplan` 입력에 주입.

## 검증 결과

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` (server) | ✅ exit=0 |
| `jest agent-dialplan` | ✅ 6/6 PASS (기존 3 + 신규 3) |
| 회귀 가드 테스트 | ✅ "룰이 없거나 모두 disabled 면 단일 callerId 인라인 Set 유지" 통과 |

### 신규 테스트 케이스
1. 룰 없음 → 기존 인라인 Set 유지, `[outbound-cid-rules]` 미생성, `Gosub` 미사용 (회귀 가드)
2. 다양한 matchType + priority 조합 → priority 작은 룰이 위에, REGEX 는 NoOp 코멘트로만, disabled 룰은 미출력, fallback 컨텍스트 존재
3. 동일 exten 패턴 충돌 → priority 작은 룰만 채택

## 운영 노트

- **REGEX 룰**: dialplan 에 들어가지 않음. 사용 시 운영자가 의도한 매칭이 PBX 에서 일어나지 않을 수 있음. UI 의 룰 테스트는 서버 측에서 매칭하므로 결과가 일치하지 않을 수 있다 — 사용자 안내 필요.
- **specificity 충돌**: Asterisk 의 native pattern matching 은 most-specific match 를 우선. 따라서 `_010.` (PREFIX) 와 `01012345678` (EXACT) 가 함께 있으면 EXACT 가 011…. 같은 다른 번호와 무관하게 우선. priority 는 같은 패턴 충돌 시에만 의미를 가짐.
- **branch 분기**: 본 PR 에서는 tenant 단위 모든 룰을 모든 agent 에 동일하게 적용 (전역 컨텍스트 `[outbound-cid-rules]`). branch 별 분기는 향후 follow-up.

## 변경 파일 목록

### 수정
- `apps/server/src/modules/asterisk-config/renderers/agent-dialplan.renderer.ts`
- `apps/server/src/modules/asterisk-config/renderers/agent-dialplan.renderer.spec.ts`
- `apps/server/src/modules/asterisk-config/asterisk-reload.service.ts`
