# PR-D2 — 수신 자동응답 타이머 + 상태 변경 사유 (2026-05-08)

> 데스크톱 상담원 앱 — BlueSky 격차 § P0-2 / § P0-4
> 참고: `docs/work-log/20260508-desktop-vs-bluesky-gap.md`

## 변경 요약

1. **수신 자동응답/자동거절 타이머** — 환경설정에서 0~60초 지정. ringing 모드 진입 시
   프로그레스바 카운트다운 → 도달 시 자동 onPickup 또는 onHangup. 사용자가 수동으로
   받기/거절 누르면 자체 cleanup. BlueSky `DlgCallRecvPop` 의 자동 응답 타이머 등가.
2. **상태 변경 사유 입력** — 휴식/식사/교육/중지 선택 시 사유 textarea 모달.
   서버 `agentStatusHistory.reasonCode` 컬럼이 이미 존재하므로 데이터모델 변경 없음.
   UI/IPC/runtime/store 까지 reasonCode 가 흘러내려가게 배선만 보강.

## 변경 사항

### 데스크톱 main 프로세스

- `apps/desktop/src/main/call-preferences-store.ts` (신규) — autoAnswerSeconds /
  autoRejectSeconds / autoStatusAfterCallSeconds 영속. 0~60 clamp. JSON 파일.
- `apps/desktop/src/main/call-preferences-store.test.ts` (신규) — 기본값/clamp/round-trip 단위 테스트
- `apps/desktop/src/main/index.ts` — 두 IPC 채널 (`get-call-preferences`, `save-call-preferences`) 등록.
  `change-agent-status` 채널이 reasonCode 추가 인자 받도록.
- `apps/desktop/src/main/cti-runtime.ts` — `changeAgentStatus` 시그니처에 reasonCode 추가.
  body 에 옵셔널 포함.

### IPC

- `apps/desktop/src/shared/ipc.ts` — `DesktopCallPreferences` 타입 + `getCallPreferences` /
  `saveCallPreferences`. `changeAgentStatus(agentId, statusCode, reasonCode?)`.
- `apps/desktop/src/preload/index.ts` — 새 채널 노출.

### 렌더러

- `apps/desktop/src/renderer/src/components/RingingAutoTimer.tsx` (신규) — 100ms 틱 카운트다운
  프로그레스바 + 남은 초 표시. `auto-answer` / `auto-reject` 액션 분리 (색상 구분).
- `apps/desktop/src/renderer/src/components/RingingAutoTimer.test.tsx` (신규) — 비활성/0초/만료/액션 라벨 4 케이스
- `apps/desktop/src/renderer/src/components/SoftphoneShell.tsx`
  - `useEffect` 로 callPreferences 로드. settings 화면에 "통화 자동 처리" 섹션 추가.
  - ringing 모드에서 `RingingAutoTimer` 노출 — answer/reject 중 작은 값이 우선 발동.
  - 상태 셀렉터에 사유 모달 인터셉터: BREAK/MEAL/TRAINING/MANUAL_PAUSED 선택 시 모달 띄움.
    AVAILABLE/AFTER_CALL_WORK 는 즉시 통과.
- `apps/desktop/src/renderer/src/store/useDesktopStore.ts` — `changeAgentStatus(statusCode, reasonCode?)`.
- `apps/desktop/src/renderer/src/styles.css` — ringing-auto-timer / call-pref-grid /
  status-reason-overlay 스타일.

### 기존 테스트 갱신

- `SoftphoneShell.test.tsx` — `BREAK` 선택 시 모달 → 사유 입력 → 변경 버튼 흐름으로 변경. AVAILABLE 케이스 추가.
- `useDesktopStore.test.ts` — `changeAgentStatus` 호출 인자에 `undefined` reasonCode 명시.

## 검증 결과

| 게이트 | 결과 |
|---|---|
| `apps/server` `npx jest --runInBand` | ✅ 32 suites / 203 tests |
| `apps/desktop` `npm test` (vitest) | ✅ 34 files / 149 tests (+신규 `call-preferences-store`, `RingingAutoTimer`, BREAK 사유 시나리오) |

## 알려진 한계

- `autoStatusAfterCallSeconds` (후처리 자동 종료) 는 본 PR 에서 설정만 저장. 실제 자동 전환 동작은
  PR-D2 후속 또는 PR-D3 에 묶음 (메모 저장과의 race 회피 검토 필요).
- 자동응답·자동거절 동시 양수 설정 시 작은 쪽이 발동. UI 에 우선순위 표기 미포함 — 추후 카드 디자인에서 보강.
- 사유 모달은 자유 텍스트. BlueSky 처럼 사유 코드 셀렉트(점심/회의/교육 정의된 enum) 화는
  별도 admin 메뉴 (휴식 사유 코드 마스터) 없이는 진행 불가.
