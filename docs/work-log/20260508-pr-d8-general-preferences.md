# PR-D8 — 환경설정 풍부화 (P1-9)

> 격차 문서 § 3 P1-9 항목. 자동 시작 / 자동 로그인 / 항상 위 / 종료 시 트레이 / 벨소리 음원 선택 5종 토글을 환경설정에 추가.

## 변경 범위

### 신규 영속 store
- `src/main/general-preferences-store.ts`
  - 인터페이스 `DesktopGeneralPreferences = { autoStart, autoLogin, alwaysOnTop, closeToTray, ringTonePresetId }`.
  - JSON 파일 영속 (`general-preferences.json`).
  - `normalizeGeneralPreferences` 가 잘못된 입력(문자열, null, 알 수 없는 ringTone)을 기본값으로 fallback. 기본값은 기존 동작 유지: `autoLogin: true`, `closeToTray: true`, 그 외 false.
  - `RingTonePresetId = 'classic' | 'soft' | 'urgent' | 'silent'`.

### 메인 프로세스 적용 (사이드 이펙트)
- `src/main/index.ts`
  - `applyGeneralPreferenceSideEffects(prefs)` 함수 신설:
    - `closeToTrayEnabled` 모듈 변수 갱신 (close-to-tray 토글).
    - `app.setLoginItemSettings({ openAtLogin })` (윈도우 시작 자동 실행).
    - `BrowserWindow.setAlwaysOnTop(prefs.alwaysOnTop)` (메인 창에만 적용).
  - `attachTrayBehavior` close 핸들러 — `closeToTrayEnabled === false` 면 `app.quit()` 으로 정식 종료, true 면 기존대로 hide-to-tray.
  - `app.whenReady().then(async () => { ... })` 에서 부팅 시 `generalPreferencesStore.load()` 후 사이드 이펙트 1회 적용.
  - IPC: `desktop:get-general-preferences`, `desktop:save-general-preferences` (저장 시 사이드 이펙트 즉시 적용).

### 벨소리 프리셋
- `src/renderer/src/audio/audio-device-controller.ts`
  - `RING_TONE_PRESET_PARAMS` 맵 — classic(880Hz/420ms), soft(540Hz/600ms), urgent(1100Hz/220ms), silent(0).
  - `buildToneDataUri(frequency, durationMs, gain)` 시그니처 확장 — 기존 호출자(`OUTPUT_TONE_DATA_URI`) 는 기본 gain 0.28 유지.
  - `applyRingTonePreset(presetId)` 메서드 — 변경 시 `ringPreviewAudio.src` 만 갱신.
  - `playRingPreview()` — `'silent'` 프리셋은 즉시 return.

### 렌더러 store
- `src/renderer/src/store/useDesktopStore.ts`
  - 상태 `generalPreferences: DesktopGeneralPreferences` 추가.
  - `initialize` 에서 `getGeneralPreferences()` 와 함께 병렬 로드. **autoLogin 이 false 면 `getSession()` 결과를 무시**하고 로그인 화면 강제 (저장된 토큰은 vault 에 그대로 보존).
  - `audioController.applyRingTonePreset(prefs.ringTonePresetId)` 적용.
  - `updateGeneralPreferences(input)` — IPC 저장 + audio controller 갱신.

### UI
- `src/renderer/src/components/SoftphoneShell.tsx`
  - props `generalPreferences`, `onChangeGeneralPreferences` 추가.
  - 설정 화면에 "일반 설정" 섹션 — 4개 체크박스 + 1개 Select (벨소리 프리셋).
- `src/renderer/src/App.tsx`
  - store 에서 destructure 후 SoftphoneShell 에 전달.
- `src/renderer/src/styles.css`
  - `.general-pref-grid`, `.toggle-row`, `.general-pref-ringtone` 추가.

### preload / IPC 계약
- `src/shared/ipc.ts`
  - `DesktopGeneralPreferences`, `DesktopRingTonePresetId` export.
  - `DesktopApi.getGeneralPreferences()` / `saveGeneralPreferences()` 추가.
- `src/preload/index.ts` — 두 채널 노출.

## 테스트

- `src/main/general-preferences-store.test.ts` (신규, 4 cases)
  - 파일 없을 때 기본값 반환.
  - 저장→로드 round-trip.
  - 잘못된 입력(문자열 boolean, 알 수 없는 ringTone) → 기본값 fallback.
  - `normalizeGeneralPreferences` 부분 입력 + 기본 머지.
- `src/renderer/src/components/SoftphoneShell.test.tsx` — `generalPreferences` / `onChangeGeneralPreferences` mock prop 추가 (모든 기존 케이스 그대로 통과).
- 결과: **37 files / 164 tests pass**.

## 검증 명령

```
cd apps/desktop && npm test    # 164/164
cd apps/desktop && npm run build  # exit 0
```

## 영향 범위 / 회귀 메모

- 기본값이 기존 동작과 동일 (`autoLogin: true`, `closeToTray: true`, 나머지 false / classic). 저장 파일 없는 상태에서 동작 변화 0.
- `attachTrayBehavior` close 분기에 새로운 false 경로 추가 — 단위 테스트는 기존 trayService 케이스만 검사하므로 사용자 환경에서 토글 후 close 동작 확인 필요 (수동 QA).
- `app.setLoginItemSettings` 는 dev 모드에서 일부 OS 가 무시할 수 있음 — try/catch 로 silent.
- ring tone preset 은 동일한 dataURI 기반 — 추가 파일 번들링 없음. 향후 실제 음원 파일 도입 시에는 별도 작업.
- backend / Asterisk / DB / WS 변경 없음.
