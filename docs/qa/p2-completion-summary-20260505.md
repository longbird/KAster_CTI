# P2 완료 산출물 요약

작성일: 2026-05-05
기준 환경: 기본 개발 서버 `kaster-server`, 리허설 site `rehearsal-20260501`

## 1. 완료 기준

P2의 완료 기준은 운영자가 실제 장애와 업무 품질을 확인할 수 있는 최소 화면/API를 갖추고, 실행 가능한 범위에서 개발 서버 또는 리허설 서버 검증 증적을 남기는 것이다.

현 시점에서 코드로 진행 가능한 P2 범위는 완료했다. 실제 Windows 상담원 PC, 헤드셋, 현장 네트워크에서만 확인 가능한 항목은 P3 현장 검증 범위로 넘긴다.

## 2. P2 산출물

### P2-1 공지사항 상담원 앱 연결

- 상담원 권한으로 조회 가능한 `GET /api/v1/announcements` API를 추가했다.
- 상담원 웹 앱 Full/Mini 화면에 공지 패널을 연결했다.
- 고정 공지는 상단 우선 표시하고, 공지가 없으면 업무 화면에서 숨긴다.
- 기본 개발 서버에 server/web 컨테이너를 재빌드 배포했고, 상담원 토큰으로 API 응답을 확인했다.
- 증적: `docs/qa/announcements-agent-web-20260505.md`

### P2-2 리포트 고도화

- `GET /api/v1/calls/history`에 결과코드, 큐명, 포기 여부, 녹취 여부 필터와 `missedReason` 계산 필드를 추가했다.
- 관리자 통화내역/미연결 콜 화면에 운영 필터와 미연결 원인/결과코드 컬럼을 추가했다.
- `GET /api/v1/admin/reports/ivr-failures` API와 관리자 IVR 실패 리포트 화면을 추가했다.
- IVR 실패 조회는 `rawAmiEvents`의 Smart ARS `UserEvent`를 1차 원천으로 사용한다.
- 녹취 다운로드 성공 시에만 `callRecordingAccessAuditLogs`에 감사 로그를 저장하도록 구현했다.
- `GET /api/v1/admin/reports/recording-download-audits` API와 관리자 녹취 목록의 `다운로드 감사` 탭을 추가했다.
- 감사 조회 응답과 화면에서는 고객번호, DID, IP를 마스킹한다.
- 증적:
  - `docs/qa/reports-p2-gap-analysis-20260505.md`
  - `docs/qa/ivr-failure-report-source-analysis-20260505.md`
  - `docs/qa/recording-download-audit-20260505.md`

### P2-3 운영 모니터링과 알림

- `GET /api/v1/admin/monitoring/operations` API를 추가했다.
- 관리자 `시스템 모니터링` 화면에 outbox backlog, RECOVERY_TIMEOUT, WebSocket client 수, 운영 알림 배열을 표시한다.
- 관리자 화면은 10초 polling으로 운영 지표를 갱신한다.
- 1차 알림은 관리자 화면 경고 배너로 제공한다.
- 외부 알림 채널 연동은 운영 채널 확정이 필요하므로 P3 범위로 넘긴다.
- 증적: `docs/qa/operational-monitoring-p2-20260505.md`

## 3. 운영 검증 증적

### 리허설 PBX/CTI gate

- `scripts/pbx-smoke-run-gate.ps1`로 validate, dry-run, SIP run, WebSocket capture, CTI DB/AMI/log 수집을 한 번에 실행할 수 있다.
- 최신 config apply gate 증적은 `Final verdict: PASS`다.
- 증적:
  - `docs/qa/pbx-smoke-report-rehearsal-20260501-config-apply-gate-20260505-081519.md`
  - `docs/qa/pbx-smoke-report-rehearsal-20260501-config-apply-gate-classified-20260505.md`

### 기본 개발 서버 상태

- 기본 개발 서버 `kaster-server`는 `/etc/asterisk`와 `/var/lib/asterisk/sounds/custom` 마운트 없이 재기동했다.
- 컨테이너 mount 목록은 `[]`로 확인했다.
- PBX 설정 owner는 `rehearsal-20260501` 상태를 유지한다.
- health는 `db/redis/ami: up/connected`로 확인했다.

### 데스크톱 baseline

- `apps/desktop` 테스트 30개 파일, 123개 테스트를 통과했다.
- 데스크톱 프로덕션 빌드, unpacked package, process smoke, NSIS/portable 패키징을 통과했다.
- 서버-데스크톱 계약 테스트 5개 suite, 21개 테스트와 서버 빌드를 통과했다.
- 증적: `docs/qa/desktop-live-test-rehearsal-20260505.md`

## 4. 마지막 검증 결과

- 서버 테스트: 4개 suite, 37개 test 통과
  - `test/admin-permissions.integration.spec.ts`
  - `test/calls-service.integration.spec.ts`
  - `test/announcements.controller.spec.ts`
  - `test/auth-softphone-config.integration.spec.ts`
- 서버 빌드: `npm run build` 통과
- 관리자 앱 빌드: `npm run build` 통과
- 관리자 앱 빌드는 Vite chunk size warning이 있었지만 빌드 실패는 아니다.

## 5. P2 잔여 제한

- 실제 Windows 상담원 PC, 헤드셋, 현장 네트워크 기반 SIP 등록/인입/발신/오디오/복구 테스트는 아직 현장 단계가 필요하다.
- 외부 알림 채널은 아직 확정되지 않았다. Slack, 이메일, SMS 등 채널 선택과 credential 확보 후 P3에서 구현한다.
- 운영 배포는 기본 개발 서버와 리허설 site 검증 기준으로 정리되어 있으며, 최종 운영 site 값과 rollback 기준은 P3에서 잠근다.

## 6. P2 종료 판정

P2는 완료로 판정한다.

다음 단계는 P3-1 운영 배포/릴리즈 안정화다. P3에서는 실제 운영 site 값, 외부 알림 채널, 실 상담원 PC 검증을 기준으로 운영 전환 게이트를 확정한다.
