# PR-D3 — 호 전환 핫키 (1~9 슬롯) (2026-05-08)

> 데스크톱 상담원 앱 — BlueSky 격차 § P0-3
> 참고: `docs/work-log/20260508-desktop-vs-bluesky-gap.md`

## 변경 요약

통화 중 키보드 1~9 키로 미리 등록한 대상에 즉시 호 전환. BlueSky `DlgCallTransferHotkey` 등가.
환경설정에서 슬롯별 라벨/내선번호/방식(바로/상담) 등록.

## 변경 사항

### IPC

- `apps/desktop/src/shared/ipc.ts` — `DesktopTransferHotkeyMode`, `DesktopTransferHotkeySlot`,
  `getTransferHotkeys` / `saveTransferHotkeys`.

### 데스크톱 main 프로세스

- `apps/desktop/src/main/transfer-hotkeys-store.ts` (신규) — JSON 영속.
  `normalizeSlots` 유틸: slot 1~9 clamp, target 미입력 행 제외, slot 중복 제거,
  label 빈값 → target fallback, mode 'attended' 외 → 'blind'.
- `apps/desktop/src/main/transfer-hotkeys-store.test.ts` (신규) — 정규화 4 케이스 + persist round-trip.
- `apps/desktop/src/main/index.ts` — IPC 채널 2 개 등록.
- `apps/desktop/src/preload/index.ts` — 두 메서드 노출.

### 렌더러

- `apps/desktop/src/renderer/src/components/TransferHotkeyEditor.tsx` (신규)
  - 9 행 grid 에디터 (#슬롯 / 라벨 / 내선 / 방식 / 비우기).
  - blur 시 자동 저장 (디바운스 없음 — 입력 단순).
- `apps/desktop/src/renderer/src/components/SoftphoneShell.tsx`
  - useEffect 로 `getTransferHotkeys` 로드, `updateTransferHotkeys` 핸들러.
  - **키보드 리스너**: talking/transferring 모드일 때만 `window.keydown` 부착,
    1~9 키 + 수정자 키 없음 + 입력 요소 포커스 아닐 때만 발동. 슬롯 미등록 시 noop.
  - 전환 섹션에 hotkey-chip 행 추가 — 슬롯 클릭으로도 발동 (transferAvailable 일 때만).
  - 설정 화면에 `<TransferHotkeyEditor>` 렌더.
- `apps/desktop/src/renderer/src/styles.css` — hotkey-editor / hotkey-chip /
  transfer-hotkey-strip 스타일 (attended 는 warn 색, blind 는 primary 색).

### 가드

- 키보드 리스너는 `window.addEventListener` 가 없는 환경(테스트 stub)에서 안전하게 noop.
- TRANSFER_READY_STATUSES (TALKING/HOLD/TRANSFERRING) 만 핫키 발동.

## 검증 결과

| 게이트 | 결과 |
|---|---|
| `apps/server` `npx jest --runInBand` | ✅ 32 suites / 203 tests (기존 그대로 — 본 PR 백엔드 변경 0) |
| `apps/desktop` `npm test` (vitest) | ✅ 35 files / 155 tests (+신규 `transfer-hotkeys-store` 6 테스트) |

## 알려진 한계

- 등록·삭제 시 일괄 토스트 미노출. blur 시 조용히 저장.
- 핫키는 등록한 슬롯만 동작. 슬롯이 비어 있으면 1~9 키는 통과 (다른 핸들러가 받을 수 있음).
- 백엔드 측 핫키 마스터 데이터는 별도 — 본 PR 은 클라이언트 로컬 영속만.
  멀티 디바이스 sync 가 필요하면 후속 PR 에서 user 단위 서버 저장 추가.
