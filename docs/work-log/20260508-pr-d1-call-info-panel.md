# PR-D1 — 통화 중 고객 정보 패널 + 메모 (2026-05-08)

> 데스크톱 상담원 앱 — BlueSky 격차 § P0-1
> 참고: `docs/work-log/20260508-desktop-vs-bluesky-gap.md`

## 변경 요약

`talking` / `transferring` / `afterCall` 윈도우 모드에서 통화 중인 고객의
정보·과거 통화·메모 입력을 한 패널에 표시. BlueSky `DlgCallRecv` 등가물.

## 변경 사항

### 백엔드 (`apps/server`)

- `apps/server/src/modules/calls/calls.service.ts:442` — `getCallDetail` 응답 확장:
  - `customer` (with `phones`) include
  - `customerHistory` — 같은 고객의 직전 통화 5건 (현재 통화 제외)
  - `callMemos` 정렬을 `createdAt desc` 로 명시 (최신 메모가 0 번 인덱스)

기존 `GET /calls/:callId` 는 JWT 만 요구하는 agent-accessible endpoint 이므로
신규 endpoint 추가 없이 응답 페이로드만 보강. 서버 권한·라우팅 변경 0 건.

### IPC (`apps/desktop/src/shared/ipc.ts`)

신규 타입:
- `DesktopCallContext`, `DesktopCallContextHistoryItem`, `DesktopCallContextMemo`
- `DesktopSaveCallMemoInput`

신규 메서드:
- `getCallContext(callId): Promise<DesktopCallContext | null>`
- `saveCallMemo(input): Promise<DesktopCallContextMemo>`

### 메인 프로세스

- `apps/desktop/src/main/cti-runtime.ts` — `getCallContext`, `saveCallMemo` 메서드 추가. axios 응답을 IPC 형태로 매핑.
- `apps/desktop/src/main/index.ts` — `desktop:get-call-context`, `desktop:save-call-memo` 채널 등록.
- `apps/desktop/src/preload/index.ts` — 두 채널 노출.

### 렌더러

- `apps/desktop/src/renderer/src/components/CallInfoPanel.tsx` (신규)
  - 고객명·등급(VIP/블랙/일반)·대표번호·고객 메모 표시
  - 최근 통화 5건 미니 리스트 (시간·방향·담당자·통화시간)
  - 상담 메모 textarea — 800ms 디바운스 자동 저장 + 저장 상태 표시(저장 중/저장됨/저장 실패)
- `apps/desktop/src/renderer/src/components/SoftphoneShell.tsx`
  - `agentId?` prop 추가, 내부에서 `callContext` 상태 관리 (`useEffect` 로 activeCall 변경 시 fetch)
  - `talking`/`transferring`/`afterCall` 모드일 때 `<CallInfoPanel>` 렌더
- `apps/desktop/src/renderer/src/App.tsx` — `agentId={agent.agentId}` 전달
- `apps/desktop/src/renderer/src/styles.css` — call-info-panel 스타일 (grade 배지, 그리드, 메모 영역, 저장 상태 컬러)

## 검증 결과

| 게이트 | 결과 |
|---|---|
| `apps/server` `npx tsc --noEmit` | ✅ exit 0 |
| `apps/server` `npx jest --runInBand` | ✅ 32 suites / 203 tests |
| `apps/desktop` `npx tsc --noEmit` (신규 파일) | ✅ 본 PR 변경분 0 오류 (사전 존재 오류 미해결, 본 PR 범위 외) |
| `apps/desktop` `npm test` (vitest) | ✅ 32 files / 142 tests |

> 참고: `apps/desktop` 의 사전 존재 tsc 오류 (sip-softphone-client.ts, useDesktopStore.test.ts 등) 는
> 본 PR 변경 이전부터 존재. § 12 surgical 원칙에 따라 본 PR 에서 손대지 않음.

## 알려진 한계

- 메모는 `memoType: 'acw' / isFinal: false` 로 저장됨 — 통화 종료 후 후처리 코드 분리 입력은 별도 PR (PR-D2 예정).
- 안내 스크립트(`info_msg`) 표시 미포함 — 백엔드 데이터 모델에 지사·등급별 스크립트 필드가 없음. 별도 설계 필요.
- 고객 정보가 없을 때 (낯선 번호) 빈 상태로만 표시. "신규 고객 등록" 버튼은 본 PR 범위 외.
