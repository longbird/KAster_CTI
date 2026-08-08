# KAster CTI 다음 할일 목록

작성일: 2026-04-30
기준 문서: `docs/plans/project-integrated-plan.md`

## 정렬 기준

이 목록은 실제 서비스 운영에 필요한 필수 요소를 먼저 처리하도록 정렬한다.

우선순위 판단 기준은 다음과 같다.

- P0: 운영 전 반드시 맞아야 하는 서버 계약, 통화 상태, PBX 설정 반영, 실환경 통화, 배포/DB 절차
- P1: 운영 효율과 장애 대응에 필요한 관리자 설정, IVR, 멘트, 테스트 표준화
- P2: 운영 품질을 높이는 리포트, 공지, 알림, 배포 고도화

## 0. 작업 착수 전 기준 고정

### 0.1 통합 계획서 기준선 확정

- `docs/plans/project-integrated-plan.md`를 현재 운영 기준 문서로 확정한다.
- PBX 서버, IVR, CTI 서버, 상담원 웹 앱, 관리자 앱, Windows 데스크톱 앱, 테스트 앱의 범위를 다시 섞지 않는다.
- 사용자-facing 문서와 화면 문구에서는 자체 PBX 서버 기준 용어를 유지한다.

완료 기준:

- 다음 작업 문서와 통합 계획서의 영역 구분이 일치한다.
- 운영자에게 공유 가능한 기준 문서가 하나로 정리된다.

## 1. P0: 실시간 이벤트 계약 정합화

현재 착수 산출물:

- `docs/plans/2026-04-30-cti-event-contract.md`
- `docs/plans/2026-04-30-realtime-event-scope.md`
- `docs/design/cti-event-contract.md`
- `apps/server/src/modules/realtime/realtime-events.ts`
- `apps/web/src/ws/realSocket.ts`, `apps/desktop/src/main/cti-runtime.ts`, `apps/desktop/src/main/cti-runtime.test.ts`
- 서버 tenant room broadcast 적용: `apps/server/src/modules/realtime/realtime.gateway.ts`, `apps/server/src/modules/events/event-bus.service.ts`
- 자기 상담원 상태 필터 적용: `apps/web/src/store/useCtiStore.ts`, `apps/desktop/src/renderer/src/store/useDesktopStore.ts`
- 관리자 앱 실시간 이벤트 소비 계획: `docs/plans/2026-04-30-admin-realtime-consumption.md`
- 관리자 앱 WebSocket 연결부: `apps/admin/src/realtime/adminRealtime.ts`
- 관리자 대시보드 이벤트 기반 refresh: `apps/admin/src/features/dashboard/hooks/useDashboardData.ts`

### 1.1 서버 발행 이벤트 목록 정리

- CTI 서버가 실제로 발행하는 통화, 상담원 상태, 큐 요약, 고객 screen pop 이벤트를 목록화한다.
- 각 이벤트의 이름, payload, 발생 조건, 재전송/중복 가능성을 문서화한다.
- REST 조회로 보정해야 하는 이벤트와 WebSocket만으로 처리해야 하는 이벤트를 구분한다.

완료 기준:

- 서버 이벤트 계약서 초안이 작성된다.
- 이벤트별 생산자와 소비자가 명확해진다.

### 1.2 클라이언트 구독 이벤트 정리

- 상담원 웹 앱, 관리자 앱, Windows 데스크톱 앱이 현재 구독하거나 기대하는 이벤트를 수집한다.
- mock 이벤트와 real 이벤트 이름/필드 차이를 정리한다.
- 더 이상 사용하지 않는 mock-only 이벤트를 제거 후보로 표시한다.

완료 기준:

- 세 클라이언트의 이벤트 기대값이 한 표로 정리된다.
- 서버와 맞지 않는 이벤트가 작업 항목으로 분리된다.

### 1.3 이벤트 계약 구현 정합화

- screen pop, 상담원 상태 변경, 큐 요약 변경 이벤트를 실제 서버 흐름에 연결한다.
- mock 이벤트와 real 이벤트의 이름과 payload를 맞춘다.
- 이벤트 계약이 깨질 때 실패하는 서버/클라이언트 테스트를 추가한다.

