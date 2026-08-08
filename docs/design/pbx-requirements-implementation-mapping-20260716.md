# PBX 요구사항-현재 구현 매핑표

작성일: 2026-07-16

## 1. 검토 목적

기존 디지털 키폰 PBX 참조 기능을 현재 CTI 구조에 맞춰 선별 수용하기 위해, 요구사항과 현재 구현 상태를 기능 단위로 대조한다. 이 문서는 추가 구현이 필요한 부분, 구현이 불가능하거나 정책상 불수용해야 하는 부분, 현재 구조에서는 불필요한 부분을 구분하기 위한 운영 검토 기준이다.

## 2. 검토 기준과 확인 범위

### 기준 문서

- `docs/design/samsung-pbx-requirements-analysis-20260513.md`
- `docs/plans/pbx-selected-features-development-plan-20260514.md`
- `docs/plans/pbx-deferred-feature-backlog-20260522.md`
- `docs/plans/pbx-ops-actions-runbook-plan-20260522.md`
- `docs/operations/pbx-operational-validation-runbook-20260716.md`

### 코드 확인 범위

- 서버 스키마: `apps/server/prisma/schema.prisma`
- 서버 관리자 API: `apps/server/src/modules/admin/admin.controller.ts`, `apps/server/src/modules/admin/admin.service.ts`
- PBX 설정 API/렌더러: `apps/server/src/modules/asterisk-config/`
- 큐/분배룰: `apps/server/src/modules/queues/`
- 통화 제어: `apps/server/src/modules/calls/`
- 관리자 화면: `apps/admin/src/app/router.tsx`, `apps/admin/src/features/`
- 도움말: `apps/admin/src/shared/help/`, `apps/admin/scripts/`

### 실행 검증

서버 관련 테스트:

```text
npm test -- --runInBand test/admin.service.branch-did.spec.ts test/admin.service.holiday-rules.spec.ts test/queues.service.spec.ts test/calls-service.integration.spec.ts src/modules/asterisk-config/asterisk-config.service.spec.ts src/modules/asterisk-config/renderers/dialplan.renderer.spec.ts src/modules/asterisk-config/renderers/agent-dialplan.renderer.spec.ts src/modules/asterisk-config/renderers/pjsip.renderer.spec.ts src/modules/admin/time-sync-status.spec.ts
```

결과: 9개 suite, 98개 test 통과.

관리자 앱 관련 테스트:

```text
npm test -- --run src/shared/help/FeatureHelpButton.test.tsx src/shared/help/helpButtonPlacement.test.ts src/features/queue-settings/queueMemberGroups.test.ts src/features/agent-settings/extensionDisplayName.test.ts src/features/agent-settings/extensionPolicy.test.ts src/features/system-settings/timeSyncStatus.test.ts
```

결과: 6개 file, 23개 test 통과.

## 3. 판정 기준

| 판정 | 의미 |
|---|---|
| 구현 완료 | 스키마/API/UI/PBX 렌더링 또는 필요한 범위의 테스트가 존재한다. |
| 부분 구현 | 핵심 골격은 있으나 요구 범위 전체 또는 운영 자동화가 부족하다. |
| 추가 구현 필요 | 현재 CTI에 필요하지만 구현이 없거나 화면/API 연결이 부족하다. |
| 조건부 보류 | 운영 시나리오가 확인되면 수용한다. 현재는 구현하지 않는 것이 맞다. |
| 불필요 | 현재 CTI 구조의 기존 기능으로 대체 가능하거나 별도 기능으로 만들면 중복이다. |
| 불수용/불가능 | 정책상 제공하지 않거나 현재 CTI 목적과 맞지 않는다. |
| 정책 정리 필요 | 구현은 있으나 문서/정책 판단과 충돌하거나 표현 정리가 필요하다. |

## 4. 종합 결론

현재 구현은 P0/P1 핵심 운영 기능 대부분을 이미 포함한다. 특히 지사-DID 연결, DID/ARS/착신전환, 외부 착신 방식, 착신전환 조건, 내선 표시명, 내선 잠금, 국선 표시번호, 시간 동기화, 가상버퍼 표시, 상담원 그룹 기반 분배, 제한적 대리응답, 공휴일/시간대 라우팅, 기능별 도움말은 코드상 구현 또는 1차 구현 상태다.

