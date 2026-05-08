# 데스크톱 상담원 앱 — BlueSky 대비 기능/UI 비교 (2026-05-08)

> 비교 대상
> - 기존: `D:/Work/AI_Projects/IP-PBX/USER_CLIENT` (BlueSky, MFC C++ 데스크톱)
> - 신규: `apps/desktop` (Electron + sip.js + React)
>
> 참고: 일부 BlueSky 화면은 신규 admin(`apps/admin`)에서 이미 처리(예: 녹취 재생, 공지사항 관리)되었으므로
> 상담원 데스크톱에 다시 넣을지 여부는 "어디서 호출되는가" 기준으로 판단해야 한다.
> 본 문서는 **상담원이 통화 중 즉시 손이 닿아야 하는 기능** 위주.

---

## 0. 한 줄 요약

신규 데스크톱 앱은 **통화 인프라 (등록·INVITE·미디어·창 모드 전환·핸드오프·자동 업데이트)** 까지 안정화되었지만,
**통화 화면 위에서 상담원이 실제로 하는 작업 (정보 보기 / 메모 / 자동 호처리 / 자동콜 / 민원 / SMS / STT)** 은
대부분 비어 있다. BlueSky 가 1.0 운영용이라면 현재 데스크톱은 **0.6 수준**.

---

## 1. 화면/기능 매트릭스

상태 표기:
- ✅ 동등 이상 구현
- 🟡 부분 구현 (UI/플로우 일부 누락)
- ⚠ 다른 위치에서 처리 (admin 등) — 데스크톱 보강 여부 판단 필요
- ❌ 미구현
- ⛔ 운영 모델상 불필요 (제거 가능)

### 1.1 로그인 / 인증

| BlueSky 화면·기능 | 신규 데스크톱 대응 | 상태 | 비고 |
|---|---|---|---|
| `DlgLogin` 자동 로그인 + 환경설정 로드 | `DesktopLoginScreen` + `TokenVault` | ✅ | refresh token 회전까지 구현 |
| `DlgLoginErr` 로그인 오류 메시지 | `DesktopLoginScreen` 인라인 에러 | ✅ | 모달 분리 불필요 |
| `DlgCertification` 기기 인증 (SMS 인증번호) | — | ❌ | 멀티테넌트 SaaS 정책상 단말 인증을 어떤 단계에서 끼울지 결정 필요 (옵션) |
| 설정 파일 (`Config.ini`) 자동 로드 | `DesktopConfigStore` | ✅ | INI → JSON 으로 전환 |
| 자동 로그인 토글 | — | ❌ | 설정 화면에 추가 필요 |
| 원격 지원 시작 (`DlgRemote`) | — | ❌ | TeamViewer/AnyDesk 연동 옵션. 운영 도입 시 추가 |

### 1.2 메인 화면 (대시보드)

| BlueSky | 신규 데스크톱 | 상태 | 비고 |
|---|---|---|---|
| 가로 막대 메인 다이얼로그 (322×49 DLU) | 8 종 `DesktopWindowMode` (compact/full/idle/ringing/talking/transferring/afterCall/settings) | ✅+ | KAster 가 더 풍부 |
| 트레이 최소화 + 컨텍스트 메뉴 | `TrayService` | ✅ | |
| 잔액 표시 (`_refreshPay`) | — | ⛔ | KAster 운영 모델은 사이트 단위 SaaS 라 잔액 개념 없음 — **불필요** |
| 인증 상태 라벨 | `runtimeConnection` 표시 | ✅ | 형태 다름 |
| 상태 변경 드롭다운 (대기/휴식/통화중/후처리) | `AGENT_STATUS_OPTIONS` (대기/휴식/식사/교육/중지/후처리) | ✅+ | 신규가 더 세분 |
| 메인 막대에서 즉시 발신/끊기/홀드/돌려주기/당겨받기/대기열/환경설정 | `SoftphoneShell` 액션 버튼 | ✅ | 대부분 IPC 로 연결 |
| `_minimizeToTray()` | 윈도우 close → tray | ✅ | |
| 항상 위에 표시 토글 | — | ❌ | 설정 화면에 누락 (BlueSky 는 일반 설정에 존재) |

### 1.3 CID 수신

