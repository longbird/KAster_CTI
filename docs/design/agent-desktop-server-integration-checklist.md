# Agent Desktop Server Integration Checklist

- Date: 2026-04-23
- Scope: `apps/desktop` 와 `apps/server` 사이의 실제 통합 검증
- Status: Draft
- Note: 코드서명은 이번 체크리스트 범위에서 제외한다. 정식 운영 직전 별도 점검으로 진행한다.

## Goal

KAster Agent 데스크톱 앱과 CTI 서버가 다음 범위를 실제로 닫는지 검증한다.

- handoff 기반 데스크톱 로그인
- desktop session / refresh / logout-all 세션 통제
- softphone 설정 전달과 SIP 등록
- CTI REST + realtime 이벤트 기반 호제어
- update hub 인증/다운로드/report 흐름
- 장애 복구와 운영성 동작

## Systems Under Test

### Server

- [apps/server](/D:/Work/AI_Projects/KAster_CTI/apps/server)
- 관련 자동화 테스트:
  - [auth-handoff.integration.spec.ts](/D:/Work/AI_Projects/KAster_CTI/apps/server/test/auth-handoff.integration.spec.ts)
  - [auth-desktop-session.integration.spec.ts](/D:/Work/AI_Projects/KAster_CTI/apps/server/test/auth-desktop-session.integration.spec.ts)
  - [auth-softphone-config.integration.spec.ts](/D:/Work/AI_Projects/KAster_CTI/apps/server/test/auth-softphone-config.integration.spec.ts)
  - [agent-updates.controller.spec.ts](/D:/Work/AI_Projects/KAster_CTI/apps/server/test/agent-updates.controller.spec.ts)
  - [agent-updates.service.spec.ts](/D:/Work/AI_Projects/KAster_CTI/apps/server/test/agent-updates.service.spec.ts)

### Desktop

- [apps/desktop](/D:/Work/AI_Projects/KAster_CTI/apps/desktop)
- 관련 런타임:
  - [auth-client.ts](/D:/Work/AI_Projects/KAster_CTI/apps/desktop/src/main/auth-client.ts)
  - [cti-runtime.ts](/D:/Work/AI_Projects/KAster_CTI/apps/desktop/src/main/cti-runtime.ts)
  - [update-client.ts](/D:/Work/AI_Projects/KAster_CTI/apps/desktop/src/main/update-client.ts)
  - [useDesktopStore.ts](/D:/Work/AI_Projects/KAster_CTI/apps/desktop/src/renderer/src/store/useDesktopStore.ts)
  - [softphone-runtime.ts](/D:/Work/AI_Projects/KAster_CTI/apps/desktop/src/renderer/src/softphone/softphone-runtime.ts)
  - [sip-softphone-client.ts](/D:/Work/AI_Projects/KAster_CTI/apps/desktop/src/renderer/src/softphone/sip-softphone-client.ts)

## Environment Prerequisites

- [ ] Postgres / Redis 실행
- [ ] `apps/server/.env` 준비
- [ ] `apps/server` prisma migrate / generate 완료
- [ ] `apps/server` seed 또는 테스트용 supervisor / agent 계정 준비
- [ ] `apps/desktop` 의존성 설치 완료
- [ ] 콜센터 서버 URL 과 desktop handoff URL 확인
- [ ] softphone 실환경 검증 시 Asterisk WSS / WebRTC endpoint 준비
- [ ] update hub 검증 시 테스트용 desktop release row 와 artifact 파일 준비

## Baseline Automated Checks

실환경 수동 테스트 전에 아래 자동 검증이 모두 통과해야 한다.

### Server

- [ ] `npm test -- --runTestsByPath test/auth-handoff.integration.spec.ts`
- [ ] `npm test -- --runTestsByPath test/auth-desktop-session.integration.spec.ts`
- [ ] `npm test -- --runTestsByPath test/auth-softphone-config.integration.spec.ts`
- [ ] `npm test -- --runTestsByPath test/agent-updates.service.spec.ts`
- [ ] `npm test -- --runTestsByPath test/agent-updates.controller.spec.ts`
- [ ] `npm run build`