다만 다음 항목은 추가 판단이 필요하다.

- 번호 자원 화면은 `targetRoute` 계산뿐 아니라 실제 이동 버튼과 대상 화면의 query 기반 편집 진입까지 보강했다.
- 도움말 자동 구축은 정적 승인 JSON, 원천 매핑, 설정화면 파일명 기반 초안 생성, PDF/엑셀 텍스트 추출, 검색 출처 JSON 병합까지 구현했다. OCR, 검색 API 자동 수집, DB 기반 승인 워크플로는 미완성이다.
- 내선 잠금은 실제 코드 구현에 맞춰 개발 계획 문서의 “별도 개발 제외” 표현을 “상담원/내선 엔드포인트 사용 제한 정책으로 수용 완료”로 정정했다.
- 국선 그룹은 기본 발신 풀과 장애 우회 순서 관리 범위로 부분 수용 완료했다. 지사별/요금제별/지역별 발신 라우팅은 현장 시나리오가 확정되기 전까지 보류가 맞다.
- 실시간 통화 감청은 정책상 불수용이며 구현하지 않는 것이 맞다.

## 5. 요구사항-구현 매핑표

| No | 요구 기능 | 요구/판단 | 현재 구현 근거 | 현재 상태 | 추가 구현 또는 조치 | 최종 판단 |
|---:|---|---|---|---|---|---|
| 1 | 지사별 DID/ARS/착신 정책 | P0 수용. ARS 번호를 별도 번호 자원으로 관리하지 않고 DID/지사 정책 안에서 처리 | `branchDids`, `(tenantId,didId)` 유니크, `AsteriskDid.ivrMenuId/directQueue`, `asteriskForwardingRules`, `updateBranchMappings`, 지사 편집 UI | 구현 완료 | 운영 화면에서 착신 우선순위 설명을 더 명확히 유지 | 수용 유지 |
| 2 | ARS 번호 별도 관리 여부 | 별도 번호 자원 불필요. DID 또는 지사 인입 정책에 연결 | DID 원천 설정에 ARS 메뉴 연결, 지사 연결은 DID 기반 | 구현 완료 | ARS 전용 번호 관리 메뉴는 만들지 않음 | 불필요 |
| 3 | 가상버퍼 번호 할당 | 호 분배 내부 대기 공간이면 번호 할당 불필요 | 큐 요약/설정 화면에 `virtualBuffer` 표시, `callSessions.sessionStatus='QUEUED'` 기반 | 구현 완료 | 직접 라우팅 대상으로 쓰는 요구가 생기면 내부 ID만 검토 | 별도 번호 불필요 |
| 4 | 국선번호 마지막 4자리 표시 | P0 수용. 트렁크 표시/운영 정책 | `AsteriskTrunk.displayNumber`, `computedDisplayNumber`, 트렁크 DTO 검증, 시스템/PBX 설정 화면 표시 | 구현 완료 | 표시번호가 발신번호 정책과 혼동되지 않도록 도움말 유지 | 수용 유지 |
| 5 | 외부 착신 방식 구체 정의 | P0 수용. 순차/분배/무조건을 CTI 분배 방식으로 재정의 | `queues.distributionMode`, `unconditionalTargetType`, `unconditionalTargetValue`, 큐 생성/수정 UI, 전략 매핑 테스트 | 구현 완료 | 무조건 착신 대상별 실제 PBX 동작을 운영 환경에서 확인 | 수용 유지 |
| 6 | 착신전환 조건 다양화 | P0 수용 | `forwardTriggerMode`, `queueWaitSeconds`, `SMART_NO_READY`, `scheduleJson`, 복수 시간표 UI/렌더러 테스트 | 구현 완료 | PBX 장애 fallback 조건은 운영 환경 기준으로 별도 점검 | 수용 유지 |
| 7 | 시간별 동작 | P2 추가 기능 | 착신전환 `scheduleJson`, PBX 시간 조건 렌더링 | 구현 완료 | 복잡한 업무시간 템플릿 UI가 필요하면 후속 고도화 | 수용 완료 |
| 8 | 공휴일 지정 | P2 추가 기능 | `tenantHolidayRules`, holiday CRUD API/UI, 공휴일 우선 렌더링 테스트 | 구현 완료 | 공공 휴일 자동 import는 별도 고도화 | 수용 완료 |
| 9 | 시간 동기화 상태 | P0 수용. 시간 변경 UI는 제공하지 않음 | `settings/system/time-sync`, `pbxTime`, `driftSeconds`, 시스템 설정 화면 표시, 테스트 | 구현 완료 | 운영 PBX 시간 조회 실패 시 알림/Runbook 연결 보강 가능 | 수용 유지 |
| 10 | 내선 표시명 | P0 수용. 상담원명과 분리 | `agents.extensionDisplayName`, 상담원 DTO/UI, PJSIP callerid 렌더링, 테스트 | 구현 완료 | 표시 우선순위 도움말 유지 | 수용 유지 |
| 11 | 내선 잠금 | 요구사항상 필요성 인정 | `agents.extensionLockMode`, 상담원 생성/수정 UI, PBX 발신/전체 잠금 렌더러, 테스트 | 구현 완료 | 개발 계획 문서를 현재 구현 기준으로 정정 완료 | 수용 완료 |
| 12 | 전화기 응답 모드 | Ring 기본, Auto Answer 조건부, Voice Announce 불필요 | 현재 별도 응답 모드 모델/UI 없음 | 미구현 | Auto Answer 운영 요구가 생길 때만 단말/소프트폰 정책으로 설계 | Voice Announce 불필요, Auto Answer 조건부 |
| 13 | 내선 서비스 등급 | 기존 PBX COS 전체 복제는 과다. 필요한 정책만 분해 | 메뉴 권한, 상담원 권한, 발신번호 권한, 내선 잠금 등 개별 정책은 존재 | 부분 대체 | COS 표 전체 복제 금지. 필요 시 발신 제한/기능 권한별로 분리 | 전체 복제 불필요 |
| 14 | 대리응답그룹 | 분배룰로 충분한지 검토. 필요 시 최소 pickup | `POST /calls/:callId/pickup`, 같은 그룹/분배룰 제한 테스트, PJSIP pickup group 렌더링 | 구현 완료 | 실제 단말 ringing pickup까지 필요한지 운영 검증 | 제한 수용 |
| 15 | 내선 그룹 지정 | 상담원 그룹으로 대체 | `agentGroups`, `agents.agentGroupId`, 큐 멤버 그룹 추가 UI, 스냅샷 방식 | 구현 완료 | 그룹 변경 자동 반영은 의도적으로 미채택 | 대체 수용 |
| 16 | 통화 그룹별 발신/응답 허용 | 부가 기능, 후순위 | 지사-상담원 발신권한 매트릭스와 권한 모델 일부 존재 | 부분 대체 | 통화 그룹 단위의 정교한 응답/발신 매트릭스는 현장 요구 확인 후 | 후순위 |
| 17 | 직통전화 | 기능 의미를 분리해 필요한 범위만 수용 | DID 큐 직결, DID 내선 직결(`AsteriskDid.directExtension`), tenant 공용 단축 발신(`AsteriskSpeedDial`) 구현. 오프훅 자동 발신은 구현 없음 | 부분 구현 | DID 직접 착신과 단축 발신은 수용 완료. 오프훅 자동 발신은 단말 지원/현장 정책 확인 필요 | 부분 수용 |
| 18 | 브랜치 그룹 | CTI 지사와 다른 pickup group 의미 가능성 | PJSIP pickup group 렌더링, 대리응답 최소 기능, 실시간 콜 대리응답 도움말 연결 존재. “브랜치 그룹” 별도 모델 없음 | 부분 흡수 | pickup group 성격은 대리응답으로 처리. 지사 그룹 성격이면 별도 명칭 확정 후 설계 | 부분 흡수, 나머지 보류 |
| 19 | 발신자번호 내선/국선별 등록 | 과다 스펙. 현 발신번호 정책으로 대체 | outbound caller ID rules, 지사-상담원 발신권한 매트릭스 존재 | 대체 구현 | 내선/국선별 CLI slot 복제는 하지 않음 | 불필요 |
| 20 | 국선 이름 | 후순위 표시 기능 | 트렁크 `name`, `displayNumber` 존재 | 부분 대체 | 별도 국선 이름 기능은 현재 불필요. 목록 표시 개선 정도만 검토 | 후순위 |
| 21 | 국선 그룹 지정 | 복수 트렁크 pool/failover 필요 시만 수용 | `AsteriskTrunkGroup`, `AsteriskTrunkGroupMember`, `/asterisk-config/trunk-groups`, 관리자 트렁크 탭 국선 그룹 UI, 기본 그룹 기반 발신 Dial 렌더링 구현 | 부분 구현 | 기본 발신 풀과 장애 우회 순서는 수용 완료. 지사별/요금제별/지역별 라우팅은 현장 요구 확정 전 보류 | 부분 수용 |
| 22 | 내선별 단축 다이얼 | 개인별 기능은 부가 기능, 후순위 | tenant 공용 단축 발신은 구현. 상담원 개인별 단축 다이얼은 구현 없음 | 부분 구현 | 개인별 단축번호가 필요한지 확인 후 별도 설계 | 후순위 |
| 23 | 공동 단축 다이얼 | tenant 공용 단축 발신으로 필요한 최소 범위 수용 | `AsteriskSpeedDial`, `/asterisk-config/speed-dials`, PBX 설정 단축 발신 탭, agent dialplan 렌더링 구현 | 구현 완료 | 고객/연락처와 중복되는 고급 관리 기능은 필요성 확인 전 확장 금지 | 수용 |
| 24 | 시간 표시 방법 | 단말 표시 옵션 | 구현 없음 | 미구현 | CTI 운영 필수 아님 | 불필요에 가까운 후순위 |
| 25 | 내선별 키버튼/전화기 종류별 버튼 | PBX 단독 구현 불가. 단말 프로비저닝 성격 | 구현 없음. PBX는 버튼 입력 후 들어오는 SIP/DTMF/기능코드만 처리 가능 | 미구현 | 실제 단말 모델, 제조사별 프로비저닝 포맷, 소프트폰 키 정책 확정 후 | PBX 단독 불가, 단말 확정 전 보류 |
| 26 | 다이얼번호 변경 | 전체 PBX 번호 체계 변경은 위험 | 번호 자원 충돌 검증과 기능코드 인덱스 일부 존재 | 부분 대체 | MMC식 전체 번호 변경 UI는 만들지 않음. 기능코드 registry로 제한 | 불필요/후순위 |
| 27 | 번호 자원/기능 코드 분리 | 번호 자원은 운영 정책, 기능 코드는 별도 | `NumbersPage`, `numberResources.ts`에서 DID/내선/큐/기능코드 인덱스와 충돌 표시, 이동 버튼 제공 | 구현 완료 | 대상 화면 query 처리 범위는 DID/상담원/분배룰/기능코드부터 적용 | 수용 완료 |
| 28 | 번호 클릭 즉시 기능 접근 | 가능성 확인 필요 | `targetRoute` 기반 `설정 열기` 버튼, `/asterisk?tab=dids&resourceId=...`, `/settings/agents?resourceId=...`, `/settings/queues?resourceId=...`, `/live-calls?feature=...` 처리 | 구현 완료 | 대상 화면별 강조/자동 편집 진입은 핵심 경로부터 적용 | 수용 완료 |
| 29 | 기능별 도움말 아이콘 | 각 기능 페이지에서 도움말 표시 | `FeatureHelpButton`, `FeatureHelpPanel`, 주요 P0 화면 배치 테스트 | 구현 완료 | `NumbersPage` 등 일부 보조 화면에도 help key 확대 가능 | 수용 완료 |
| 30 | 도움말 자동 구축 | 매뉴얼/정보 검색 기반 자동 구축 | `help-curated.json`, `help-source-map.json`, `help-search-sources.json`, `build-pbx-feature-help.ts`, PDF/엑셀 텍스트 추출, 설정화면 파일명 기반 AUTO_DRAFT 생성 | 부분 구현 | OCR, 검색 API 자동 수집, DB 승인 워크플로는 미완성 | 추가 구현 필요 |
| 31 | 실시간 통화 감청 | 지원하지 않음 | 관련 감청 API/화면/렌더링 없음. 녹취/모니터링과 분리 | 미구현 | 구현하지 않음. `ChanSpy`류 기능 금지 | 불수용/불가능 |
| 32 | 통화 감청 | 불가 | 위와 동일 | 미구현 | 구현하지 않음 | 불수용/불가능 |
| 33 | 시스템 재시동 | 별도 운영 액션 | runbook 계획 문서만 존재. 일반 설정 UI 없음 | 문서화 완료, 미구현 | 강권한/2단계 확인/감사로그/API 정책 확정 후 별도 구현 | 별도 기능 |
| 34 | 내선/국선 포트 초기화 | 장애 복구 전용 | runbook 계획 문서만 존재. UI/API 없음 | 문서화 완료, 미구현 | `통화 채널 정리`, `등록 초기화`, `설정 초기화`를 분리해야 함 | 별도 검토 |
| 35 | 내선/국선 포트 DB 초기화 | 위험 기능 | 구현 없음 | 미구현 | 일반 관리자 UI에 노출하지 않음 | 불수용에 가까운 별도 승인 기능 |

