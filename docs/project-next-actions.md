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
- 다음 선행 작업: 운영 신규 DB 기준 migration chain 보정 후 같은 리허설 재실행.

- `scripts/deploy-prod.sh`를 site template 기준으로 dry-run 또는 staging 사이트에 적용한다.
- 운영 `.env`, DB URL, Redis, PBX 서버 접속값, CORS, WebSocket URL을 실제 값 기준으로 검증한다.
- `GET /health/live`, `GET /health/ready`, Swagger, 관리자 앱, 상담원 앱 접근을 확인한다.
- 배포 로그와 실패 시 rollback 절차를 `docs/design/production-deployment-standard.md`에 보강한다.

완료 기준:

- 서버, 관리자 앱, 상담원 앱이 운영형 설정으로 기동된다.
- DB migration 적용 전/후 절차가 문서와 실제 로그로 확인된다.

### 1.2 PBX 설정 반영 end-to-end 검증

- 관리자 앱에서 지사, DID, 큐, 상담원, 착신전환, 멘트, 수신거부 설정을 생성한다.
- `GET /api/v1/asterisk-config/dry-run`으로 preview, diff, validation 결과를 확인한다.
- 운영 PBX 서버에 반영 후 reload 결과와 설정 파일 변화를 확인한다.
- `scripts/pbx-config-preflight-smoke.ps1`와 pbx-loadgen smoke 템플릿을 같은 site 값으로 실행한다.

완료 기준:

- 잘못된 설정은 반영 전에 차단된다.
- 정상 설정은 반영 후 실제 DID 인입 또는 smoke call로 확인된다.

### 1.3 데스크톱 상담원 PC 실환경 검증

- 실제 Windows 상담원 PC에서 pairing, SIP 등록, 수신, 발신, 종료를 검증한다.
- 마이크, 스피커, 벨소리 장치 선택과 재시작 후 유지 여부를 확인한다.
- 웹 앱과 데스크톱 앱을 동시에 열고 같은 통화 상태가 표시되는지 확인한다.
- 통화 중 앱 재시작, 네트워크 단절, CTI 서버 재시작 시나리오를 기록한다.

완료 기준:

- `docs/qa/desktop-live-test-template.md`에 실기기 증적이 채워진다.
- 기본 상담원 업무 흐름이 실제 PC에서 통과한다.

## 2. 테스트 앱 품질 게이트 운영화

목표: 배포 전/후 동일한 smoke/regression 세트를 실행하고, 결과를 사람이 판단 가능한 리포트로 남긴다.

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

### 4.1 통화내역/미연결 콜 기준 정리

- 통화내역과 미연결 콜의 필터 기준을 분리한다.
- 조회 권한과 export 권한을 분리 유지한다.
- 날짜, 지사, 큐, 상담원, 상태 필터의 기본값을 정한다.

완료 기준:

- 운영자가 원하는 리포트 범위와 API 조건이 일치한다.

### 4.2 IVR 실패 리포트

- timeout, 잘못된 입력, fallback, 수신거부 등록 실패를 저장/조회할 기준을 정한다.
- 특정 통화에서 고객이 어떤 IVR 경로를 탔는지 확인할 수 있게 한다.
- IVR 실패 원인을 큐/멘트/DTMF/문자 발송 문제로 분류한다.

완료 기준:

- IVR 실패 원인을 운영자가 리포트에서 조회할 수 있다.

### 4.3 녹취/다운로드 감사

- 녹취 재생과 다운로드 권한을 분리 유지한다.
- 다운로드 감사 로그 필요 여부를 결정한다.
- 개인정보 마스킹과 장기 보관 정책을 운영 문서에 추가한다.

완료 기준:

- 녹취 반출 이력과 권한 기준이 운영 정책으로 정리된다.

## 5. P2-3 운영 모니터링과 알림

목표: 장애 전조와 현재 장애 위치를 관리자 화면에서 확인한다.

### 5.1 모니터링 지표 확정

- PBX 연결 상태, DB, Redis, outbox backlog, recovery count, WebSocket 연결 수를 지표로 확정한다.
- 지표별 정상/주의/장애 기준을 정한다.
- health endpoint와 관리자 monitoring 화면의 역할을 분리한다.

완료 기준:

- 운영자가 확인해야 할 지표와 임계값이 문서화된다.

### 5.2 관리자 모니터링 화면 보강

- 현재 상태, 최근 장애, 최근 복구, outbox backlog를 한 화면에 표시한다.
- polling 보정과 WebSocket 이벤트 기반 갱신을 함께 사용한다.
- 장애 상태가 오래 남을 때 마지막 갱신 시각을 표시한다.

완료 기준:

- 운영자가 장애 위치를 관리자 화면에서 1차 판단할 수 있다.

### 5.3 알림 기준 정리

- 알림 채널을 결정한다.
- PBX 연결 끊김, Redis 장애, outbox backlog 증가, 세션 복구 급증 기준을 정한다.
- 알림 중복 방지와 복구 알림 기준을 정한다.

완료 기준:

- 장애 발생/복구 알림이 운영 기준으로 정리된다.

## 6. 권장 실행 순서

1. 운영 서버 배포 리허설
2. PBX 설정 반영 end-to-end 검증
3. 데스크톱 상담원 PC 실환경 검증
4. 테스트 앱 품질 게이트 운영화
5. 공지사항 상담원 앱 연결
6. 리포트 고도화
7. 운영 모니터링과 알림

## 7. 바로 착수할 첫 작업

가장 먼저 진행할 작업은 `1.1 운영 서버 배포 리허설`이다.

이유:

- P0/P1의 로컬 검증은 완료됐지만 실제 운영 테스트 가능 여부는 운영형 설정에서 확인해야 한다.
- PBX 설정 반영, 테스트 앱 smoke, 데스크톱 실기기 검증이 모두 운영 서버 URL과 site 설정에 의존한다.
- 배포/DB/Redis/PBX 연결 상태가 먼저 확인되어야 이후 테스트 결과를 신뢰할 수 있다.

첫 작업 산출물:

- 운영 서버 배포 리허설 로그
- site별 환경값 확인표
- health/API/WebSocket 접속 결과
- DB migration 적용 여부 기록
- 실패 시 보정 항목 목록
