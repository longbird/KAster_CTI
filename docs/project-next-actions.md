# KAster CTI 다음 진행 할일 목록

작성일: 2026-05-01
기준 문서: `docs/project-integrated-plan.md`, `docs/project-next-tasks.md`
현재 기준: P0/P1 구현 산출물은 로컬 검증 완료, 실제 운영 서버/실기기 검증은 별도 진행 필요

## 우선순위 기준

다음 작업은 새 기능 확장보다 실제 서비스 운영 가능 여부를 확인하고, 운영 중 장애를 줄이는 순서로 배치한다.

1. 실제 운영 서버와 실제 상담원 PC에서만 확인 가능한 항목
2. 운영 반영 전 반드시 필요한 품질 게이트
3. 운영자가 장애 원인을 추적하기 위한 리포트와 모니터링
4. 상담원 업무 효율을 높이는 후속 기능

## 1. 운영 실환경 검증 게이트

목표: 지금까지 구현한 P0/P1 산출물이 실제 운영 서버, PBX 서버, 상담원 PC에서 동작하는지 확인한다.

### 1.1 운영 서버 배포 리허설

현재 리허설 결과:

- 2026-05-01 원격 운영 서버에서 별도 rehearsal site로 compose config, server/web/admin image build까지 통과했다.
- 신규 DB `prisma migrate deploy`가 `20260414_ops_followup`의 `rawAmiEvents` 식별자 불일치로 실패했다.
- 상세 증적: `docs/qa/deploy-20260501-rehearsal.md`
- 2026-05-03 migration chain 보정 후 같은 rehearsal site에서 29개 migration 전체 적용, stack 기동, gateway health check까지 통과했다.
- 2026-05-04 단계별 실체 테스트에서 Swagger, 관리자/상담원 앱 routing, WebSocket handshake, supervisor 로그인, PBX 설정 dry-run/preview, Agent SIP 조회까지 통과했다.
- 2026-05-04 Asterisk mount 보정 후 서버 컨테이너에서 `/etc/asterisk`와 `/var/lib/asterisk/sounds/custom` rw bind mount, 설정 파일 생성까지 확인했다.
- 2026-05-04 AMI 세션 보정 후 앱 AMI login 유지, reload 명령 전송, 75초 후 `ami: connected` health 유지까지 확인했다.
- 2026-05-04 dry-run validation false positive를 보정해 리허설 `/api/v1/asterisk-config/dry-run`에서 `validation.ok: true`를 확인했다.
- 2026-05-04 테스트 trunk/DID를 생성한 뒤 pbx-loadgen 1건으로 SIP 인입, AMI 이벤트 수신, CTI `callSessions` 생성까지 확인했다.
- 2026-05-04 테스트 상담원 `3999`, 테스트 큐 `smoke-3999`, 임시 Node SIP UAS로 pbx-loadgen 단건 연결 성공을 확인했다.
- 2026-05-04 실제 AMI 이벤트 흐름에 맞춰 `SessionEngineService`를 보정했고, 리허설 DB에서 `queueName=smoke-3999`, `primaryAgentId=3999`, `answeredAt`, `endedAt`, `talkSeconds=64` 기록을 확인했다.
- 2026-05-04 `tools/pbx-loadgen/test-templates/sites/rehearsal-20260501-smoke.yaml`로 리허설 site smoke 값을 분리했고, validate를 통과했다.
- 2026-05-04 `scripts/pbx-smoke-collect-evidence.ps1`로 pbx-loadgen JSON/CSV, 원격 health, DB `callSessions`, `rawAmiEvents`, 서버 로그 패턴을 Markdown 리포트로 자동 수집했다.
- 2026-05-04 smoke 수집 스크립트에 자동 PASS/FAIL 판정과 `-FailOnFailedVerdict` 게이트 옵션을 추가했고, 리허설 증적으로 `Final verdict: PASS`를 확인했다.
- 2026-05-04 `scripts/pbx-smoke-capture-ws.ps1`로 Socket.IO `/ws` 이벤트를 캡처하고, smoke 리포트에 `call.created`, `call.updated`, `call.ended` 관측 결과를 연결했다.
- 2026-05-04 `scripts/pbx-smoke-run-gate.ps1`로 validate, dry-run, pbx-loadgen run, WebSocket capture, CTI evidence collection을 one-command gate로 묶었고, DID lifecycle + WS smoke 기준 `Final verdict: PASS`를 확인했다.
- 2026-05-04 queue + agent + WS gate 확장을 진행해 server 컨테이너 내부 테스트 SIP UAS, 빠른 `AgentConnect` 흐름의 ANI/DNIS 보강, PJSIP `remove_existing=yes` 렌더링을 추가했다.
- 2026-05-05 queue + agent + WS one-command gate를 반복 실행 가능한 상태로 보정했고, `docs/qa/pbx-smoke-report-rehearsal-20260501-queue-ws-gate-20260505-001330.md`에서 `Final verdict: PASS`를 확인했다.
- 2026-05-05 `/etc/asterisk` 공유 마운트 충돌 원인을 확인해 설정 소유자 마커와 배포 preflight 차단을 추가했다. 리허설 owner는 `rehearsal-20260501`이며 기존 `kaster-server`는 재덮어쓰기 방지를 위해 정지 상태다.
- 2026-05-05 PBX 설정 dry-run + reload + queue/agent/WS smoke를 연결해 `docs/qa/pbx-smoke-report-rehearsal-20260501-config-apply-gate-20260505-081519.md`에서 `Final verdict: PASS`를 확인했다.
- 2026-05-05 기본 개발 서버 `kaster-server`를 `/etc/asterisk`와 `/var/lib/asterisk/sounds/custom` 마운트 없이 재기동했다. 컨테이너 mount 목록은 `[]`, PBX 설정 owner는 `rehearsal-20260501` 유지, health는 `db/redis/ami: up/connected`로 확인했다.