## 6. 직통전화/단축 발신 구현 상세

### 6.1 DID 직접 착신

구현 상태: 수용 완료.

관리자 설정:

1. `PBX 설정 > DID`로 이동한다.
2. DID를 추가하거나 수정한다.
3. 연결 방식을 `내선 직결`로 선택한다.
4. 직접 착신할 상담원 내선을 선택한다.

구현 산출물:

| 구분 | 구현 |
|---|---|
| DB | `AsteriskDid.directExtension` |
| API | `POST/PUT /asterisk-config/dids` |
| UI | `apps/admin/src/features/asterisk-config/components/DidForm.tsx` |
| PBX 렌더러 | `dialplan.renderer.ts`에서 `Dial(PJSIP/{내선},20,...)` 생성 |
| 검증 | `dialplan.renderer.spec.ts`의 direct extension 렌더링 테스트 |

제약:

- DID는 `IVR`, `큐 직결`, `내선 직결` 중 하나만 가질 수 있다.
- 내선 직결 대상은 활성 상담원 내선이어야 한다.
- 큐 대기/분배/부재 fallback이 필요한 경우 내선 직결보다 1인 호 분배룰 연결을 우선 검토한다.

### 6.2 단축 발신

구현 상태: tenant 공용 단축 발신 수용 완료.

