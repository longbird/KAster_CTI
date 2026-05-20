# PBX M1 후속 진행 기록 (2026-05-20)

## 완료

- 지사 운영 설정 모달의 착신전환 규칙 선택 라벨을 상세화했다.
  - 서버 `getBranchMappings` 응답에 `forwardTriggerMode`, `queueWaitSeconds`, `stickyCallbackWindowMinutes`, `schedules`를 포함한다.
  - 관리자 UI는 DID, 전환 방식/대상, 착신 조건, 시간표, 재착신 조건을 한 줄로 요약한다.
- PBX 공통 도움말 자동 구축 스크립트를 추가했다.
  - `apps/admin/scripts/help-curated.json`을 승인 입력으로 사용한다.
  - `docs/IPPBX_개발시 참조용_20260104/3_DM_설정화면` 파일명에서 `mmc.*` `AUTO_DRAFT` 항목 27건을 생성한다.
  - `npm run help:build` 실행 결과 `pbxFeatureHelp.generated.json`은 35개 항목으로 재생성됐다.
- P0 설정 화면 6곳의 페이지 제목 옆에 도움말 버튼을 배치했다.
  - 시스템 설정, 지사 설정, 착신전환 설정, 호 분배룰 설정, 상담원 설정, PBX 연동 설정.
- 무조건 착신 대상 세분 선택을 추가했다.
  - `queues.unconditionalTargetType`, `queues.unconditionalTargetValue` 컬럼과 마이그레이션을 추가했다.
  - 생성/수정 모달에서 상담원/분배룰/외부번호 대상 유형과 값을 선택한다.
  - 서버는 `UNCONDITIONAL`일 때 대상 필수, 외부번호 자리수, 상담원/분배룰 존재, 자기 자신 분배룰 대상 금지를 검증한다.
- M1 전체 잔여 항목을 구현했다.
  - 상담원 `extensionDisplayName`, `extensionLockMode` 컬럼과 마이그레이션을 추가했다.
  - 상담원 생성/수정/목록 API와 관리자 UI에서 내선 표시명, 내선 잠금(`UNLOCKED`, `OUTBOUND_LOCKED`, `FULL_LOCKED`)을 저장·표시한다.
  - PBX PJSIP 렌더러는 내선 표시명을 `callerid` 표시명에 반영한다.
  - PBX 상담원 dialplan은 `OUTBOUND_LOCKED`일 때 외부 발신만 차단하고 내부 통화는 유지한다.
  - `FULL_LOCKED`일 때 상담원 endpoint context를 차단하고 queue member 렌더링에서 제외한다.
  - 시스템 설정에 시간 동기화 상태 영역을 추가하고, `/admin/settings/system/time-sync`가 앱 서버 시간과 DB 시간의 `driftSeconds`를 반환한다.
  - 국선 표시번호(`pbx.trunkDisplayNumber`)와 내선 잠금(`agent.extensionLock`) 도움말 버튼을 P0 화면에 추가했다.

## 운영서버 직접 적용 필요

로컬 DB 마이그레이션은 실행하지 않는다. 운영서버에서 직접 실행한다.

```bash
cd apps/server
npx prisma migrate deploy
```

권장 확인 SQL:

```sql
SELECT 1 FROM pg_indexes WHERE indexname='branchDids_tenantId_didId_key';
SELECT column_name FROM information_schema.columns WHERE table_name='queues' AND column_name IN ('distributionMode', 'unconditionalTargetType', 'unconditionalTargetValue');
SELECT column_name FROM information_schema.columns WHERE table_name='agents' AND column_name IN ('extensionDisplayName', 'extensionLockMode');
```

## 현재 검증

