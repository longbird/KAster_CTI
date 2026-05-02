# Desktop Contextual Console Redesign

## 배경

기존 상담원 데스크톱 레퍼런스 이미지는 기능 후보와 업무 흐름을 파악하기 위한 자료다. 화면 스타일, 브랜드, 좌측 이미지, 레거시 윈도우 구성 자체를 복사하지 않는다.

현재 `apps/desktop`은 작은 Electron 상담원 런타임이며, 핵심 역할은 상담원이 통화 상태를 빠르게 파악하고 즉시 필요한 조작만 수행하는 것이다. 따라서 화면은 기능 탭을 나열하는 방식이 아니라 통화 상태에 맞춰 정보와 액션을 교체하는 단일 콘솔로 설계한다.

## 목표

- 작은 데스크톱 창에서 상담원에게 지금 필요한 정보와 조작만 노출한다.
- `대기`, `수신`, `통화중`, `전환중`, `후처리`, `설정` 상태에 따라 화면 내용과 창 크기를 조정한다.
- 발신은 사전 등록된 발신번호 목록에서 선택한 번호로만 요청한다.
- 상담원 리스트는 내선 통화 진입점으로 제공한다.
- 통화내역은 기본 콘솔에 넣지 않고 별도 팝업 창으로 표시한다.
- 라이트/다크 모드 모두에서 같은 정보 구조와 대비 기준을 유지한다.
- 레거시 이미지에서 확인한 기능은 현재 프로젝트 기능과 맞는 것만 흡수한다.
- `맑은하늘` 같은 레퍼런스 이미지의 업체/브랜드 요소는 사용하지 않는다.
- `KAster CTI` 정체성, 작고 밀도 있는 운영 도구 스타일을 유지하되 특정 색상 모드에 고정하지 않는다.

## 비목표

- 레거시 데스크톱 앱 화면 복제.
- 통화내역, 상담원 리스트, CID 발신, 공지사항 등 모든 레퍼런스 기능을 한 화면에 나열.
- 관리자/웹 상담원 앱의 전체 기능을 데스크톱 작은 창에 이식.
- 공지사항 기능 추가.

## 상태 모델

렌더러는 기존 `activeCall`, `softphone.session`, `agentStatus`, `runtimeConnection`을 조합해 다음 화면 상태를 계산한다.

| 상태 | 조건 | 목적 |
| --- | --- | --- |
| `idle` | 활성 CTI 통화와 softphone 세션이 없음 | 대기 상태, 외부/내선 발신, 상태 변경, 설정/이력 진입 |
| `ringing` | CTI `QUEUED`/`RINGING_AGENT` 또는 softphone `ringing` | 수신 응답/거절 또는 당겨받기 |
| `talking` | CTI `TALKING`/`HOLD` 또는 softphone 통화 진행 | 종료, 보류/재개, 음소거, 전환, 메모 |
| `transferring` | CTI `TRANSFERRING` 또는 `latestTransfer` 진행 중 | 통화 중 전환 대상/방식, 완료/취소 |
| `afterCall` | CTI `AFTER_CALL_WORK` 또는 상담 후처리 상태 | 결과 선택, 메모 저장, 상태 복귀 |
| `settings` | 사용자가 설정을 연 상태 | 오디오 장치, 권한, 진단, 런타임 재연결 |

전환 기능은 통화 중에만 사용 가능하다. `idle`, `ringing`, `afterCall` 상태에서는 전환 버튼과 전환 입력을 렌더링하지 않는다.

동시에 여러 조건이 맞으면 우선순위는 `settings > transferring > ringing > talking > afterCall > idle`로 한다. `settings`는 사용자가 명시적으로 연 상태이므로 통화 중에도 닫을 수 있어야 하며, 통화가 들어오면 수신 상태로 자동 전환할 수 있다.

## 창 크기 계약

현재 main process는 `setWindowMode('compact' | 'full')`만 지원하고, renderer는 앱 시작 시 `compact`를 호출한다. 새 설계에서는 데스크톱 창 크기를 화면 상태에 맞게 조정하기 위해 IPC 계약을 확장한다.