관리자 설정:

1. `PBX 설정 > 단축 발신`으로 이동한다.
2. 단축번호와 대상번호를 등록한다.
3. 단축번호는 내선/외부 발신 패턴과 충돌하지 않도록 `*01`, `#01` 형식을 권장한다.

구현 산출물:

| 구분 | 구현 |
|---|---|
| DB | `AsteriskSpeedDial` |
| API | `GET/POST/PUT/DELETE /asterisk-config/speed-dials` |
| UI | `SpeedDialsTab.tsx`, `SpeedDialForm.tsx` |
| PBX 렌더러 | `agent-dialplan.renderer.ts`에서 `agent-phone-{내선}` context에 단축번호 exact match 생성 |
| 검증 | `agent-dialplan.renderer.spec.ts`, `asterisk-config.service.spec.ts` |

제약:

- 단축번호가 내선 패턴 또는 외부 발신 패턴과 충돌하면 저장을 거부한다.
- 외부번호 대상은 기존 발신번호 정책, 내선 잠금 정책, 국선 그룹 경로의 영향을 받는다.
- 상담원 개인별 단축번호와 연락처 연동은 아직 구현하지 않는다.

## 7. 추가 구현 필요 항목

### 7.1 번호 자원 화면의 실제 이동 인터페이스