완료 기준:

- mock 없이 실제 서버 이벤트로 상담원 화면의 핵심 상태가 갱신된다.
- 관리자와 데스크톱 앱도 같은 이벤트 계약을 사용한다.

## 2. P0: 통화 제어 상태 서버 동기화

현재 착수 산출물:

- `docs/plans/2026-04-30-call-control-state-sync.md`
- mute 서버 상태 이벤트: `apps/server/src/modules/calls/calls.service.ts`
- transfer 서버 상태 이벤트: `apps/server/src/modules/calls/calls.service.ts`
- hold/resume/hangup 클라이언트 확정 제거: `apps/web/src/store/useCtiStore.ts`, `apps/desktop/src/renderer/src/store/useDesktopStore.ts`
- 검증 테스트: `apps/server/test/calls-service.integration.spec.ts`, `apps/web/src/store/useCtiStore.test.ts`, `apps/desktop/src/renderer/src/store/useDesktopStore.test.ts`

### 2.1 통화 제어 상태 모델 확정

- originate, pickup, transfer, mute, hold, resume, hangup의 command ack와 최종 성공 판정 흐름을 정리한다.
- mute, hold, resume 상태를 기존 통화 세션에 둘지 별도 상태 모델로 둘지 결정한다.
- 상태 전이의 우선순위와 역행 방어 기준을 정한다.

완료 기준:

- 통화 제어별 서버 상태 저장 위치와 최종 판정 기준이 확정된다.
- UI가 임의로 성공 상태를 확정하지 않는다.

### 2.2 서버 상태 반영 구현

- mute, hold, resume 상태를 서버 기준으로 저장한다.
- PBX 서버 후속 이벤트를 기준으로 최종 성공/실패를 반영한다.
- 새로고침, 다중 브라우저, 웹/데스크톱 동시 사용 시 같은 상태가 조회되게 한다.

완료 기준:

- 동일 상담원 세션을 여러 클라이언트에서 열어도 통화 제어 상태가 일치한다.
- 상태 변경 실패가 UI에 복구 가능한 형태로 표시된다.

### 2.3 클라이언트 상태 표시 정리

- 상담원 웹 앱의 통화 제어 버튼 상태를 서버 상태 기준으로 바꾼다.
- 데스크톱 앱의 softphone 상태와 CTI 서버 상태를 맞춘다.
- 관리자 실시간 화면에서 제어 상태를 조회/감사할 수 있게 한다.

완료 기준:

- 웹과 데스크톱 앱이 같은 통화에 대해 같은 제어 상태를 표시한다.
- 새로고침 후에도 제어 상태가 유지된다.

## 3. P0: PBX 설정 반영 검증 파이프라인

현재 착수 산출물:

- 설정 매핑 문서: `docs/design/pbx-config-mapping.md`
- 설정 반영 runbook: `docs/operations/pbx-config-apply-runbook.md`
- dry-run API: `GET /api/v1/asterisk-config/dry-run`
- dry-run 검증/차이 계산: `apps/server/src/modules/asterisk-config/asterisk-config-validation.ts`
- 관리자 dry-run 화면: `apps/admin/src/features/asterisk-config/components/ConfigPreviewDrawer.tsx`
- 사전 검증 스크립트: `scripts/pbx-config-preflight-smoke.ps1`

### 3.1 설정 생성 대상 확정

- 지사, DID, 큐, 상담원 내선, 착신전환, 멘트, 수신거부, 블랙리스트 중 PBX 서버 설정으로 렌더링되는 항목을 확정한다.
- 관리자 앱 입력값과 실제 설정 출력값의 매핑을 문서화한다.
- 설정 누락 시 운영 위험이 큰 필수값을 저장 또는 활성화 단계에서 차단한다.

완료 기준:

- 설정 입력값에서 PBX 서버 설정 파일까지의 흐름이 추적 가능하다.
- 필수값 누락 설정은 반영 전에 차단된다.