| 모드 | 권장 크기 | 사용 상태 | 이유 |
| --- | --- | --- | --- |
| `idle` | `420 x 360`, min `380 x 320` | 대기 | 통화가 없을 때는 상태/발신/설정만 필요 |
| `ringing` | `440 x 420`, min `400 x 380` | 수신 | 발신자/큐 정보와 큰 응답 버튼이 필요 |
| `talking` | `460 x 620`, min `420 x 540` | 통화중 | 통화 정보, 조작, 메모 최소 영역 필요 |
| `transferring` | `500 x 640`, min `440 x 560` | 전환중 | 대상 입력, 전환 방식, 완료/취소가 추가됨 |
| `afterCall` | `460 x 520`, min `420 x 460` | 후처리 | 결과/메모 저장 중심 |
| `settings` | `560 x 720`, min `500 x 640` | 설정 | 장치 목록과 진단 내용을 안정적으로 표시 |
| `historyPopup` | `920 x 640`, min `760 x 520` | 통화내역 팝업 | 표/필터/녹취 링크를 본창과 분리 |
| `agentListPopup` | `440 x 560`, min `380 x 460` | 상담원 리스트 팝업 | 내선 통화 대상 검색/선택 |

기술 구현은 기존 `setWindowMode`를 `setWindowMode(mode: DesktopWindowMode)`로 확장하거나, 별도 `setWindowProfile(profile)` IPC를 추가한다. 기존 `compact`/`full` 호출 호환성을 유지하려면 `compact`는 `idle`, `full`은 `settings`에 매핑한다.

창 크기는 상태가 바뀔 때 즉시 바꾸되, 사용자가 수동으로 창을 늘린 경우에는 축소만 조심스럽게 처리한다. 첫 구현에서는 상태 전환 시 지정 크기로 맞추는 단순 정책을 사용하고, 이후 사용자 리사이즈 보존이 필요하면 별도 설정으로 분리한다.

## 화면 구조

모든 상태는 같은 상단 identity bar를 공유한다.

- 좌측: `KAster CTI`
- 중앙: 상담원명, 내선, 연결 상태
- 우측: 상담원 상태 selector 또는 상태 pill, 설정/통화내역/상담원 리스트 버튼

본문은 상태별로 교체한다.

### `idle`

노출:
- 현재 상태: 대기, 재연결 중, 오프라인 등
- 상담원 상태 변경
- 외부 발신 번호 입력, 사전 등록 발신번호 선택, 발신 버튼
- 상담원 리스트 열기
- 통화내역 팝업 열기
- 설정 진입

숨김:
- 종료, 보류, 음소거, 전환, 메모
- 전환 입력

외부 발신은 `callerIds` 목록이 비어 있으면 비활성화하고, 사용자가 임의 발신번호를 직접 입력하지 못하게 한다. 기본 선택값은 웹 `FloatingDialerWindow`와 동일하게 저장된 선택값, 기본 발신번호, 첫 번째 등록번호 순서로 정한다.

### `ringing`

노출:
- 발신번호, 수신번호 또는 큐명
- 고객명이 있으면 고객명/등급
- 큰 기본 액션: `수신`
- 보조 액션: `거절` 또는 `닫기`는 실제 API 가능 여부에 따라 표시

숨김:
- 발신 입력
- 전환/메모/진단
- 상담원 리스트

### `talking`

노출:
- 고객명 또는 미식별 고객
- 발신번호, 큐, 통화 시간
- 주요 조작: `종료`, `보류/재개`, `음소거/해제`
- 보조 조작: `전환 열기`
- 접힌 메모 영역 또는 한 줄 메모 저장
- 통화내역 팝업 열기

숨김:
- 새 발신
- 설정 진단 상세

전환 열기는 `talking` 또는 `hold` 상태에서만 제공한다. 수신 전 또는 후처리 상태에서는 전환을 시작할 수 없다.

### `transferring`

노출:
- 현재 통화 요약
- 전환 대상 입력
- 전환 방식: 바로 전환, 상담 전환
- 전환 진행 중이면 완료/취소

숨김:
- 일반 발신
- 오디오 설정

전환 대상은 직접 번호 입력보다 상담원 리스트에서 선택하는 흐름을 우선한다. 직접 입력은 운영 정책상 허용된 경우에만 보조 입력으로 둔다.

### `afterCall`

노출:
- 처리 결과 선택
- 상담 메모
- 저장 후 상태 복귀 액션

숨김:
- 통화 제어 버튼
- 발신/전환 입력

### `settings`