- `scripts/deploy-prod.sh`를 site template 기준으로 dry-run 또는 staging 사이트에 적용한다.
- 운영 `.env`, DB URL, Redis, PBX 서버 접속값, CORS, WebSocket URL을 실제 값 기준으로 검증한다.
- `GET /health/live`, `GET /health/ready`, Swagger, 관리자 앱, 상담원 앱 접근을 확인한다.
- 배포 로그와 실패 시 rollback 절차를 `docs/design/production-deployment-standard.md`에 보강한다.

완료 기준:

- 서버, 관리자 앱, 상담원 앱이 운영형 설정으로 기동된다.
- DB migration 적용 전/후 절차가 문서와 실제 로그로 확인된다.

### 1.2 PBX 설정 반영 end-to-end 검증

현재 리허설 결과:

- 2026-05-05 `scripts/pbx-config-preflight-smoke.ps1 -ApplyReload`로 리허설 API dry-run과 reload 요청이 통과했다.
- dry-run 결과 `validation.ok: true`, 변경 파일은 `pjsip.conf`, `extensions_agent.conf`, `queues.conf` 범위로 확인됐다.
- reload 직후 `scripts/pbx-smoke-run-gate.ps1`를 queue + agent + WebSocket 조건으로 실행했고, `linkedid=1777936527.71`에 대해 Health, PBX server, CTI server, DB, AMI events, Server logs, WebSocket이 모두 PASS였다.

- AMI 세션은 인증 완료 기준으로 보정됐으므로, reload 직후 PBX 런타임 반영 상태를 확인한다.
- 등록된 상담원 SIP 단말 또는 테스트용 SIP UAS를 준비한다.
- 관리자 앱에서 지사, DID, 큐, 상담원, 착신전환, 멘트, 수신거부 설정을 생성한다.
- `GET /api/v1/asterisk-config/dry-run`으로 preview, diff, validation 결과를 확인한다.
- 운영 PBX 서버에 반영 후 reload 결과와 설정 파일 변화를 확인한다.
- `scripts/pbx-config-preflight-smoke.ps1`와 pbx-loadgen smoke 템플릿을 같은 site 값으로 실행한다.

완료 기준:

- 잘못된 설정은 반영 전에 차단된다.
- 정상 설정은 반영 후 실제 상담원 응답까지 포함한 DID 인입 또는 smoke call로 확인된다.

