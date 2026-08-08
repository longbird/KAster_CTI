# Agent Desktop Live Test Runbook

- Date: 2026-04-23
- Scope: 실환경에서 `apps/server` 와 `apps/desktop` 을 함께 띄워 빠르게 통합 검증하는 운영자용 런북
- Audience: 운영사 개발/QA/현장 검증 담당자
- Related: [agent-desktop-server-integration-checklist.md](/D:/Work/AI_Projects/KAster_CTI/docs/plans/agent-desktop-server-integration-checklist.md)
- Evidence template: [desktop-live-test-template.md](/D:/Work/AI_Projects/KAster_CTI/docs/qa/desktop-live-test-template.md)
- Update artifact helper: [desktop-update-artifact-prepare.ps1](/D:/Work/AI_Projects/KAster_CTI/scripts/desktop-update-artifact-prepare.ps1)

## Purpose

이 문서는 긴 체크리스트를 바로 실행 가능한 순서로 압축한 버전이다.

목표는 아래 5개 축을 짧은 시간 안에 확인하는 것이다.

- 로그인과 세션 복구
- CTI 제어
- softphone 등록과 착신 처리
- update hub
- 장애 복구와 트레이 동작

## Recommended Session Length

- 자동 검증: 10분
- 실환경 검증 1회차: 30~60분

## Preconditions

- [ ] Postgres / Redis 실행
- [ ] `apps/server/.env` 준비
- [ ] 서버 migrate / seed 완료
- [ ] desktop 의존성 설치 완료
- [ ] 테스트용 supervisor 계정 / agent 계정 준비
- [ ] softphone 검증 시 Asterisk WSS endpoint 준비
- [ ] update hub 검증용 테스트 artifact 준비

## Step 0: Automated Baseline

실환경 전에 이것부터 통과시킨다.

### Server

```powershell
cd D:\Work\AI_Projects\KAster_CTI\apps\server
npm test
npm run build
```

### Desktop

```powershell
cd D:\Work\AI_Projects\KAster_CTI\apps\desktop
npm test
npm run build
```

현재 기준 기대 결과:

- server Jest 전체 통과
- desktop Vitest 전체 통과

## Step 1: Start the Server

```powershell
cd D:\Work\AI_Projects\KAster_CTI\apps\server
npm run start:dev
```

Check:

- Swagger: `http://localhost:3000/docs`
- health / auth / calls / agent-updates route 접근 가능

## Step 2: Start the Desktop App

개발 모드:

```powershell
cd D:\Work\AI_Projects\KAster_CTI\apps\desktop
npm run dev
```

패키징 빌드 확인만 필요하면:

```powershell
cd D:\Work\AI_Projects\KAster_CTI\apps\desktop
npm run dist:win
```

## Step 3: Pairing Flow

### Actions

1. 웹 또는 API로 handoff token 발급
2. desktop Pairing 화면에 center URL 입력
3. handoff token 입력 후 연결

### Pass Criteria

- shell 화면으로 전환
- agent 정보 표시
- runtime 상태가 `connected`
- event log 에 세션 복구 또는 초기 연결 로그 확인

### Watch For

- softphone credential 이 renderer 에 노출되지 않는지
- 앱 재기동 후 재로그인 없이 복구되는지

## Step 4: CTI Call Control

### Actions

1. 외부 발신
2. ringing -> talking 상태 확인
3. mute
4. hold
5. resume
6. hangup
7. 가능하면 pickup / blind transfer / attended transfer 수행

### Pass Criteria

- command ack 가 event log 에 남음
- correlationId / requestedAt 반영
- active call 상태가 서버와 동일하게 보임
- hold / resume 후 UI stuck 없음

## Step 5: Softphone Live Check

### Actions

1. SIP 등록 상태 확인
2. inbound call 유도
3. ringing 중 벨소리 / Windows 알림 / window focus 확인
4. accept
5. remote audio 확인
6. 다시 inbound -> reject

### Pass Criteria

- readiness 가 `ready` 또는 최소 `degraded`
- diagnostic panel 에 blocking error 없음
- accept 시 remote audio attach
- reject / hangup 시 ringtone 정지

## Step 6: Audio Devices

### Actions

1. input device 선택
2. output device 선택
3. ring device 선택
4. permission request
5. speaker test
6. ringtone test
7. 앱 재시작 후 설정 유지 확인

### Pass Criteria

- 선택한 장치가 저장됨
- speaker / ringtone preview 동작
- getUserMedia / setSinkId 경로 오류 없음

## Step 7: Update Hub Quick Check

테스트 artifact 준비:

```powershell
D:\Work\AI_Projects\KAster_CTI\scripts\desktop-update-artifact-prepare.ps1 `
  -ArtifactPath "D:\path\to\KAster-Desktop-Setup.exe" `
  -Version "0.1.0-test.1" `
  -Channel "stable"
```

### Actions

1. 로그인 후 update session 발급
2. manifest 조회
3. download-init 호출
4. artifact 다운로드
5. prepared update 상태 확인
6. idle 상태에서 apply 시도

### Pass Criteria

- manifest 에 승인 버전만 보임
- download token 없이는 artifact 접근 불가
- SHA-256 검증 통과
- talking / softphone active / reconnect 중에는 install 차단

## Step 8: Resilience Check

### Actions

1. runtime 연결 끊김 유도
2. 자동 reconnect 확인
3. 수동 reconnect 버튼 확인
4. 앱 최소화
5. 일반 닫기
6. tray 에서 복귀

### Pass Criteria

- disconnect 동안 CTI 버튼 비활성화
- reconnect 후 상태 복구
- close 가 terminate 가 아니라 hide
- tray 복귀 정상

## Step 9: Session Revocation Check

### Actions

1. desktop 로그인 상태 유지
2. 웹 또는 API 에서 `logout-all` 실행
3. desktop 에서 보호된 경로 재호출 또는 refresh 유도

### Pass Criteria

- 기존 desktop session 무효화
- 재로그인 요구
- 이전 sid 기반 handoff 재사용 불가

## Failure Logging Template

아래 8개만 남기면 충분하다.

- Scenario ID
- 앱 버전
- 서버 버전
- 계정 / tenant / center
- 재현 절차
- 기대 결과
- 실제 결과
- 첨부 로그 또는 스크린샷 경로

## Minimum Exit Gate

아래가 모두 참이면 이번 회차는 통과로 본다.

- [ ] pairing 성공
- [ ] originate/mute/hold/resume/hangup 성공
- [ ] softphone register + incoming accept/reject 성공
- [ ] audio device 저장과 preview 성공
- [ ] update manifest/download/prepare 성공
- [ ] reconnect / tray 동작 성공
- [ ] logout-all revocation 성공

## Not In Scope

- 코드서명
- 정식 운영 배포 승인
- 공인 Trusted Signing / EV
