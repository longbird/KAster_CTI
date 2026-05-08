# PR-D10 — Supervisor 라이브 상담원 모니터링 (P2-13)

> 격차 문서 § 3 P2-13 항목 — "admin 에 위임할지 데스크톱에 둘지 결정 필요". admin 으로 결정. 데스크톱 상담원 앱은 통화 중 컨텍스트가 핵심이고, 다중 상담원 조망은 supervisor 가 별도 화면에서 처리.

## 변경 범위

### 서버 (메뉴 키 등록만)
- `apps/server/src/common/menu-permission.service.ts`
  - `MENU_KEYS` 에 `'monitoring/agents'` 추가.
  - `OPERABLE_MENU_KEYS` 에도 추가 — view + operate 가능 (supervisor 액션 옵션 향후 추가 대비). MUTABLE 은 아님 (행 데이터를 직접 편집하지 않음).
- `apps/server/src/common/menu-permission.service.spec.ts`
  - `defaultPermissionFlags('supervisor', 'monitoring/agents')` 가 view+operate true / mutable false 를 만족하는지 검증.
  - `agent` 역할은 view 도 false.
- 기존 endpoint 재사용:
  - `GET /agents` — 상담원 목록 + currentStatus + sipRegistration + agentGroup.
  - `GET /calls/active?limit=500` — 활성 통화 + primaryAgentId.
  새 endpoint 추가 없음.

### admin 앱 — 신규 feature
- `apps/admin/src/features/agent-monitoring/`
  - `types.ts` — `AgentMonitorRow`, `ActiveCallRow` 인터페이스.
  - `fixtures.ts` — `joinAgentsAndCalls(agents, calls)` 가 primaryAgentId 로 매칭, 동일 agent 의 중복 통화는 첫번째만 유지. `summarizeMonitorRows(rows)` 가 전체/온라인/오프라인/대기/통화중/후처리/휴식 카운트 산출.
  - `fixtures.test.ts` — 4 cases (매칭, 필드 보존, 중복 방어, 요약).
  - `AgentMonitoringPage.tsx`:
    - 상단 KPI 6 카드 (전체/온라인/대기/통화중/후처리/휴식).
    - 필터: 그룹 Select (전체/각 그룹/미지정), 상태 Select (전체/대기/통화중/후처리/휴식/오프라인), 로그인 토글, 검색 input.
    - 테이블: 상담원(이름+id+ext) / 그룹 / 로그인 / 전화기 / 상태(+체류시간) / 활성 통화(방향+상대+큐+통화시간).
    - 5 초마다 `/agents` + `/calls/active` 병렬 폴링. 1 초 ticker 로 시간 표기 갱신.
    - 에러 발생 시 마지막 데이터 유지 + 경고 텍스트.

### 라우팅 / 메뉴
- `apps/admin/src/app/router.tsx` — `path: 'monitoring/agents'` 등록.
- `apps/admin/src/shared/permissions/menuConfig.tsx` — 실시간 운영 그룹에 `/monitoring/agents` "상담원 라이브 모니터" 항목 (시스템 모니터링 위에 배치 — 지표 빈도 순).
- `apps/admin/src/shared/permissions/menuConfig.test.tsx` — `BASELINE_LEAF_KEYS` 와 `realtime` 자식 배열에 `/monitoring/agents` 추가.

## 테스트

- 서버: `apps/server/src/common/menu-permission.service.spec.ts` — 1 case 추가, 6/6 pass.
- 어드민:
  - `apps/admin/src/features/agent-monitoring/fixtures.test.ts` — 4 cases, 모두 pass.
  - `apps/admin/src/shared/permissions/menuConfig.test.tsx` — 기존 13 case 중 2 case 가 새 leaf 키 추가에 맞춰 갱신.
  - 결과: **19 files / 58 tests pass** (admin 전체).

## 검증 명령

```
cd apps/server && npx jest src/common/menu-permission.service.spec.ts --runInBand    # 6/6
cd apps/server && npm run build    # exit 0
cd apps/admin && npm test -- --run    # 58/58
cd apps/admin && npm run build    # exit 0
```

## 영향 범위 / 회귀 메모

- 권한 매트릭스: 기존 supervisor/admin role 은 자동으로 `monitoring/agents` 에 view+operate 권한을 갖는다 (DEFAULT_ROLE_ACCESS 가 `new Set(MENU_KEYS)` 로 모든 키를 포함하므로). `agent` 는 false. 추가 마이그레이션 불필요 — `agentMenuPermissions` 테이블의 row 가 빠진 키는 default flags 로 fallback (`menu-permission.service.ts` 의 `defaultPermissionFlags` 호출 경로).
- 기존 `/monitoring` (시스템 헬스) 페이지 영향 없음. 이름 충돌 없음 — 라우트는 별도 segment.
- 데스크톱 / Asterisk / WS / DB 변경 없음. 신규 백엔드 endpoint 없음 — 서버 빌드는 menu-permission 변경만으로 성공.
- supervisor 가 향후 force logout / status reset 등 액션을 추가하려면 동일 페이지에 행 액션 컬럼 + 별도 `POST /admin/agents/:id/...` endpoint 추가 (별도 PR 권장).