현재 `apps/admin/src/features/numbers/numberResources.ts`는 `targetRoute`를 계산하고 `NumbersPage`는 이를 `설정 열기` 버튼으로 표시한다. 요구사항의 “해당 번호를 통해 해당 기능으로 즉시 접근”은 DID, 상담원 내선, 호 분배룰 내선, 기능 코드부터 구현했다.

구현 방향:

- `NumbersPage`의 `화면 이동` 열을 버튼으로 변경했다.
- `targetRoute`가 있으면 `useNavigate()`로 이동한다.
- `AgentSettingsPage`, `QueueSettingsPage`, `AsteriskConfigPage`, `DidsTab`, `LiveCallsPage`가 `resourceId`, `tab`, `feature` query를 처리한다.
- DID, 상담원 내선, 호 분배룰 내선은 대상 편집 화면으로 진입하고, 기능 코드는 실시간 콜 화면의 기능 안내로 연결한다.

판정: 구현 완료.

### 7.2 도움말 자동 구축의 완성도 보강

현재 구현은 정적 승인 도움말, 설정화면 파일명 기반 초안 생성, PDF 매뉴얼 텍스트 추출, 엑셀 초안 텍스트 추출, 검색 출처 JSON 병합까지 가능하다. 요구사항의 “매뉴얼과 정보 검색을 통해 자동 구축”은 2차 파이프라인까지 구현했지만, 완전 자동 운영을 위해서는 OCR과 DB 승인 워크플로가 더 필요하다.

