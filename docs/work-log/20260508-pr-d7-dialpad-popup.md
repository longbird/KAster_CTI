# PR-D7 — 발신 키패드 별도 창 (P1-8)

> 격차 문서 § 3 P1-8 항목. 마우스 다이얼링 / 큰 숫자 패드 (안내데스크형) 의 별도 창. 통화내역·상담원 리스트와 같은 popup window 패턴을 그대로 활용.

## 변경 범위

### IPC / 메인 프로세스
- `src/shared/ipc.ts` — `DesktopApi.openDialpadPopup(): Promise<void>` 추가.
- `src/preload/index.ts` — `desktop:open-dialpad-popup` 채널 노출.
- `src/main/index.ts`
  - 기존 `openUtilityWindow(kind: 'history' | 'agents')` → `'history' | 'agents' | 'dialpad'` 로 확장 (`UtilityWindowKind` 타입).
  - `getUtilityWindowTitle` / `getUtilityWindowBounds` / `getUtilityWindowRoute` 함수로 분리해 가독성 보강.
  - dialpad 윈도우 기본 크기: `360×560`, 최소 `320×520` (안내데스크형 큰 키 + caller ID 셀렉트).
  - `ipcMain.handle('desktop:open-dialpad-popup', …)` 등록.
  - hash route: `#/dialpad-popup`.

### 렌더러 store
- `src/renderer/src/store/useDesktopStore.ts`
  - 인터페이스에 `openDialpadPopup(): Promise<void>` 추가, `getDesktopApi().openDialpadPopup()` 위임 구현.

### 렌더러 UI
- `src/renderer/src/components/DialpadPopup.tsx` (신규)
  - 12 키 그리드 (`1`~`9`, `*`, `0`+`+`, `#`).
  - 발신번호(callerId) Select — `getCallerIds` IPC 로 초기 로드, `defaultCallerId` 우선 선택.
  - 디스플레이 입력 — 키 클릭/직접 타이핑/키보드 단축키 모두 입력 가능. 허용 문자: `[0-9*#+]`.
  - 단축키:
    - `Enter` → 발신
    - `Backspace` → 한 자리 지우기
    - `Esc` → 모두 지우기
  - 발신은 기존 `requestHistoryOriginate` IPC 재사용 — 메인 윈도우 store 의 originate 플로우로 회귀 (별도 IPC 추가 불필요, 토큰/runtime 컨텍스트는 메인 윈도우가 단일 소유).
  - 성공 시 디스플레이 비움 + 상태 메시지 표시. 실패 시 에러 메시지 + 입력 유지.
- `src/renderer/src/App.tsx`
  - hash `'#/dialpad-popup'` 분기 → `<DialpadPopup />` 렌더.
  - `openDialpadPopup` 을 store 에서 destructure 해 SoftphoneShell 에 전달.
- `src/renderer/src/components/SoftphoneShell.tsx`
  - prop `onOpenDialpadPopup: () => void` 추가.
  - 기존 "외부 발신" 섹션 헤더의 액션 영역에 "키패드" 버튼 추가 (`내역` 버튼 옆). `console-section-actions` 래퍼로 다중 버튼 정렬.
- `src/renderer/src/styles.css`
  - `.console-section-actions` (다중 헤더 버튼 정렬)
  - `.dialpad-popup-layout`, `.dialpad-display-row`, `.dialpad-caller-id`, `.dialpad-display`
  - `.dialpad-grid`, `.dialpad-key`, `.dialpad-key__label`, `.dialpad-key__sub`
  - `.dialpad-actions`, `.dialpad-secondary`, `.dialpad-call`

## 테스트

- `src/renderer/src/components/DialpadPopup.test.tsx` (신규, 3 cases)
  - 키 누르면 디스플레이에 누적되고 `requestHistoryOriginate` 호출.
  - Backspace / C 버튼이 입력 정리.
  - IPC 실패 시 에러 메시지 표시 + 입력값 유지.
- `src/renderer/src/components/SoftphoneShell.test.tsx` — `onOpenDialpadPopup` mock prop 추가 (모든 기존 케이스 패스스루).
- 결과: **36 files / 160 tests pass**.

## 검증 명령

```
cd apps/desktop && npm test    # 160/160
cd apps/desktop && npm run build  # exit 0
```

## 영향 범위 / 회귀 메모

- 메인 프로세스의 `openUtilityWindow` 시그니처가 union `UtilityWindowKind` 로 확장됨. 기존 'history' / 'agents' 호출은 동일하게 유지.
- 새 popup 은 메인 윈도우와 동일한 preload 를 사용 — `desktopApi` 전체가 노출되지만 실제로 사용하는 IPC 는 `getCallerIds`, `requestHistoryOriginate` 두 가지뿐.
- 발신 흐름은 메인 윈도우의 store originate 를 그대로 거치므로, runtime 인증/토큰/audio devices 는 popup 이 따로 관리하지 않음 (단일 진실원).
- backend / Asterisk / DB / WS 변경 없음.