| BlueSky | 신규 데스크톱 | 상태 | 비고 |
|---|---|---|---|
| `DlgCallRecvPop` 수신 팝업 (자동응답 프로그레스바 + 수락/거절) | `ringing` 윈도우 모드로 본 창이 변형 | 🟡 | 별도 팝업 창 + **자동응답 타이머** 미구현. 답전 지연 시 자동 거절·자동 응답 정책 필요 |
| 팝업 4종 타입 (Normal / Transfer / Ext / Pull) | 단일 ringing 화면 | 🟡 | "당겨받기" / "전환받기" 등 컨텍스트 표시 없음 |
| `DlgCallRecv` 상세 정보 (발신·수신·대표·고객명·통화시간 + **메모 입력** + **안내 스크립트** + **추가 정보** + **이전 통화 이력 목록**) | `talking` 모드 — 발신/큐/세션상태만 | ❌ | **이게 가장 큰 격차**. 통화 중 화면에서 고객 정보·이전 이력·메모를 볼 수 없음 |
| 통화 메모 저장 (`PUT /calls/{id}/memo`) | 백엔드 endpoint 존재 (`POST /calls/:callId/memo`), 데스크톱 UI 미연결 | 🟡 | 메모 입력 영역만 추가하면 됨 |
| 안내 스크립트(`info_msg`) 표시 | — | ❌ | 지사·고객 등급별 안내 멘트. `branches.vipPromptId` 와 별개로 텍스트 안내 필요 |
| 사용자 키 입력 시 드래그 이동 | — | ⛔ | Electron 창 자체가 드래그 지원 — 불필요 |

### 1.4 CID 발신

| BlueSky | 신규 데스크톱 | 상태 | 비고 |
|---|---|---|---|
| `DlgCallSend` 발신 다이얼로그 | `SoftphoneShell` 발신 입력 | ✅ | |
| `DlgCallSendKeypad` 다이얼 키패드 (0–9 + DTMF) | DTMF 키패드만 통화 중에 존재 | 🟡 | **발신 전용 키패드** 가 별도로 필요 (특히 데스크톱 모드에서 마우스로 다이얼링) |
| `DlgCallSendList` 내선 상담원 목록 (지사/그룹/검색) | `AgentListPopup` | ✅ | |
| 발신 번호 선택 (지사 CID, 자기 외선 등) | `defaultCallerId` + `callerIds` IPC | ✅ | |
| 지사·그룹 트리 / 검색 | 평면 리스트 | 🟡 | 인원 많아지면 그룹화/필터 필요 |
| `DlgCallingPopup` 발신중 팝업 (상대방 응답 대기 화면) | `talking` / `transferring` 윈도우 모드로 처리 | ✅ | 별도 팝업 불필요 |
| 통화 가능 번호 매트릭스 (지사별 CID 권한) | `/me/caller-id-permissions` 백엔드 + 데스크톱 IPC | ✅ | PR1-2 에서 복원됨 |
| 발신 룰 미리보기 (어떤 CID 로 나갈지) | — | ❌ | 운영자 디버깅용. PR1-3A 의 `/admin/settings/outbound-rules/test` 가 admin 에 있지만 상담원 화면에서 "나가는 번호" 즉시 표시 미구현 |

### 1.5 호 전환

| BlueSky | 신규 데스크톱 | 상태 | 비고 |
|---|---|---|---|
| `DlgCallTransfer` 협의/무조건 전환 | `transferring` 모드 + IPC `onTransfer` / `onCancelAttendedTransfer` / `onCompleteAttendedTransfer` | ✅ | |
| `DlgCallTransferHotkey` 핫키 기반 빠른 전환 (1번~9번 단축키 → 지정 상담원) | — | ❌ | 운영 현장에서 자주 쓰는 단축키. 환경설정에서 슬롯 9 개 등록 + 통화 중 키패드 누르면 전환되도록 |
| 협의 전환 흐름 (CONSULT_RINGING / CONSULT_TALKING / REBRIDGING) | 백엔드 phase 추적 데이터모델은 있음 (`attendedTransferCandidates`), UI 단계 라벨 미노출 | 🟡 | 데스크톱에서 "협의 중" 상태 시각화 추가 필요 |
| 전환 완료 알림 / 취소 알림 | `softphone.lastError` 로 한정 | 🟡 | 토스트/배너 형태 보강 |