### 3.2 Preview, diff, dry-run 구현

- 관리자 앱에서 설정 생성 preview를 제공한다.
- 직전 반영본과 신규 생성본의 diff를 제공한다.
- 반영 전 문법 검증과 dry-run을 수행한다.

완료 기준:

- 운영자가 변경 영향 범위를 반영 전에 확인할 수 있다.
- 문법 오류가 있는 설정은 PBX 서버에 반영되지 않는다.

### 3.3 반영 후 자동 확인

- 설정 반영 후 PBX 서버 reload 결과를 확인한다.
- DID 라우팅, 큐 연결, 상담원 내선, 착신전환, 수신거부 대표 경로를 smoke test로 확인한다.
- 실패 시 직전 설정으로 복구하는 절차를 정한다.

완료 기준:

- 설정 반영 결과가 관리자 앱 또는 운영 리포트에 남는다.
- 반영 실패 시 원인과 복구 절차가 명확하다.

## 4. P0: 운영 배포 절차와 DB migration 기준 확정

현재 착수 산출물:

- 운영 배포 표준: `docs/operations/production-deployment-standard.md`
- 운영 배포 스크립트: `scripts/deploy-prod.sh`
- DB migration runbook: `docs/operations/db-migration-runbook.md`
- site template 운영 게이트: `deploy/sites/_template/README.md`

### 4.1 운영 배포 기준 분리

- 개발 배포와 운영 배포 절차를 문서와 스크립트에서 분리한다.
- site별 `compose.prod.yml`, 환경값, 볼륨, 네트워크, secret 주입 방식을 확정한다.
- frontend runtime config 필요 여부를 결정한다.

완료 기준:

- 새 사이트 배포 시 코드 수정 없이 site 설정만으로 배포할 수 있다.
- 개발용 watch/bind mount 구조가 운영 절차에 섞이지 않는다.

### 4.2 DB migration runbook 확정

- 운영 DB 백업, migration 적용, 실패 시 rollback 또는 보정 절차를 문서화한다.
- 기존 운영 DB에 baseline 차이가 있을 때의 검증 절차를 분리한다.
- schema 변경이 없는 배포와 있는 배포의 체크리스트를 나눈다.

완료 기준:

- 운영 DB에 적용 가능한 migration 절차가 재현 가능하다.
- migration 실패가 서비스 장애로 이어지지 않도록 사전 확인 항목이 있다.

### 4.3 CI 이미지와 배포 스크립트

- 서버, 관리자 앱, 상담원 웹 앱, 데스크톱 업데이트 artifact의 빌드 산출물을 분리한다.
- registry push와 site별 pull/restart 절차를 정리한다.
- health check와 배포 후 smoke test를 배포 스크립트에 연결한다.

완료 기준:

- 배포 후 서버, DB, Redis, PBX 연결, WebSocket 상태가 자동 확인된다.
- 배포 로그와 검증 결과가 남는다.

## 5. P0: 데스크톱 실환경 SIP/미디어 검증

현재 착수 산출물:

- 실환경 테스트 runbook: `docs/operations/agent-desktop-live-test-runbook.md`
- 실환경 증적 템플릿: `docs/qa/desktop-live-test-template.md`
- 업데이트 artifact 준비 스크립트: `scripts/desktop-update-artifact-prepare.ps1`
- P0 운영 준비 체크리스트: `docs/operations/p0-readiness-checklist.md`

### 5.1 상담원 PC 실환경 시나리오 준비

- 실제 상담원 PC 기준 OS, 장치, 네트워크, PBX 서버 접속 조건을 정리한다.
- pairing, SIP 등록, 인입, 발신, 종료, 재연결 시나리오를 작성한다.
- 웹 앱과 데스크톱 앱 동시 사용 기준을 정한다.

완료 기준:

- 실환경 테스트에 필요한 계정, 내선, DID, 장치 조건이 준비된다.
- 테스트 전제 조건이 문서화된다.

### 5.2 SIP 등록과 통화 흐름 검증