### Desktop

- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run dist:win`

## Phase 1: Desktop Pairing and Session Control

### Objective

브라우저 handoff 에서 데스크톱 세션까지 인증 흐름이 실제로 닫히는지 확인한다.

### Scenarios

#### P1-1 Handoff exchange success

- [ ] 웹에서 handoff token 발급
- [ ] 데스크톱 Pairing 화면에 center URL + handoff token 입력
- [ ] 데스크톱이 access / refresh / desktop session hydrate 완료
- [ ] softphone config 가 desktop session 에 포함되는지 확인

Expected:

- Pairing 화면이 softphone shell 로 전환
- main process token vault 에 세션 저장
- renderer 에 장기 토큰이 직접 노출되지 않음

#### P1-2 Refresh on app restart

- [ ] 로그인 후 앱 종료
- [ ] 앱 재실행
- [ ] 저장된 세션 기반 bootstrap 수행
- [ ] refresh success 또는 fallback access session 으로 복구

Expected:

- handoff 재입력 없이 runtime 복구
- event log 에 refresh 여부 기록

#### P1-3 Logout-all revokes desktop session

- [ ] 웹 또는 API 에서 `logout-all` 실행
- [ ] 데스크톱에서 refresh 또는 protected API 호출 발생

Expected:

- 데스크톱 세션 무효화
- 재로그인 요구
- 이전 desktop session 으로 softphone/control 재사용 불가

## Phase 2: CTI Runtime and Call Control

### Objective

데스크톱이 서버의 CTI command ack / realtime 흐름과 맞게 동작하는지 확인한다.

### Scenarios

#### P2-1 Runtime connect and realtime sync

- [ ] 데스크톱 runtime 연결
- [ ] agent status / active call / event timeline 초기값 확인
- [ ] 서버 측 상태 변경 이벤트가 renderer 에 반영되는지 확인

Expected:

- runtime connection 상태가 `connected`
- UI 현재 상태와 서버 상태 불일치 없음

#### P2-2 Originate and hangup

- [ ] 데스크톱에서 외부 발신
- [ ] command ack 수신 확인
- [ ] ringing / talking / ended 이벤트 반영 확인
- [ ] hangup 실행

Expected:

- correlationId / requestedAt 이 이벤트 로그에 남음
- call lifecycle 이 UI 와 server session 에 동일하게 반영

#### P2-3 Mute / hold / resume

- [ ] talking 상태에서 mute
- [ ] hold
- [ ] resume

Expected:

- UI 상태 토글 정상
- server command path 가 모두 ack 반환
- talking 중 update install 이 차단되는 상태도 같이 유지

#### P2-4 Pickup / blind transfer / attended transfer

- [ ] ringing call 에서 pickup
- [ ] blind transfer 수행
- [ ] attended transfer consult / complete / cancel 수행

Expected:

- 각 단계별 상태 전이가 이벤트 로그에 남음
- transfer 관련 UI 가 stuck 되지 않음

## Phase 3: Softphone Registration and Media

### Objective

SIP 등록, incoming call 처리, 장치 선택, remote audio attach 까지 실제 softphone 경로를 검증한다.

### Scenarios

#### P3-1 SIP registration success

- [ ] desktop session 에서 softphone config hydrate
- [ ] SIP 등록 시도
- [ ] registered 상태 확인

Expected:

- readiness 가 `ready` 또는 최소 `degraded` 이상
- 최근 진단 목록에 blocking error 없음

#### P3-2 Incoming call accept / reject

- [ ] softphone incoming INVITE 유도
- [ ] ringing 상태 확인
- [ ] 벨소리 / Windows 알림 / window focus 확인
- [ ] accept
- [ ] 종료 후 다시 incoming -> reject

Expected:

- ringing 에서 알림 1회만 표시
- accept 시 remote audio attach
- reject / hangup 시 ringtone 정지

#### P3-3 Audio device selection

- [ ] 마이크 선택
- [ ] speaker / ring device 선택
- [ ] permission request
- [ ] speaker / ringtone test 실행

Expected:

- 설정이 앱 재시작 후 유지
- 선택한 입력 장치로 getUserMedia 제약 적용
- 출력 장치 setSinkId 가 가능한 환경에서 반영

#### P3-4 Registration failure diagnostics

- [ ] 잘못된 SIP URI 또는 WSS 주소 주입
- [ ] 등록 실패 재현

Expected:

- diagnostic code 표시
- readiness 가 `blocked` 또는 `degraded` 로 전환
- 권장 조치 문구 확인 가능

## Phase 4: Update Hub End-to-End

### Objective

update session 부터 manifest / artifact / report 까지 실제 콜센터 서버 update hub 흐름을 검증한다.

### Scenarios

#### P4-1 Update session and manifest

- [ ] 일반 CTI access token 으로 update session 발급
- [ ] update session token 으로 manifest 조회

Expected:

- tenant/channel/currentVersion 기준으로 승인 릴리스만 반환
- mandatory / minimumRequiredVersion / serverCompatibility 필드 확인

#### P4-2 Download-init and artifact download

- [ ] artifactId 로 download-init 호출
- [ ] download token 으로 artifact 다운로드
- [ ] SHA-256 검증

Expected:

- download token 없이 artifact 접근 차단
- token artifactId mismatch 시 차단
- desktop main process 에서 검증 후 prepared 상태 전환

#### P4-3 Report audit logging

- [ ] `download_started`
- [ ] `download_completed`
- [ ] `install_scheduled`
- [ ] `install_completed` 또는 `install_failed`

Expected:

- server audit log row 저장
- tenant / agent / device / version / artifact 정보 확인 가능

#### P4-4 Install gating

- [ ] CTI 통화 중 install 시도
- [ ] softphone active call 중 install 시도
- [ ] runtime reconnect 중 install 시도
- [ ] idle 상태에서 install 시도

Expected:

- unsafe 상태에서는 install 차단
- idle 상태에서만 실행 허용

## Phase 5: Resilience and Operations

### Objective

네트워크 단절, 백그라운드 대기, 앱 재시작, 운영 오류 시나리오를 검증한다.

### Scenarios

#### P5-1 Runtime disconnect and reconnect

- [ ] socket disconnect 유도
- [ ] 자동 reconnect 확인
- [ ] 수동 reconnect 버튼 확인

Expected:

- 연결 끊김 동안 CTI 제어 버튼 비활성화
- reconnect 후 상태 복구

#### P5-2 Tray background behavior

- [ ] 최소화
- [ ] 일반 닫기
- [ ] tray 복귀

Expected:

- 앱 종료 대신 hide
- tray icon 으로 창 복귀 가능
- background 상태에서도 incoming attention 동작 유지

#### P5-3 Update and restart safety

- [ ] update 준비 완료 상태에서 앱 재시작
- [ ] prepared update 상태 재확인
- [ ] 설치 실행 후 후속 동작 확인

Expected:

- 다운로드된 artifact 경로 관리 정상
- 실패 시 로그 확인 가능

## Defect Recording Format

각 실패 항목은 아래 형식으로 남긴다.

- Scenario ID
- Build version
- Server version
- Tenant / center
- Repro steps
- Expected
- Actual
- Logs / screenshots / event timeline
- Severity

## Exit Criteria

정식 운영 전 통합 테스트 완료로 보기 위한 최소 기준:

- [ ] Phase 1 통과
- [ ] Phase 2 통과
- [ ] Phase 3 에서 registration / incoming / audio device / diagnostics 통과
- [ ] Phase 4 에서 update hub 전체 흐름 통과
- [ ] Phase 5 에서 reconnect / tray / update safety 통과
- [ ] open blocker 0건
- [ ] high severity issue 0건

## Deferred From This Checklist

- 내부 CA 기반 코드서명 실행 검증
- 정식 운영 배포 승인 절차
- 공인 Trusted Signing / EV 확장