### 1.6 대기열

| BlueSky | 신규 데스크톱 | 상태 | 비고 |
|---|---|---|---|
| `DlgQueueList` 대기 받기 (탭 3 종) | `CallListPanel` (apps/web) — 데스크톱은 별도 창 없음 | 🟡 | 데스크톱은 단일 콜 중심. **다중 큐 모니터링 화면** 부재 |
| 대기중 / 통화중 / 내선통화 탭 | — | ❌ | 데스크톱에서 큐 상태를 볼 수 없음. 멀티 통화 라인 운영 시 필수 |
| 깜빡임 효과 (`TIMER_WAIT_QUEUE_FLICKER`) | `AttentionService` 윈도우 깜빡임만 (수신 시) | 🟡 | 큐에 새 통화 도착 시 시각적 알림 동일하게 |
| 당겨받기(Pull) | IPC `onPickup` | ✅ | |
| 큐별 대기 카운트 / 가장 오래 대기한 통화 | — | ❌ | 헤더 상단 KPI 띠로 노출 가능 |

### 1.7 통화 기록

| BlueSky | 신규 데스크톱 | 상태 | 비고 |
|---|---|---|---|
| `DlgCallList` 연결/미연결/내선 탭 | `CallHistoryPopup` | 🟡 | 단일 리스트. 탭 분리 미구현 |
| 미연결 통화 사유 (CallType) | 백엔드 데이터에는 존재하나 UI 분류 없음 | 🟡 | 미수신/거절/포기 등 사유별 필터 |
| 내선 통화 별도 탭 | — | ⛔/🟡 | 데스크톱 운영자가 내선 콜 별도 추적이 필요한지 운영 정책 확인 필요 |
| 행에서 **즉시 콜백** 버튼 | `DesktopHistoryOriginateRequest` IPC 존재 | ✅ | |
| 행에서 녹취 재생 | — | ⚠ | admin `/reports/recordings` 에서 처리. 상담원이 자기 통화 녹취 재생을 데스크톱에서 직접 들을지 정책 확인 |
| 메모/민원 인라인 표시 | — | ❌ | 민원 모듈 전체 미구현 (1.10 참조) |

### 1.8 환경설정

| BlueSky 탭 | 신규 데스크톱 대응 | 상태 |
|---|---|---|
| 통화 설정 (자동 응답 / 자동 종료 / 후처리 자동 변경) | — | ❌ |
| 소리 설정 (벨소리 / 알림음) | `audioPreferences.ringDeviceId` + `onPlayRingPreview` | 🟡 (장치만, 음원 선택 없음) |
| 일반 설정 (자동 시작 / 자동 로그인 / 항상 위) | — | ❌ |
| 핫키 설정 (수락/거절/홀드/돌려주기/끊기) | — | ❌ |
| SIP 오디오 (입력/출력 장치) | `audio-device-controller` + `DesktopAudioPreferences` | ✅ |
| SIP 폰 설정 (등록 서버 / 계정) | `DesktopSoftphoneConfig` | ✅ (자동 페어링) |
| STT/AI 분석 설정 | — | ❌ (기능 자체 미구현) |

### 1.9 자동콜 (Auto Call)

| BlueSky | 신규 데스크톱 | 상태 |
|---|---|---|
| `DlgAutoCallRecv` 자동콜 수신 + 결과 입력 | — | ❌ |
| `DlgAutoProjectStop` 프로젝트 중단 | — | ❌ |
| 자동 SMS 발송 (`auto_sms_send_msg_s_2`) | — | ❌ |
| 일일 자동콜 카운트 / 잔여량 | — | ❌ |

→ **자동 발신 캠페인 기능 전체 부재**. 영업 콜·재상담 콜 운영을 한다면 PR 단위로 별도 잡아야 함. 운영자 결정 필요.

### 1.10 민원접수 / 수신거부

