# 데스크톱 상태 기반 상담 콘솔 구현 계획 및 결과

## 목표

기존 레퍼런스 이미지를 화면 디자인으로 복사하지 않고, 기능 흐름만 참고해 KAster CTI 데스크톱 앱에 맞는 작은 상담원 콘솔을 구현한다.

핵심 목표는 다음과 같다.

- 현재 통화 상태에 필요한 조작만 표시한다.
- 대기, 수신, 통화중, 전환중, 후처리, 설정 상태에 따라 Electron 창 크기를 바꾼다.
- 외부 발신은 사전 등록된 발신번호 중 하나를 선택해야만 가능하게 한다.
- 전환 기능은 통화중 또는 전환중 상태에서만 노출한다.
- 통화내역은 본창이 아니라 별도 팝업 창으로 연다.
- 상담원 리스트는 내선 통화 대상 선택과 내선 발신에 사용한다.
- 라이트/다크 모드 모두에서 같은 정보 구조와 대비를 유지한다.

## 구현 범위

### 1. 상태 계산과 창 모드

추가 파일:

- `apps/desktop/src/renderer/src/components/desktop-console-state.ts`
- `apps/desktop/src/renderer/src/components/desktop-console-state.test.ts`

구현 내용:

- `deriveDesktopConsoleState()`로 현재 콘솔 상태를 계산한다.
- `getWindowModeForConsoleState()`로 상태별 Electron 창 모드를 계산한다.
- 상태는 `idle`, `ringing`, `talking`, `transferring`, `afterCall`, `settings`로 나눈다.

창 크기:

| 상태 | 크기 | 최소 크기 |
| --- | --- | --- |
| 대기 | `420 x 360` | `380 x 320` |
| 수신 | `440 x 420` | `400 x 380` |
| 통화중 | `460 x 620` | `420 x 540` |
| 전환중 | `500 x 640` | `440 x 560` |
| 후처리 | `460 x 520` | `420 x 460` |
| 설정 | `560 x 720` | `500 x 640` |

커밋:

- `c9cb16b Add desktop console state helper`
- `7d9fde1 Add contextual desktop window modes`

### 2. 발신번호와 상담원 데이터 브리지

수정 파일:

- `apps/desktop/src/shared/ipc.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/main/cti-runtime.ts`
- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/renderer/src/store/useDesktopStore.ts`

구현 내용:

- 등록 발신번호 조회: `getCallerIds()`
- 상담원 디렉터리 조회: `getAgentDirectory()`
- 내선 발신: `originateInternal()`
- 통화내역 조회: `getCallHistory()`
- 팝업 열기: `openCallHistoryPopup()`, `openAgentListPopup()`

외부 발신은 선택된 등록 발신번호를 `originate({ callerId })`에 함께 전달한다. 등록된 발신번호가 없으면 외부 발신 버튼은 비활성화된다.

커밋:

- `1132dc4 Load desktop dialer data`

### 3. 상태별 콘솔 화면

수정 파일:

- `apps/desktop/src/renderer/src/App.tsx`
- `apps/desktop/src/renderer/src/components/SoftphoneShell.tsx`
- `apps/desktop/src/renderer/src/components/SoftphoneShell.test.tsx`
- `apps/desktop/src/renderer/src/styles.css`

구현 내용:

- 대기 상태에는 외부 발신, 내선 통화, 통화내역, 설정 진입만 표시한다.
- 수신 상태에는 받기/거절 중심의 수신 액션만 표시한다.
- 통화중 상태에는 음소거, 보류/재개, 종료, 전환만 표시한다.
- 전환은 통화중 또는 전환중 상태에서만 표시한다.
- 설정 화면에는 오디오 장치, 권한, 진단, runtime 재연결, softphone 등록/중지만 표시한다.
- 레퍼런스 이미지의 좌측 이미지, 브랜드, 레거시 윈도우 구성은 사용하지 않는다.

### 4. 통화내역과 상담원 리스트 팝업

추가 파일:

- `apps/desktop/src/renderer/src/components/CallHistoryPopup.tsx`
- `apps/desktop/src/renderer/src/components/AgentListPopup.tsx`

구현 내용:

- 통화내역은 `#/history-popup` 라우트의 별도 BrowserWindow에서 표시한다.
- 상담원 리스트는 `#/agent-list-popup` 라우트의 별도 BrowserWindow에서 표시한다.
- 이미 열린 팝업은 새로 만들지 않고 기존 창을 앞으로 가져온다.
- 통화내역 팝업은 `/calls/history` 결과를 표 형태로 보여주고 검색할 수 있다.
- 상담원 리스트 팝업은 이름/내선 검색과 내선 발신을 제공한다.

팝업 크기:

| 팝업 | 크기 | 최소 크기 |
| --- | --- | --- |
| 통화내역 | `920 x 640` | `760 x 520` |
| 상담원 리스트 | `440 x 560` | `380 x 460` |

### 5. 라이트/다크 테마

수정 파일:

- `apps/desktop/src/renderer/src/styles.css`

구현 내용:

- OS `prefers-color-scheme`에 따라 라이트/다크 색상 토큰을 적용한다.
- 카드 반경은 8px 이하로 유지한다.
- 업무용 작은 데스크톱 콘솔에 맞게 낮은 장식, 명확한 경계, 고정 버튼 높이를 사용한다.
- select option은 Windows 네이티브 드롭다운에서도 읽을 수 있게 흰 배경과 어두운 글자를 유지한다.

## 검증 결과

실행한 검증:

```powershell
cd D:\Work\AI_Projects\KAster_CTI\apps\desktop
npm run test
npm run build
```

결과:

- `npm run test`: 30개 테스트 파일, 123개 테스트 통과
- `npm run build`: Electron main/preload/renderer 빌드 성공
- `npm run preview`: Electron 프리뷰 실행 확인

최종 커밋:

- `a18cd77 Redesign desktop contextual console`

## 남은 확인 항목

실제 CTI 서버 연결 상태에서 다음 항목은 화면으로 한 번 더 확인해야 한다.

- 등록 발신번호 목록이 실제 상담원 세션 기준으로 내려오는지
- `/calls/originate/internal`이 운영 서버에서 내선 발신을 정상 처리하는지
- `/calls/history` 권한이 일반 상담원 계정에서 의도한 범위로 동작하는지
- 통화 수신, 통화중, 전환중 이벤트가 실제 Electron 창 크기 변경과 맞물려 자연스럽게 보이는지