- 데스크톱 앱에서 SIP 등록 성공/실패를 확인한다.
- 인입, 수신, 발신, 통화 종료를 실제 PBX 서버와 검증한다.
- 통화 중 서버 재시작, 네트워크 끊김, 앱 재시작 시나리오를 확인한다.

완료 기준:

- 실제 상담원 PC에서 기본 통화 흐름이 통과한다.
- 장애/재연결 시나리오 결과가 문서화된다.

### 5.3 오디오 장치와 업데이트 검증

- 마이크, 스피커, 벨소리 장치 선택과 저장을 실기기에서 확인한다.
- 통화음과 벨소리 출력 경로를 분리 검증한다.
- 통화 중 업데이트 설치 차단, 통화 종료 후 설치 가능 상태를 검증한다.
- update manifest, tokenized download, hash 검증, report 저장을 end-to-end로 확인한다.

완료 기준:

- 상담원 PC에서 미디어 장치 설정이 재시작 후에도 유지된다.
- 업데이트 배포와 설치 결과가 서버에 기록된다.

## 6. P1: 관리자 권한 enforcement 전면 적용

현재 착수 산출물:

- 권한 기준표: `docs/design/admin-permissions-policy.md`
- 서버 forwarding rule 권한을 `settings/forwarding` 기준으로 분리: `apps/server/src/modules/asterisk-config/asterisk-config.controller.ts`
- 상담원 상태/통화 제어 운영 액션 권한 보강: `apps/server/src/modules/agents/agents.controller.ts`, `apps/server/src/modules/calls/calls.controller.ts`
- 관리자 앱 권한 로딩에서 admin/supervisor 전체 메뉴 재합성 제거: `apps/admin/src/store/usePermissionStore.ts`
- 권한 회귀 테스트: `apps/server/src/common/menu-permission.service.spec.ts`, `apps/admin/src/store/usePermissionStore.test.ts`

### 6.1 권한 정책 기준표 작성

- 메뉴, 조회, 생성, 수정, 삭제, 운영, export 액션을 권한 단위로 정리한다.
- 관리자 앱 버튼 노출 기준과 서버 API 강제 기준을 같은 표로 맞춘다.
- supervisor/admin 외 세부 역할이 필요한지 결정한다.

완료 기준:

- UI 권한과 서버 권한의 기준표가 하나로 정리된다.
- export와 조회 권한이 분리된다.

### 6.2 서버 API 강제 적용

- 주요 관리자 API에 권한 guard 또는 정책 검사를 적용한다.
- 권한 없는 요청은 일관된 오류 envelope으로 반환한다.
- 권한 변경 후 클라이언트 메뉴/버튼 노출이 갱신되게 한다.

완료 기준:

- UI를 우회한 API 호출도 권한 없이 성공하지 않는다.
- 권한 테스트가 추가된다.

## 7. P1: 멘트 파일 운영 자동화

현재 착수 산출물:

- 멘트 파일 상태 계산: `apps/server/src/modules/asterisk-config/asterisk-config.service.ts`
- 멘트 파일 상태 테스트: `apps/server/src/modules/asterisk-config/asterisk-config.service.spec.ts`
- 관리자 멘트 파일 상태 표시: `apps/admin/src/features/prompt-settings/PromptSettingsPage.tsx`

### 7.1 메타데이터와 실제 파일 상태 분리

- 멘트 메타데이터와 실제 음성 파일 배포 상태를 분리해서 저장/표시한다.
- 기본 멘트가 없는 지사/IVR 설정은 활성화하지 못하게 한다.
- 파일 상태를 업로드됨, 변환됨, 배포됨, reload 확인됨으로 구분한다.

완료 기준:

- 관리자 앱에서 메타데이터만 있고 실제 파일이 없는 상태를 구분할 수 있다.
- 운영 필수 멘트 누락이 반영 전에 차단된다.

### 7.2 업로드, 변환, 배포, 확인

- 음성 파일 업로드와 저장 경로를 확정한다.
- PBX 서버 재생 가능 포맷으로 변환한다.
- site별 PBX 서버로 배포하고 reload 결과를 확인한다.
- 실패 시 재시도와 오류 표시를 제공한다.