| BlueSky | 신규 데스크톱 | 상태 |
|---|---|---|
| `DlgClaimReceipt` 민원접수 (연결된 통화) | — | ❌ |
| `DlgClaimReceiptNotConnect` 미연결 민원접수 | — | ❌ |
| `DlgRejectCust` 수신거부 고객 등록 | ⚠ admin `BlocklistPage` | 🟡 | 상담원이 통화 중 즉시 차단 등록 못 함 |
| 적용 범위 (전사/지사/상담원) | admin 에 일부 | 🟡 | 상담원 화면에 노출 X |

→ 사용자 명시 제외 항목 (계획 문서). **본 비교에서는 격차로만 기록하고 PR 대상 아님.**

### 1.11 모니터링 / 공지사항 / 기타

| BlueSky | 신규 데스크톱 | 상태 |
|---|---|---|
| `DlgMonitoring` 다른 상담원 화면 미리보기 (supervisor) | — | ❌ | 공지·민원과 같이 사용자 명시 제외 |
| `DlgNotify` 공지사항 팝업 | ⚠ admin `AnnouncementsPage` 가 등록만 담당 | 🟡 | 등록한 공지를 상담원 데스크톱에 푸시·표시하는 부분 미구현 |
| `DlgNotifyPopup` 일반 알림 팝업 | `AttentionService` 부분 처리 | 🟡 | 메시지 본문 표시 화면 없음 |
| `DlgNonpaymentPopup` 미납 팝업 | — | ⛔ | 잔액과 동일 — 불필요 |
| `DlgCloseNotice` 종료 알림 | Electron 자체 confirm | ✅ |
| `DlgVoiceLog` / `DlgVoiceLogDetail` 음성 로그 (자기 녹취 재생) | — | ⚠ | admin 에 있고 상담원용은 없음. 운영 정책 결정 필요 |
| `DlgSmsPreview` SMS 미리보기 | — | ❌ | SMS 모듈 전체 (사용자 명시 제외) |
| `DlgPlayOption` 녹음 재생 옵션 | — | ⚠ | admin 의 `RecordingPlayer` 와 중복 |
| `DlgStatusChange` 상태 변경 사유 입력 | drop-down 만 (사유 입력 X) | 🟡 | 휴식/식사/교육 시 사유 텍스트 입력 옵션 |
| `DlgDtmfKeypad` 통화 중 DTMF | softphone-runtime 의 `dtmf` IPC | ✅ |

### 1.12 STT / AI 분석 (BlueSky Phase 5 신규)

| BlueSky | 신규 데스크톱 |
|---|---|
| `CGoogleSttClient` 통화 후 STT | ❌ |
| `CGeminiClient` 요약/감정 분석 | ❌ |
| `CRecordingAnalyzer` 통합 | ❌ |
| 과금 동의 플로우 (사용량 추적, 무료 범위 초과) | ❌ |
| `PageConfigSttAnalysis` 설정 | ❌ |
| 통화 상세 메모칸 자동 입력 | ❌ |

→ KAster 백엔드/admin 에도 없음. 향후 별도 PR 으로 분리하거나 KAster Cloud 옵션으로 외부화 검토.

---

## 2. KAster 데스크톱이 BlueSky 보다 앞서는 부분

| 항목 | KAster 우위 |
|---|---|
| SIP UA | sip.js 기반 — 브라우저 표준 WebRTC, 불필요한 PJSIP 빌드 의존성 제거 |
| 윈도우 모드 8 종 | 통화 단계별 자동 창 변형 — BlueSky 의 단일 막대 + 모달 N 개보다 동선 짧음 |
| 자동 업데이트 | `UpdateClient` — BlueSky 는 수동 배포 (`상담원릴리즈복사.bat`) |
| 데스크톱 ↔ 브라우저 핸드오프 | `kastercti://` 프로토콜 — BlueSky 에 없음 |
| 멀티테넌시 | tenantId 격리 — BlueSky 는 단일 콜센터 전제 |
| 토큰 vault | `TokenVault` — 평문 INI 보다 안전 |
| 단위 테스트 커버리지 | main/renderer 모듈별 vitest — BlueSky 는 수동 시나리오 위주 |

---

## 3. 신규 추가 / 보강 필요 항목 우선순위

### P0 (운영 직결, 통화 중 손이 닿는 자리)