노출:
- 오디오 권한
- 마이크/스피커/벨소리 장치
- 스피커/벨소리 테스트
- 진단 접기/펼치기
- runtime 재연결, softphone 등록/중지

숨김:
- 일반 상담 조작

## 기능 매핑

레퍼런스 이미지에서 가져올 수 있는 기능 의미는 다음처럼 제한한다.

| 레퍼런스 기능 | 데스크톱 반영 여부 | 반영 방식 |
| --- | --- | --- |
| 상담원 상태 | 반영 | identity bar의 selector |
| 전화걸기/CID 발신 | 반영 | `idle` 상태의 외부 발신 입력 + 사전 등록 발신번호 선택 |
| 당겨받기/수신 | 반영 | `ringing` 상태 기본 액션 |
| 전화끊기/보류/음소거 | 반영 | `talking` 상태 액션 |
| 호 전환 | 반영 | 통화 중 `talking`에서만 열고 `transferring` 화면으로 전환 |
| 메모 저장 | 반영 | `talking`/`afterCall`에서 제한 노출 |
| 통화내역 | 반영 | 별도 팝업 창으로 표시 |
| 상담원 리스트 | 반영 | 별도 팝업 또는 확장 패널로 표시하고 내선 통화 대상 선택에 사용 |
| 공지사항 | 제외 | 현재 desktop IPC/API 범위 밖 |
| 레퍼런스 브랜드/이미지 | 제외 | 프로젝트와 무관 |

## 발신번호와 내선 통화

외부 발신은 사전 등록 발신번호 목록을 필수로 사용한다. 데스크톱 renderer는 `callerIds`와 `defaultCallerId`를 받아 발신번호 select를 렌더링하고, 선택된 번호만 `originate({ callerId })`에 전달한다. 목록이 없으면 외부 발신 영역은 비활성화하고 “등록된 발신번호 없음” 상태를 표시한다.

내선 통화는 상담원 리스트에서 대상 상담원을 선택해 시작한다. 리스트는 이름, 내선, 역할, 현재 상태를 보여주며, 비활성 또는 통화 불가능 상태는 클릭을 막는다. 구현은 웹의 `originateInternalCall(targetAgentId, targetExtension)` 흐름과 맞춘다.

## 통화내역 팝업

통화내역은 본 콘솔에 탭으로 넣지 않는다. 본창의 상단 보조 버튼 또는 후처리 화면의 링크로 별도 BrowserWindow를 열고, 해당 창에서 날짜/상담원/상태 필터와 표를 표시한다.

팝업은 본창의 상태 기반 크기 변경과 독립적이어야 한다. 팝업이 열려 있어도 통화 수신/통화중 상태 변화는 본창에 우선 반영된다.

## 테마

라이트/다크 모드를 모두 지원한다. 구현은 하드코딩 색상 대신 semantic token을 사용한다.

- 배경: `--desktop-bg`, `--desktop-surface`, `--desktop-surface-raised`
- 텍스트: `--desktop-fg`, `--desktop-muted`
- 경계: `--desktop-border`
- 상태: `--status-available`, `--status-ringing`, `--status-talking`, `--status-acw`, `--status-offline`
- 액션: `--action-primary`, `--action-danger`, `--action-neutral`

기본값은 OS `prefers-color-scheme`을 따른다. 추후 사용자 수동 전환이 필요하면 설정 화면에 추가한다. 첫 구현에서는 시스템 테마 대응과 시각 검증을 범위로 한다.

## 컴포넌트 설계

`SoftphoneShell`을 한 파일에 계속 확장하지 않고 다음 하위 컴포넌트로 나눈다.

- `DesktopConsoleHeader`: 브랜드, 상담원, 내선, 상태 selector, 연결 상태, 설정 버튼.
- `IdleConsole`: 대기 상태, 발신 입력, 상태 변경 보조.
- `RingingConsole`: 수신 정보와 응답 액션.
- `TalkingConsole`: 현재 통화 정보와 기본 통화 조작.
- `TransferConsole`: 전환 대상/방식/완료/취소.
- `AfterCallConsole`: 결과/메모/저장.
- `SettingsConsole`: 오디오/진단.
- `DialerConsole`: 외부 발신번호 선택, 대상 번호 입력, 외부 발신.
- `AgentListPopup`: 상담원 검색, 상태 표시, 내선 통화 시작.
- `CallHistoryPopup`: 통화내역 필터와 표.