### 1.3 데스크톱 상담원 PC 실환경 검증

현재 진행 결과:

- 2026-05-05 실 상담원 PC 투입 전 자동 baseline을 재실행했다.
- `apps/desktop` 테스트는 30개 파일, 123개 테스트가 통과했다.
- `apps/desktop` 프로덕션 빌드, unpacked package, process smoke, NSIS/portable 패키징이 통과했다.
- 서버-데스크톱 계약 테스트 5개 suite, 21개 테스트와 서버 빌드가 통과했다.
- 증적: `docs/qa/desktop-live-test-rehearsal-20260505.md`
- 실제 Windows 상담원 PC, 헤드셋, 현장 네트워크에서 SIP 등록/인입/발신/오디오/복구 테스트는 아직 필요하다.

- 실제 Windows 상담원 PC에서 pairing, SIP 등록, 수신, 발신, 종료를 검증한다.
- 마이크, 스피커, 벨소리 장치 선택과 재시작 후 유지 여부를 확인한다.
- 웹 앱과 데스크톱 앱을 동시에 열고 같은 통화 상태가 표시되는지 확인한다.
- 통화 중 앱 재시작, 네트워크 단절, CTI 서버 재시작 시나리오를 기록한다.

완료 기준:

- `docs/qa/desktop-live-test-template.md`에 실기기 증적이 채워진다.
- 기본 상담원 업무 흐름이 실제 PC에서 통과한다.

## 2. 테스트 앱 품질 게이트 운영화

목표: 배포 전/후 동일한 smoke/regression 세트를 실행하고, 결과를 사람이 판단 가능한 리포트로 남긴다.

현재 진행 결과:

- 2026-05-05 리허설 site 값은 `tools/pbx-loadgen/test-templates/sites/rehearsal-20260501-smoke.yaml`로 분리되어 있다.
- 2026-05-05 `scripts/pbx-smoke-run-gate.ps1`가 validate, dry-run, SIP run, WebSocket capture, CTI DB/AMI/log 수집을 한 번에 실행한다.
- 2026-05-05 `scripts/pbx-smoke-collect-evidence.ps1` 리포트에 `Failure Classification` 표를 추가해 PBX server, CTI server, WebSocket, DB, Test input 조사 위치를 바로 표시한다.
- 최신 분류 포함 증적: `docs/qa/pbx-smoke-report-rehearsal-20260501-config-apply-gate-classified-20260505.md`
- 현재 리허설 기준 모든 분류가 PASS이며 최종 판정은 `Final verdict: PASS`다.

### 2.1 site별 테스트 값 분리

- `tools/pbx-loadgen/test-templates/p1-standard-smoke.yaml`을 site별 값 파일로 복사한다.
- DID, caller allowlist, PBX host/port, 큐, 상담원 내선 값을 site별로 분리한다.
- 운영 서버에서 실행 가능한 명령 예시를 `tools/pbx-loadgen/test-templates/README.md`에 추가한다.

완료 기준:

- site 값만 바꿔 smoke/regression을 재사용할 수 있다.

### 2.2 CTI API/WebSocket/DB 결과 연결

- pbx-loadgen 결과와 CTI REST 조회 결과를 같은 run ID로 묶는다.
- `call.created`, `call.updated`, `call.ended`, `queue.summary.updated`, `agent.status.changed` 수신 여부를 기록한다.
- DB `callSessions`, `rawAmiEvents`, `eventOutbox` 상태 확인 절차를 리포트에 포함한다.

완료 기준:

- 통화 성공 여부뿐 아니라 CTI 상태 정합성까지 리포트에 남는다.

### 2.3 실패 분류 리포트

- 실패 원인을 PBX 서버, CTI 서버, WebSocket, DB, 테스트 앱 입력값 중 하나로 분류한다.
- 배포 전 필수 통과 기준을 정의한다.
- 실패 리포트 예시를 `docs/qa/` 아래에 저장한다.

완료 기준:

- 실패 시 다음 조사 위치가 리포트에서 바로 보인다.

## 3. P2-1 공지사항 상담원 앱 연결

목표: 관리자 공지 CRUD를 상담원 업무 화면에 연결한다.

