# PR-D9 — 상담원 디렉토리 그룹화·검색 (P1-10)

> 격차 문서 § 3 P1-10 항목. `AgentListPopup` 평면 리스트 → 그룹별 collapsible 트리 + 검색.

## 범위 결정

격차 문서는 "지사/그룹 트리 + 검색" 을 요청. 현 백엔드 응답:
- `agentGroup: { agentGroupId, groupCode, groupName }` — 이미 `agents` list 응답에 포함 (PR1-1 에서 추가됨).
- `branch` — `agents` 모델에 직접 컬럼 없음. `branchAgents` join 테이블이 별도 존재. 1:N 관계라 "primary branch" 정의 + 추가 query 필요.

이 PR 은 **그룹화** 만 우선 적용. 지사 단위 그룹화는 백엔드에 별도 endpoint/projection 이 필요해 follow-up 으로 분리. (회귀 메모 참고)

## 변경 범위

### IPC 계약
- `src/shared/ipc.ts`
  - `DesktopAgentGroupSummary` 신규 export.
  - `DesktopAgentDirectoryItem.agentGroup?: DesktopAgentGroupSummary | null` 추가 (옵셔널, 기존 호출자 호환).

### 데스크톱 메인 (CtiRuntime)
- `src/main/cti-runtime.ts:getAgentDirectory`
  - 응답 필드 `agentGroup` 을 정규화해 통과 시킴. groupCode/groupName 누락 시 빈 문자열 fallback.

### 렌더러 UI
- `src/renderer/src/components/AgentListPopup.tsx` (대규모 갱신)
  - `bucketize()` 가 `agentGroup.agentGroupId` 키로 그룹화. group 가 null 인 행은 `미지정` 가상 그룹으로.
  - 그룹 정렬: 미지정은 항상 마지막, 나머지는 한국어 로케일 라벨 정렬. 그룹 내부는 extension 오름차순.
  - 헤더에 "그룹 선택" Select (기본 "전체 그룹") + 검색 Input.
  - 그룹 헤더는 collapsible (▶/▼). 클릭 시 토글, 상태는 컴포넌트 내부 `collapsed` Record.
  - 검색 매칭은 `agentName / extension / status / groupName / groupCode` 어느 하나라도 substring 포함.
  - 멤버 0 명인 그룹은 자동 비표시. 모든 그룹이 비면 "표시할 상담원이 없습니다." 안내.

### CSS
- `src/renderer/src/styles.css`
  - `.agent-popup-filters` — 헤더 셀렉트+검색 정렬.
  - `.popup-agent-tree`, `.popup-agent-group`, `.popup-agent-group__header`, `.popup-agent-group__count`.

## 테스트

- `src/main/cti-runtime.test.ts` — `getAgentDirectory` 케이스 확장:
  - `agentGroup` 객체가 정규화되어 보존됨.
  - `agentGroup: null` 도 그대로 통과.
- `src/renderer/src/components/AgentListPopup.test.tsx` — 1 → 3 케이스로 확장:
  - 한글 가용성 라벨 (기존).
  - 그룹별 섹션 렌더 + 그룹 셀렉트 필터.
  - 검색어가 그룹명에도 매칭.
- 결과: **37 files / 166 tests pass**.

## 검증 명령

```
cd apps/desktop && npm test    # 166/166
cd apps/desktop && npm run build  # exit 0
```

## 영향 범위 / 회귀 메모

- 지사(branch) 단위 그룹화는 본 PR 에서 제외. 사유:
  - `agents` 응답에 branch 가 없고, `branchAgents` 는 1:N 매핑이라 "primary branch" 정의가 필요.
  - 데스크톱 디렉토리는 호출 가능 여부 + 빠른 검색이 핵심이므로, 이번 PR 은 그룹 한 축으로 충분.
  - follow-up 옵션: agents service list 에 `branches: BranchSummary[]` 또는 `primaryBranch: BranchSummary | null` 추가 → 본 컴포넌트의 `bucketize` 를 두 키 (group → branch) 다중 그룹화로 확장.
- 기존 호출 코드(`AgentListPopup` 외부에서 `formatDirectoryAgentSummary` 등 헬퍼) 영향 없음.
- backend / Asterisk / DB / WS 변경 없음.