상태 계산은 `deriveDesktopConsoleState()` 같은 순수 함수로 분리해 테스트한다. 창 크기 모드 계산도 `getWindowModeForConsoleState()`로 분리한다.

## 데이터 흐름

1. `useDesktopStore`가 CTI/softphone 이벤트를 받아 `activeCall`, `softphone`, `agentStatus`, `runtimeConnection`을 갱신한다.
2. `SoftphoneShell`이 이 값을 입력으로 받아 현재 콘솔 상태를 계산한다.
3. renderer가 발신번호 목록과 상담원 목록을 로드해 발신/내선 통화 UI에 전달한다.
4. 상태가 바뀌면 renderer가 main process에 창 모드 변경 IPC를 보낸다.
5. 통화내역과 상담원 리스트는 필요할 때 별도 팝업 IPC를 호출한다.
6. 상태별 컴포넌트는 현재 상태에 필요한 액션만 호출한다.

## 오류와 예외 처리

- `runtimeConnection !== connected`이면 제어 버튼은 비활성화하고, 상태 영역에 재연결 상태를 표시한다.
- `activeCall`이 없으면 종료/보류/전환/메모 저장은 렌더링하지 않는다.
- 통화 중이 아니면 전환 기능을 렌더링하지 않는다.
- 전환 대상이 비어 있으면 전환 버튼은 비활성화한다.
- 외부 발신번호 목록이 비어 있으면 외부 발신 버튼을 비활성화한다.
- 선택된 발신번호가 사전 등록 목록에 없으면 발신 요청을 보내지 않는다.
- 오디오 권한이 거부되면 설정 화면에만 표시하고 기본 상담 화면에는 노출하지 않는다.
- 창 크기 IPC가 실패해도 상담 조작 자체는 계속 가능해야 한다.

## 테스트 계획

- `deriveDesktopConsoleState` 단위 테스트:
  - no call -> `idle`
  - queued/ringing -> `ringing`
  - talking/hold -> `talking`
  - latestTransfer -> `transferring`
  - after call work -> `afterCall`
  - settings override
- `getWindowModeForConsoleState` 단위 테스트.
- `SoftphoneShell` 렌더 테스트:
  - idle 화면에는 통화 제어 버튼이 없음.
  - idle 화면의 외부 발신은 등록된 발신번호 select를 사용함.
  - 등록된 발신번호가 없으면 외부 발신이 비활성화됨.
  - ringing 화면에는 수신 액션이 있고 발신 입력은 없음.
  - talking 화면에는 종료/보류/음소거/전환 열기가 있음.
  - talking 외 상태에는 전환 열기가 없음.
  - settings 화면에만 오디오 장치와 진단이 있음.
- 팝업/창 테스트:
  - 통화내역 버튼은 별도 팝업 IPC를 호출함.
  - 상담원 리스트 버튼은 내선 통화 대상 팝업을 열고 대상 선택 시 내선 발신 IPC를 호출함.
- main process 창 모드 테스트:
  - 새 window mode별 bounds가 적용됨.
  - 기존 `compact`/`full` 호환이 유지됨.
- 테마 테스트:
  - 라이트/다크 토큰이 모두 정의됨.
  - Playwright 또는 브라우저 프리뷰에서 두 테마 화면이 겹침 없이 렌더링됨.
- 빌드 검증:
  - `apps/desktop npm run test`
  - `apps/desktop npm run build`
- 시각 검증:
  - mock `desktopApi`로 idle/ringing/talking/transferring/settings 프리뷰를 열고 각 화면 캡처 확인.

## 승인 기준

- 레퍼런스 이미지의 브랜드/좌측 이미지/윈도우 복제 흔적이 없다.
- 기본 화면에 불필요한 기능 탭이나 기능 나열이 없다.
- 각 상태에서 다음에 눌러야 할 액션이 가장 눈에 띈다.
- 상태 변화에 따라 창 크기가 실제로 달라진다.
- 전환은 통화 중에만 보이고 동작한다.
- 외부 발신은 사전 등록 발신번호로만 요청된다.
- 통화내역은 별도 팝업으로 열린다.
- 상담원 리스트에서 내선 통화를 시작할 수 있다.
- 라이트/다크 모드 모두에서 대비와 레이아웃이 유지된다.
- 설정/진단은 기본 상담 화면에서 숨겨진다.
- 테스트와 빌드가 통과한다.