현재 진행 결과:

- 2026-05-05 상담원 권한으로 조회 가능한 `GET /api/v1/announcements` API를 추가했다.
- 2026-05-05 상담원 웹 앱 Full/Mini 화면에 공지 패널을 연결했다. 고정 공지는 상단 우선 표시하고, 빈 목록은 업무 화면에서 숨긴다.
- 2026-05-05 기본 개발 서버에 server/web 컨테이너를 재빌드 배포했고, 상담원 토큰으로 `/announcements` 응답을 확인했다.
- 증적: `docs/qa/announcements-agent-web-20260505.md`

### 3.1 서버 계약 확인

- 공지사항 목록 API의 권한, 응답 envelope, 읽음 상태 필요 여부를 확인한다.
- 긴급 공지와 일반 공지의 노출 기준을 정한다.
- 상담원 앱에서 필요한 최소 필드를 확정한다.

완료 기준:

- 상담원 앱이 소비할 공지 API 계약이 문서화된다.

### 3.2 상담원 웹 앱 표시

- 로그인 후 공지 목록을 조회한다.
- 긴급 공지는 상단에 고정 표시하고, 일반 공지는 업무 흐름을 방해하지 않는 위치에 표시한다.
- 읽음 상태가 필요한 경우 서버 저장 또는 localStorage 기준을 결정한다.

완료 기준:

- 관리자가 등록한 공지가 상담원 웹 앱에 표시된다.

### 3.3 데스크톱 앱 표시 여부 결정

- 데스크톱 앱에도 공지를 표시할지, 웹 앱만 표시할지 운영 기준을 정한다.
- 데스크톱 표시가 필요하면 CTI runtime 이벤트 또는 REST 조회 방식으로 연결한다.

완료 기준:

- 공지 노출 범위가 웹/데스크톱 기준으로 확정된다.

## 4. P2-2 리포트 고도화

목표: 운영자가 장애, 품질, 성과를 같은 기준으로 조회하고 export할 수 있게 한다.

현재 진행 결과:

- 2026-05-05 기존 구현 기준을 확인했다. 통화내역과 미연결 콜은 모두 `GET /api/v1/calls/history`를 사용하며, 미연결은 현재 `mode=missed`일 때 `sessionStatus=ENDED` + `answeredAt=null`로 조회된다.
- 2026-05-05 관리자 통화내역 화면은 날짜, 지사, 전체/미연결 모드와 CSV export를 제공한다.
- 2026-05-05 관리자 미연결 콜 화면은 날짜, 지사, CSV export를 제공하지만 미연결 원인, IVR 실패, 복구 종료, 포기 여부 필터는 아직 분리되지 않았다.
- 2026-05-05 `GET /api/v1/calls/history`에 `resultCode`, `queueName`, `abandon`, `recording` 필터와 `missedReason` 계산 필드를 추가했다.
- 2026-05-05 관리자 통화내역/미연결 콜 화면에 결과코드, 큐명, 포기, 녹취 필터와 미연결 원인/결과코드 컬럼을 추가했다.
- 2026-05-05 기본 개발 서버에 server/admin 컨테이너를 재빌드 배포했고, `/calls/history?mode=missed&abandon=false&recording=false` 응답에서 `missedReason`을 확인했다.
- 기준/gap 문서: `docs/qa/reports-p2-gap-analysis-20260505.md`

### 4.1 통화내역/미연결 콜 기준 정리

- 통화내역과 미연결 콜의 필터 기준을 분리한다. 현재 1차로 결과코드, 큐명, 포기, 녹취 필터와 미연결 원인 컬럼을 반영했다.
- 조회 권한과 export 권한을 분리 유지한다.
- 날짜, 지사, 큐, 상담원, 상태 필터의 기본값을 정한다.

완료 기준:

- 운영자가 원하는 리포트 범위와 API 조건이 일치한다.

### 4.2 IVR 실패 리포트