완료 기준:

- 운영자가 관리자 앱에서 멘트 파일 배포 상태를 확인할 수 있다.
- 배포된 멘트가 PBX 서버에서 실제 재생 가능하다.

## 8. P1: IVR 플로우와 실행 이력

현재 착수 산출물:

- IVR DTMF 경로 요약 컬럼과 상세 drawer: `apps/admin/src/features/asterisk-config/components/IvrMenusTab.tsx`

### 8.1 IVR 요약 화면 또는 플로우 빌더

- DID에서 시작해 DTMF 입력, timeout, 상담원 연결, 착신전환, 문자 발송, 수신거부 등록까지 한 화면에서 검토한다.
- 저장 전 전체 경로와 fallback 경로를 표시한다.
- 잘못된 입력, 누락된 멘트, 연결되지 않은 큐를 저장 전 차단한다.

완료 기준:

- 운영자가 IVR 변경 전 전체 흐름을 확인할 수 있다.
- 끊긴 경로가 있는 IVR 설정은 활성화되지 않는다.

### 8.2 IVR 실행 이력과 고객 이력 연결

- 고객별 IVR 입력 이력을 통화 이력과 연결한다.
- timeout, 잘못된 입력, 수신거부 등록, 문자 발송 결과를 저장한다.
- 관리자 리포트에서 IVR 실패 원인을 조회할 수 있게 한다.

완료 기준:

- 특정 통화에서 고객이 어떤 IVR 경로를 탔는지 확인할 수 있다.
- IVR 실패/timeout 통계를 운영자가 볼 수 있다.

## 9. P1: 테스트 앱 smoke/regression 표준화

현재 착수 산출물:

- PBX smoke/regression 표준: `tools/pbx-loadgen/test-templates/smoke-regression-standard.md`
- 재사용 YAML 템플릿: `tools/pbx-loadgen/test-templates/p1-standard-smoke.yaml`, `tools/pbx-loadgen/test-templates/p1-standard-regression.yaml`
- test-template 안내 갱신: `tools/pbx-loadgen/test-templates/README.md`

### 9.1 표준 시나리오 세트 정의

- 인입 smoke, IVR smoke, 큐 분배 smoke, 상담원 연결 smoke, 착신전환 smoke, 수신거부 smoke를 표준 세트로 만든다.
- 운영 반영 전후에 같은 테스트 세트를 실행할 수 있게 한다.
- site별 DID, 큐, 상담원 내선, allowlist 값을 외부 설정으로 분리한다.

완료 기준:

- 운영 반영 전후 테스트가 같은 형식으로 실행된다.
- site별 값만 바꿔 동일 시나리오를 재사용할 수 있다.

### 9.2 CTI API, WebSocket, DB 상태 검증 연결

- OpenAPI export를 최신화한다.
- test-plan 기능을 운영 기능 단위로 정리한다.
- API 응답뿐 아니라 DB 상태와 WebSocket 이벤트까지 확인한다.

완료 기준:

- 테스트 앱 결과가 단순 통화 성공 여부를 넘어 CTI 상태 정합성까지 확인한다.
- 이벤트 누락과 DB 상태 불일치가 리포트에 드러난다.

### 9.3 결과 리포트 운영화

- CSV/JSON 결과를 사람이 읽는 요약 보고서로 변환한다.
- 실패 원인을 PBX 서버, CTI 서버, 클라이언트, 테스트 앱 중 어느 계층인지 분류한다.
- 배포 전 필수 통과 기준을 정의한다.

완료 기준:

- 배포 전 필수 테스트 통과 여부가 한눈에 보인다.
- 실패 시 다음 조사 위치가 리포트에 표시된다.

## 10. P1: 관리자 운영 화면 보강

현재 착수 산출물:

- 관리자 WebSocket refresh 공통 hook: `apps/admin/src/realtime/useAdminRealtimeRefresh.ts`
- 실시간 콜, 상담원, 큐 화면 이벤트 즉시 갱신: `apps/admin/src/features/live-calls/LiveCallsPage.tsx`, `apps/admin/src/pages/AgentsPage.tsx`, `apps/admin/src/pages/QueuesPage.tsx`
- 큐 상세 drawer와 멤버 조회: `apps/admin/src/pages/QueuesPage.tsx`

### 10.1 실시간 화면 WebSocket 전환

- 관리자 실시간 통화, 큐 요약, 상담원 상태 화면을 polling 중심에서 WebSocket 중심으로 전환한다.
- WebSocket 실패 시 REST 보정 조회로 복구한다.
- 이벤트 지연 또는 누락 상태를 운영자가 알 수 있게 한다.

완료 기준:

- 실시간 운영 화면이 서버 이벤트와 같은 상태를 표시한다.
- 연결 장애 시 화면이 조용히 오래된 상태로 남지 않는다.

### 10.2 큐 상세 drill-down

- 큐 단건 상세 drawer 또는 상세 화면을 추가한다.
- 대기 콜, 상담원 멤버, 현재 상태, 분배 정책, 최근 실패/timeout을 표시한다.
- 큐 설정 변경 영향 범위와 연결한다.

완료 기준:

- 운영자가 큐 문제를 목록 화면에서 상세 원인까지 추적할 수 있다.

## 11. P2: 운영 품질 확장

### 11.1 공지사항 상담원 앱 연결

- 관리자 공지사항 CRUD 결과를 상담원 웹 앱에서 소비한다.
- 로그인 후 공지, 긴급 공지, 읽음 상태를 구분한다.

완료 기준:

- 관리자가 등록한 공지가 상담원 앱에 표시된다.

### 11.2 리포트 고도화

- 통화내역, 미연결 콜, 녹취, 차단/수신거부, IVR 실패 리포트를 운영 관점으로 정리한다.
- 조회 권한과 export 권한을 분리 유지한다.
- 장기 보관, 개인정보 마스킹, 다운로드 감사 로그를 검토한다.

완료 기준:

- 운영자가 장애/품질/성과 분석에 필요한 리포트를 같은 기준으로 조회할 수 있다.

### 11.3 운영 모니터링과 알림

- PBX 연결, DB, Redis, outbox backlog, recovery count, WebSocket 연결 수를 health/monitoring에서 확인한다.
- 장애 기준과 알림 기준을 정한다.
- 운영 대시보드에 최근 장애와 복구 상태를 표시한다.

완료 기준:

- 운영자가 장애 전조와 현재 장애 위치를 한 화면에서 확인할 수 있다.

## 12. 권장 실행 순서 요약

1. 통합 계획서 기준선 확정
2. 실시간 이벤트 계약 정합화
3. 통화 제어 상태 서버 동기화
4. PBX 설정 반영 검증 파이프라인
5. 운영 배포 절차와 DB migration 기준 확정
6. 데스크톱 실환경 SIP/미디어 검증
7. 관리자 권한 enforcement 전면 적용
8. 멘트 파일 운영 자동화
9. IVR 플로우와 실행 이력
10. 테스트 앱 smoke/regression 표준화
11. 관리자 실시간 화면과 큐 상세 보강
12. 공지사항, 리포트, 모니터링 확장

## 13. 첫 작업 후보

가장 먼저 착수할 작업은 `1. P0: 실시간 이벤트 계약 정합화`다.

이유:

- 상담원 웹 앱, 관리자 앱, 데스크톱 앱의 실제 운영 상태 표시가 모두 여기에 의존한다.
- 통화 제어 상태 동기화와 관리자 실시간 화면 전환의 선행 조건이다.
- 테스트 앱의 WebSocket 검증 기준도 이벤트 계약이 확정되어야 만들 수 있다.

첫 작업의 구체적인 산출물:

- `docs/design/cti-event-contract.md`
- 서버 발행 이벤트 목록
- 상담원 웹 앱, 관리자 앱, 데스크톱 앱 구독 이벤트 목록
- mock/real 이벤트 차이표
- P0 구현 작업 목록