- `apps/server`: `npx prisma generate` PASS
- `apps/server`: `npx jest src/modules/queues/distribution-mode.spec.ts` PASS
- `apps/server`: `npx jest src/modules/queues/distribution-mode.spec.ts src/modules/admin/admin.service.branch-mappings.spec.ts` PASS
- `apps/server`: `npm run build` PASS
- `apps/admin`: `npm run help:build` PASS, 35개 항목 생성
- `apps/admin`: `npx vitest run scripts/buildHelp.test.ts src/shared/help` PASS
- `apps/admin`: `npx vitest run src/features/queue-settings/queueStrategy.test.ts src/shared/help/helpButtonPlacement.test.ts` PASS
- `apps/admin`: `npm run build` PASS
- `apps/server`: `npx prisma generate` PASS after `extensionDisplayName` / `extensionLockMode`
- `apps/server`: `npx jest src/modules/asterisk-config/renderers/pjsip.renderer.spec.ts src/modules/asterisk-config/renderers/agent-dialplan.renderer.spec.ts src/modules/admin/time-sync-status.spec.ts test/agents.service.spec.ts` PASS
- `apps/admin`: `npx vitest run src/features/agent-settings/extensionPolicy.test.ts src/features/system-settings/timeSyncStatus.test.ts src/shared/help/helpButtonPlacement.test.ts` PASS
- `apps/server`: `npm run build` PASS
- `apps/admin`: `npx tsc -b` PASS

## 남은 검증

- 없음. 자동 테스트와 로컬 API 스모크까지 완료.

## 2026-05-20 추가 검증

- D 드라이브 WSL 로컬 인프라 기동 확인.
  - `scripts/start-local-test-infra.ps1` PASS
  - PostgreSQL/Redis WSL IP 기반 `apps/server/.env` 갱신 확인
- 로컬 DB 스모크 확인.
  - `branchDids_tenantId_didId_key` 인덱스 존재 확인
  - `queues.distributionMode`, `queues.unconditionalTargetType`, `queues.unconditionalTargetValue` 컬럼 존재 확인
  - seed tenant 1건 확인
- 전체 자동 테스트 재실행.
  - `apps/server`: `npx jest` — 37 suites / 224 tests PASS
  - `apps/admin`: `npx vitest run` — 26 files / 84 tests PASS
  - `apps/web`: `npm test` — 5 files / 11 tests PASS
- 로컬 서버 API 스모크 완료.
  - `GET /api/v1/health/live` PASS
  - `POST /api/v1/auth/login` (`supervisor1`) PASS
  - `GET /api/v1/me/session` PASS
  - `PATCH /api/v1/queues/:queueId`: `SEQUENTIAL` 저장 시 `strategy=linear` 확인 후 `DISTRIBUTE/leastrecent` 복원
  - `POST /api/v1/asterisk-config/dids` 임시 DID 생성/삭제 PASS
  - `POST /api/v1/asterisk-config/forwarding-rules` 22:00~06:00 자정 넘는 시간표 저장 PASS
  - `GET /api/v1/asterisk-config/preview` 에서 `22:00-23:59 mon` + `00:00-06:00 tue` 분할 렌더 확인
  - 스모크 후 임시 DID/착신전환 규칙 삭제 및 로컬 서버 프로세스 종료
- M1 전체 잔여 API 스모크 완료.
  - `GET /api/v1/admin/settings/system/time-sync` PASS (`status=OK`, `driftSeconds=0`)
  - `PATCH /api/v1/agents/:agentId` 로 `extensionDisplayName=Main Desk 1`, `extensionLockMode=OUTBOUND_LOCKED` 저장 PASS
  - PBX preview `pjsip.conf` 에 `callerid=Main Desk 1 <1001>` 반영 확인
  - PBX preview `extensions_agent.conf` 에 OUTBOUND 잠금 차단 분기와 내부 통화 유지 확인
  - `extensionLockMode=FULL_LOCKED` 저장 후 PBX preview 에 endpoint 차단 분기 확인
  - `FULL_LOCKED` 상담원이 `queues.conf` member 에서 제외되는지 확인
  - 스모크 후 상담원 설정 원복 및 로컬 서버 프로세스 종료
- 최종 회귀.
  - `apps/server`: `npx jest` — 38 suites / 231 tests PASS
  - `apps/admin`: `npx vitest run` — 28 files / 89 tests PASS
  - `apps/web`: `npm test` — 5 files / 11 tests PASS
  - `apps/server`: `npm run build` PASS
  - `apps/admin`: `npm run build` PASS
  - `apps/web`: `npm run build` PASS