- timeout, 잘못된 입력, fallback, 수신거부 등록 실패를 저장/조회할 기준을 정한다.
- 특정 통화에서 고객이 어떤 IVR 경로를 탔는지 확인할 수 있게 한다.
- IVR 실패 원인을 큐/멘트/DTMF/문자 발송 문제로 분류한다.
- 2026-05-05 원격 기본 개발 DB에서 Smart ARS `UserEvent` 3,023건을 확인했다. `selection timeout` 2,206건, `result failure` 13건이 있어 `rawAmiEvents` 기반 1차 리포트 구현이 가능하다.
- 2026-05-05 `GET /api/v1/admin/reports/ivr-failures` API를 추가했다. 기존 `reports/logs:view` 권한으로 접근하며 `from`, `to`, `branchId`, `entryDid`, `reason`, `page`, `pageSize`를 지원한다.
- 2026-05-05 기본 개발 서버에 server 컨테이너를 재빌드 배포했고, `reason=INPUT_TIMEOUT` 조회에서 787건과 `callId/sessionStatus` 연결을 확인했다.
- 2026-05-05 관리자 메뉴/라우트 `/reports/ivr-failures`와 `reports/ivr-failures` 권한 키를 추가했다. 화면은 날짜, 지사, DID, 실패 원인 필터와 CSV export를 제공한다.
- 2026-05-05 기본 개발 서버에 server/admin 컨테이너를 재빌드 배포했고, 권한 응답에서 `reports/ivr-failures.canView=true`, 화면 라우트 HTTP 200, API `INPUT_TIMEOUT` 787건을 확인했다.
- 기준 문서: `docs/qa/ivr-failure-report-source-analysis-20260505.md`
- 2026-05-05 녹취 다운로드 감사 로그 테이블 `callRecordingAccessAuditLogs`를 추가하고, 성공 다운로드에만 `DOWNLOAD` 감사 row가 남도록 구현했다.
- 2026-05-05 실제 개발 서버에서 supervisor 로그인, 녹취 목록 조회, 다운로드 API 호출, 감사 row 생성을 검증했다. 검증용 녹취 row와 임시 파일은 정리했고 감사 row 1건은 증거로 남겼다.
- 2026-05-05 `GET /api/v1/admin/reports/recording-download-audits` API와 관리자 `녹취 목록 > 다운로드 감사` 탭을 추가했다. 고객번호/DID/IP는 조회 응답과 화면에서 마스킹한다.
- 2026-05-05 기본 개발 서버에 server/admin 컨테이너를 재빌드 배포했고, 감사 조회 API에서 `callerMasked=010-****-2222`, `dnisMasked=070-****-6380` 응답과 관리자 라우트 HTTP 200을 확인했다.
- 기준 문서: `docs/qa/recording-download-audit-20260505.md`

완료 기준:

- IVR 실패 원인을 운영자가 리포트에서 조회할 수 있다.

### 4.3 녹취/다운로드 감사

- 녹취 재생과 다운로드 권한을 분리 유지한다.
- 다운로드 감사 로그 필요 여부를 결정한다. 1차 기준은 성공한 다운로드만 `DOWNLOAD` 감사 로그로 저장하는 것이다.
- 감사 로그에는 tenant, recordingId, callId, linkedid, agentId, 역할, client IP, user-agent, 성공 여부, 생성 시각을 저장한다.
- 개인정보 마스킹과 장기 보관 정책을 운영 문서에 추가한다. 1차 정책은 조회/API 화면 마스킹, 감사 로그 1년 온라인 보관이다.

완료 기준:

- 녹취 반출 이력과 권한 기준이 운영 정책으로 정리된다.
- 운영자가 관리자 녹취 화면에서 다운로드 감사 이력을 조회할 수 있다.

## 5. P2-3 운영 모니터링과 알림

목표: 장애 전조와 현재 장애 위치를 관리자 화면에서 확인한다.

현재 진행 결과:

- 2026-05-05 `GET /api/v1/admin/monitoring/operations` API를 추가했다. 기존 health 요약에 outbox backlog, RECOVERY_TIMEOUT 최근 1시간, WebSocket client 수, 운영 알림 배열을 더해 반환한다.
- 2026-05-05 관리자 `시스템 모니터링` 화면에 운영 지표 섹션을 추가했다. health와 운영 지표는 10초 polling으로 갱신된다.
- 2026-05-05 eventOutbox backlog는 10건 이상 warning, 100건 이상 critical로 판정한다. RECOVERY_TIMEOUT은 최근 1시간 1건 이상 warning, 10건 이상 critical로 판정한다.
- 2026-05-05 기본 개발 서버에 server/admin 컨테이너를 재빌드 배포했다. `/admin/monitoring/operations` 실제 응답은 `status=ok`, `outbox.pending=0`, `recovery.lastHour=0`, `websocket.clients=0`, `alerts=[]`였다.
- 기준 문서: `docs/qa/operational-monitoring-p2-20260505.md`

### 5.1 모니터링 지표 확정

- PBX 연결 상태, DB, Redis, outbox backlog, recovery count, WebSocket 연결 수를 지표로 확정한다.
- 지표별 정상/주의/장애 기준을 정한다.
- health endpoint와 관리자 monitoring 화면의 역할을 분리한다.

완료 기준:

- 운영자가 확인해야 할 지표와 임계값이 문서화된다.
- 2026-05-05 완료. 지표와 임계값은 `docs/qa/operational-monitoring-p2-20260505.md`에 정리했다.

### 5.2 관리자 모니터링 화면 보강

- 현재 상태, 최근 장애, 최근 복구, outbox backlog를 한 화면에 표시한다.
- polling 보정과 WebSocket 이벤트 기반 갱신을 함께 사용한다.
- 장애 상태가 오래 남을 때 마지막 갱신 시각을 표시한다.

완료 기준:

- 운영자가 장애 위치를 관리자 화면에서 1차 판단할 수 있다.
- 2026-05-05 완료. 관리자 `시스템 모니터링` 화면에서 infra, outbox, recovery, WebSocket, alert를 함께 확인한다.

### 5.3 알림 기준 정리

- 알림 채널을 결정한다.
- PBX 연결 끊김, Redis 장애, outbox backlog 증가, 세션 복구 급증 기준을 정한다.
- 알림 중복 방지와 복구 알림 기준을 정한다.

완료 기준:

- 장애 발생/복구 알림이 운영 기준으로 정리된다.
- 2026-05-05 완료. 1차 알림은 관리자 화면 경고 배너로 제공하며, 외부 채널 연동은 운영 채널 확정 후 P3 범위로 남긴다.

## 6. 권장 실행 순서

1. 운영 서버 배포 리허설
2. PBX 설정 반영 end-to-end 검증
3. 데스크톱 상담원 PC 실환경 검증
4. 테스트 앱 품질 게이트 운영화
5. 공지사항 상담원 앱 연결
6. 리포트 고도화
7. 운영 모니터링과 알림

## 7. 바로 착수할 첫 작업

P2 완료 산출물 정리와 P3 착수 범위 확정은 2026-05-05 완료했다.

- P2 완료 요약: `docs/qa/p2-completion-summary-20260505.md`
- P3 범위 확정: `docs/p3-scope-20260505.md`

가장 먼저 진행할 작업은 P3-1 운영 배포/릴리즈 안정화다.

이유:

- P2에서 코드로 진행 가능한 항목은 완료됐다.
- 운영 서버 재기동, PBX 설정 반영 gate, 테스트 앱 품질 gate, 공지사항 상담원 웹 연결은 현재 실행 가능한 범위에서 검증됐다.
- 리포트 고도화, IVR 실패 리포트, 녹취 다운로드 감사, 운영 모니터링 1차 화면/API도 기본 개발 서버까지 반영됐다.
- 데스크톱 상담원 PC 실환경 검증은 실제 Windows PC, 헤드셋, 현장 네트워크가 필요해 P3 현장 검증 단계로 남는다.
- 외부 알림 채널 연동은 운영 채널 확정이 필요해 P3 범위로 넘긴다.

첫 작업 산출물:

- 운영 site preflight 문서
- 배포 전/후 health, Swagger, 관리자 앱, 상담원 앱, PBX smoke gate 순서 확정
- migration 실패, PBX 설정 owner 충돌, health/smoke 실패 시 중단 기준 확정
- rollback 절차와 담당자 확인 항목 정리