남은 범위:

- PDF 매뉴얼 본문 추출 및 MMC/기능명/설정방법 자동 매핑은 구현했다.
- 엑셀 초안에서 기능명, 화면, 우선순위, 설정 항목 텍스트 추출은 구현했다.
- 설정화면 이미지는 파일명 기반 추출을 유지한다. OCR은 아직 미구현이다.
- 정보 검색 결과를 `source.kind = search`로 저장하고 검색일/출처를 남기는 JSON 병합을 구현했다. 검색 API 자동 호출은 아직 미구현이다.
- `AUTO_DRAFT`를 운영자가 `APPROVED`로 전환하는 관리자 검토 화면 또는 DB 워크플로.

판정: 2차 파이프라인 구현 완료, 승인 워크플로/OCR은 추가 구현 필요.

### 7.3 내선 잠금 정책 문서 정리

현재 구현에는 내선 잠금이 포함되어 있다.

근거:

- `agents.extensionLockMode`
- 상담원 생성/수정 DTO와 UI
- PBX 발신/전체 잠금 렌더링
- `agent.extensionLock` 도움말
- 렌더러 테스트 통과

기존 개발 계획 문서 중 일부는 “상담원 기준 사용 제한 정책, 별도 개발 제외”라고 정리되어 있어 요구사항 및 구현과 충돌했다. 2026-07-16에 현재 구현 기준으로 문서를 정정했다.

정리 방향:

- 내선 잠금은 `내선 번호 자원 잠금`이 아니라 `상담원/내선 엔드포인트 사용 제한 정책`으로 재정의한다.
- 현재 구현은 유지한다.
- 문서에서 “제외”가 아니라 “상담원/내선 엔드포인트 사용 제한 정책으로 수용 완료”로 정정했다.

판정: 구현 유지, 문서 정정 완료.

### 7.4 운영 환경 검증 필요 항목

다음 항목은 코드/테스트로는 확인했지만 실제 PBX 운영 환경에서 동작 확인이 필요하다.

- 무조건 착신 대상이 상담원/분배룰/외부번호일 때 실제 라우팅 결과.
- `SMART_NO_READY`, 대기시간 초과 착신전환의 실제 이벤트/큐 상태 연동.
- 대리응답이 실제 ringing call pickup까지 필요한지, 현재 queued call redirect 방식으로 충분한지.
- PBX 시간 조회 명령이 운영 PBX 버전에서 안정적으로 파싱되는지.
- 내선 잠금 `FULL_LOCKED`가 단말 등록 차단까지 필요한지, 현재 발신/내부통화 차단 수준으로 충분한지.