1. **통화 중 정보 패널** — 고객명·등급·이전 통화 이력·안내 스크립트·통화 메모 입력. (`talking` 윈도우 모드의 본문 보강)
   - 백엔드: `GET /calls/:callId/recv-info` 형태 또는 `GET /customers/by-phone/:phone` 활용
   - UI: 우측 패널 또는 풀모드 본문에 `RecvInfoPanel.tsx` 신설
   - 메모: `POST /calls/:callId/memo` 이미 존재
2. **수신 팝업의 자동 응답 / 자동 거절 타이머**
   - 환경설정 → 통화 설정에서 N 초 후 자동 응답 / N 초 후 자동 거절 토글
   - `ringing` 모드에 프로그레스바 추가
3. **호 전환 핫키 (단축 슬롯 9 개)**
   - 환경설정 → 핫키 탭 신설
   - 슬롯 등록 (지사·상담원 선택), 통화 중 1~9 키로 즉시 전환
4. **상태 변경 사유 입력**
   - 휴식/식사/교육 선택 시 모달 띄워 사유 짧게 입력 → `agentStatusHistory.reason` 에 저장 (컬럼 이미 존재)
5. **미연결 통화 분류 + 즉시 콜백**
   - 통화 기록 탭 분리 (연결 / 미연결 / 내선 — 내선 사용 여부 운영 확인)

### P1 (운영자 만족도)

6. **공지사항 푸시 표시**
   - admin 에서 등록한 공지를 데스크톱에 토스트/배너로 표시
   - 백엔드: 공지 push (WS broadcast) 추가 필요
7. **대기열 모니터링 미니 패널**
   - compact 모드 우상단에 "대기 N / 최대대기 mm:ss" 띠
   - 큐 새 통화 도착 시 attention flash
8. **발신 키패드 별도 창**
   - 마우스 다이얼링 / 숫자 패드 큰 버튼 (안내데스크형)
9. **환경설정 풍부화**
   - 자동 시작 / 자동 로그인 / 항상 위 / 종료 시 트레이 / 벨소리 음원 선택
10. **상담원 디렉토리 그룹화·검색**
    - `AgentListPopup` 에 지사/그룹 트리 + 검색

### P2 (전략적 보강)

11. **자동콜 수신 워크플로** — 별도 PR 단위
12. **STT/요약 통합** — Cloud STT + LLM 요약. 옵션 모듈
13. **Supervisor 모니터링 화면** — admin 에 위임할지 데스크톱에 둘지 결정 필요

---

## 4. 제거 / 미구현 유지 (운영 모델상 불필요)

| 항목 | 사유 |
|---|---|
| 잔액 표시 (`_refreshPay`) | KAster 는 사이트 단위 SaaS 라 사용량 표시는 admin 에서 |
| 미납 팝업 (`DlgNonpaymentPopup`) | 동일 |
| 기기 인증 (`DlgCertification`) | 단말 인증은 SIP 등록·OAuth 로 대체 |
| `DlgPlayOption` (녹음 재생 옵션) | admin `RecordingPlayer` 와 중복 |
| SMS 발송/미리보기 | 사용자 명시 제외 |
| 민원접수 / 클레임 | 사용자 명시 제외 |
| 시스템 운영액션 / 정산 | 사용자 명시 제외 |
| AI 상담원 시간대 설정 | 사용자 명시 제외 |
| `상담원릴리즈복사.bat` 수동 배포 스크립트 | `UpdateClient` 자동 업데이트로 대체 |

---

## 5. 다음 액션 제안

이 비교표를 기준으로 PR 분할을 잡으려면, 위 § 3 의 **P0 5 개 항목** 중 어느 묶음을 다음 PR 으로 가져갈지가 정책 결정.

권장 묶음:

- **PR-D1**: 통화 중 정보 패널 + 메모 (1번)
- **PR-D2**: 자동 응답 타이머 + 상태 사유 입력 (2번 + 4번) — UI 가벼움
- **PR-D3**: 호 전환 핫키 (3번) — 환경설정 핫키 탭과 같이
- **PR-D4**: 통화 기록 탭 분리 + 즉시 콜백 (5번)

각 PR 은 server-side 변경 최소 (대부분 endpoint 가 이미 존재). 데스크톱 UI + IPC + 환경설정 store 만 손보면 머지 가능 범위.