판정: 운영 검증 필요.

## 8. 불가능 또는 불수용 항목

| 항목 | 판단 | 이유 |
|---|---|---|
| 실시간 통화 감청 | 불수용 | 정책상 지원하지 않으며, 현재 CTI 요구 범위에서도 제외되어 있다. |
| 통화 감청 기능키/권한/API | 불수용 | 감청 기능을 우회적으로 제공하는 경로도 만들지 않는다. |
| PBX 설정 DB 초기화의 일반 UI 노출 | 불수용에 가까움 | 장애 복구 중에서도 위험도가 높아 별도 승인/Runbook 없이는 제공하면 안 된다. |
| 키버튼/전화기 종류별 버튼의 PBX 단독 구현 | 불가능 | PBX는 단말 버튼의 물리 위치, 라벨, LED, soft key 배열을 직접 제어하지 않는다. 버튼이 송신한 SIP 요청/DTMF/기능코드만 해석할 수 있으므로 단말 모델별 프로비저닝 없이는 구현할 수 없다. |
| 기존 PBX COS 전체 복제 | 불필요 | 현재 CTI 권한/발신제한/상담원 정책으로 필요한 기능만 분해해야 한다. |
| ARS 번호 별도 번호 자원화 | 불필요 | 고객이 다이얼하는 번호는 DID이고 ARS는 처리 흐름이다. |
| 가상버퍼 번호 할당 | 불필요 | 가상버퍼는 통화 분배 상태이지 다이얼 가능한 번호 자원이 아니다. |
| 내선/국선별 CLI slot 전체 복제 | 불필요 | 현 발신번호 정책과 지사-상담원 발신권한 매트릭스로 대체 가능하다. |

## 9. 보류 또는 후순위 항목

| 항목 | 보류 사유 | 승격 조건 |
|---|---|---|
| 국선 그룹 | 기본 발신 풀과 장애 우회 순서는 구현 완료. 지사별/요금 라우팅은 필요성 미확정 | 회선 인벤토리, 장애 판단 기준, 원복 정책, 지사/상담원/DID 기준 선택, 목적지 번호대/사업자별 라우팅 정책 확인 |
| 직통전화 | DID 직접 착신과 단축 발신은 구현 완료. 오프훅 자동 발신은 단말 정책 필요 | 오프훅 자동 발신 현장 시나리오와 단말 지원 여부 확정 |
| 브랜치 그룹 | CTI 지사와 단말 pickup group 의미가 다름 | 용어 재정의와 실제 당겨받기 요구 확인 |
| 내선별/공동 단축 다이얼 | tenant 공용 단축 발신은 구현 완료. 개인별 단축번호와 연락처 연동은 고객/연락처와 중복 가능 | 개인별 단축번호와 연락처 연동 요구 확인 |
| 키버튼/전화기 종류별 버튼 | PBX 단독 구현 불가. 단말 프로비저닝 성격 | 지원 단말 모델, 제조사별 프로비저닝 포맷, 소프트폰 키 정책 확정 |
| 시간 표시 방법 | 단말 표시 옵션 | 운영자가 CTI에서 관리해야 하는 근거 확인 |

## 10. 권장 실행 순서

1. 도움말 승인 워크플로가 필요하면 DB 테이블과 관리자 검토 화면 추가.
2. 설정화면 이미지 OCR 자동 추출 추가.
3. 검색 API 자동 수집이 필요하면 검색 출처 수집 작업을 별도 배치로 분리.
4. 운영 PBX 환경에서 착신전환, 대리응답, 무조건 착신, 시간 동기화 동작 검증. 실행 절차는 `docs/operations/pbx-operational-validation-runbook-20260716.md`를 기준으로 한다.
5. 국선 그룹 기본 발신 풀, DID 직접 착신, tenant 공용 단축 발신은 구현 완료 상태로 운영 검증한다. 오프훅 직통전화/지사 그룹과 국선 그룹 고급 라우팅은 현장 요구가 확정될 때까지 보류 유지.
