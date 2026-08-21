# 요구사항 · 구현 대비 통합 비교표

작성일: 2026-08-19
기준 커밋: `5794079` (브랜치 `docs/requirements-implementation-assessment`)
원본 평가표: [`2026-08-09-requirements-vs-implementation-verification.md`](2026-08-09-requirements-vs-implementation-verification.md)

## 이 문서의 성격

원본 평가표는 요구사항 66건을 축별로 5개 절에 나눠 담았고, 절마다 컬럼 모양이 달라 한눈에 비교하기 어렵다.
이 문서는 **같은 66건을 판정 컬럼 하나로 정렬한 단일 테이블**이다. 새 판정을 내리지 않았다.

- **판정은 2026-08-09 평가표를 승계한다.** 기준 커밋 이후 기능 커밋이 없다
  (`ef4cc61` 이후는 prisma 포맷 되돌림·작업 로그 2건뿐).
- **테스트를 재실행하지 않았다.** 원본의 실행 증거(서버 71 suite / 507 test, 관리자 39 file / 143 test,
  2026-08-09)를 인용한다. 이 문서 작성 시점의 신규 실행 증거는 없다.
- 대신 판정이 뒤집힐 위험이 큰 9개 항목만 **코드 존재를 재확인**했다 (아래 "재확인한 항목").
- 원본과 마찬가지로 **실 PBX 연동 동작은 확인 범위 밖이다.**

## 집계 (66건)

| 축 | 건수 | 구현 | 변경구현 | 부분구현 | 미지원 | 불가능 |
|---|---:|---:|---:|---:|---:|---:|
| A. MMC 적용필요 (엑셀 노랑) | 42 | 13 | 8 | 12 | 7 | 2 |
| B. 주요확인 및 적용사항 | 4 | 2 | 1 | 1 | 0 | 0 |
| C. 주요연동 시트 | 11 | 6 | 3 | 2 | 0 | 0 |
| D. IPCC 구성도 우선순위 | 4 | 2 | 0 | 1 | 1 | 0 |
| E. 내부 설계문서 계약 | 5 | 4 | 0 | 1 | 0 | 0 |
| **합계** | **66** | **27** | **12** | **17** | **8** | **2** |

> **원본 집계표와 C축 숫자가 다르다.** 원본 1장 집계표는 C축을 `구현 5 / 변경구현 4`로 적었지만,
> 6장 본문에는 C-11(기능코드)이 2026-08-09 반영으로 `구현`으로 올라가 있다. 본문 기준이 맞고
> **집계표가 갱신에서 빠졌다.** 위 표는 본문 기준(`구현 6 / 변경구현 3`)이다. 총 66건과 나머지 축은 동일하다.

### 등급 정의

| 등급 | 의미 |
|---|---|
| `구현` | 요구한 대로 동작한다 (스키마·API·화면·PBX 렌더링·테스트 존재) |
| `변경구현` | 기능은 있으나 **요구서와 이름·형태가 다르다.** 대응 관계를 인수인계해야 한다 |
| `부분구현` | 골격은 있으나 요구 범위 전체를 덮지 못한다 |
| `미지원` | 구현 없음. **결정의 결과** (정책·범위 밖·후순위) — 요청하면 만들 수 있다 |
| `불가능` | **제약의 결과.** 현재 구조에서 단독 구현 불가. 전제가 바뀌어야 재검토 |

---

## 통합 비교표

| 축 | # | 요구 기능 | 판정 | 구현 위치 | 경계 / 인수인계 주의 |
|---|---:|---|---|---|---|
| A | 100 | 내선 잠금 | 변경구현 | `agents.extensionLockMode`, 발신/전체 잠금 dialplan | 단말 잠금이 아니라 **엔드포인트 사용 제한 정책** |
| A | 102 | 착신전환 지정 | 구현 | `asteriskForwardingRules.forwardTriggerMode`, `/settings/forwarding`, dialplan | IMMEDIATE / AFTER_QUEUE_WAIT / SMART_NO_READY |
| A | 103 | 전화기 응답모드 지정 | 미지원 | 없음 (`autoAnswer` 검색 0건) | Auto Answer / Voice Announce 시나리오 미확정 |
| A | 104 | 내선 이름 변경 | 구현 | `agents.extensionDisplayName`, PJSIP `callerid` 렌더링 | — |
| A | 105 | 개별(내선별) 단축다이얼 | 미지원 | 없음 | 공용 단축발신(705)으로 1차 충족. 개인별은 고객·연락처와 중복 소지 |
| A | 109 | 날짜/시간 표시 형태 | 변경구현 | `tenantSystemSettings.dateFormat` / `timezone` | 단말별이 아니라 **시스템 전역 포맷** |
| A | 110 | 가입자 기능 온/오프 | 변경구현 | `agentMenuPermissions`, `extensionLockMode`, `settingsProfile` | 통합 토글표 없음. **기능별 개별 정책으로 분해** |
| A | 206 | 통화 감청 허용여부 | 미지원 | 없음 | **정책상 불수용.** 실시간 감청 미지원 확정 |
| A | 210 | 시스템 온/오프 지정 | 부분구현 | `tenantSystemSettings` 10개 항목 | 원본 수준의 **시스템 기능 전수 토글표**는 없음 |
| A | 300 | 내선별 기능 온/오프 | 변경구현 | 110 과 동일 | 110 과 동일 |
| A | 301 | 내선 서비스 등급 | 변경구현 | `common/outbound-dial-policy.util.ts`, `agents.settingsProfile`, `agent-dialplan.renderer.ts` | 요구서 "국제/시외/시내/구내" vs 구현 "국내/대표번호/유료/국제". **경계가 다르다 — 오해 1순위** |
| A | 302 | 대리응답 그룹 지정 | 구현 | `POST /calls/:callId/pickup`, PJSIP `named_pickup_group` | 같은 그룹만 허용 |
| A | 304 | 내선별 통화가능 국선 지정 | 부분구현 | `agentBranchCallerIds`, 국선 그룹 발신 풀 | **내선 × 국선 개별 허용 매트릭스는 없음** |
| A | 306 | 직통전화 지정 | 부분구현 | `AsteriskDid.directExtension`, 공용 단축발신 | **오프훅 자동발신 없음** (단말 지원·현장 정책 미확정) |
| A | 315 | 브랜치 그룹 지정 | 부분구현 | `branches` + pickup group | **용어 미확정** — 지사인지 단말 pickup 그룹인지 |
| A | 323 | 발신자 번호 지정 | 구현 | `outboundCallerIdRules`, `agentBranchCallerIds`, `POST /outbound-rules/test` | — |
| A | 400 | 국선별 기능 온/오프 | 부분구현 | 트렁크 `enabled` / codec / `displayNumber` / 그룹 소속 | 국선별 기능 전수 토글은 없음 |
| A | 404 | 국선 이름 입력 | 구현 | `AsteriskTrunk.name` (`@@unique([tenantId, name])`) | — |
| A | 407 | 국선 강제로 끊기 | 부분구현 | `POST /calls/:callId/hangup` (통화 단위) | **트렁크 단위 일괄 강제 끊기는 없음** |
| A | 501 | 시스템 시간변수 변경 | 변경구현 | `defaultMaxWaitSeconds`, `queueOverflowRules.waitSeconds`, `asteriskForwardingRules.queueWaitSeconds` | 통합 타이머표가 아니라 **기능별 개별 타이머** |
| A | 505 | 시스템 날짜/시간 변경 | 변경구현 | `GET /admin/settings/system/time-sync` (`pbxTime`, `driftSeconds`) | **변경이 아니라 조회 + 드리프트 감시.** 시간 설정은 OS/NTP 책임 |
| A | 507 | 링 모드 자동변환 시간 | 구현 | `asteriskForwardingRules.scheduleJson`, dialplan 시간조건 | 복수 시간표 지원 |
| A | 509 | 공휴일 지정 | 구현 | `tenantHolidayRules`, `/settings/holidays` | 공휴일 우선 렌더링 테스트 있음 |
| A | 601 | 내선그룹 지정 | 변경구현 | `agentGroups`, `agents.agentGroupId`, `/settings/agent-groups` | 내선 그룹이 아니라 **상담원 그룹** |
| A | 603 | 국선그룹 지정 | 구현 | `AsteriskTrunkGroup` + `AsteriskTrunkGroupMember`, `/asterisk-config/trunk-groups` | 그룹 기반 Dial 렌더링 |
| A | 701 | 서비스 등급표 지정 | 미지원 | 없음 | COS 표 전체 복제 미채택. 301 카테고리 권한으로 대체 |
| A | 705 | 공동 단축다이얼 입력 | 구현 | `AsteriskSpeedDial`, `agent-phone-{내선}` context | — |
| A | 714 | 내선 직접다이얼 변환표 | 부분구현 | DID→내선 직결 매핑 | **자릿수 변환 규칙표 없음** |
| A | 722 | 내선별 키버튼 지정 | 불가능 | — | PBX 는 단말 버튼 위치·라벨·LED 를 제어하지 않는다. **프로비저닝 계층** |
| A | 723 | 전화기 종류별 버튼 지정 | 불가능 | — | 722 와 동일. 제조사별 line / DSS / BLF key 포맷 상이 |
| A | 724 | 다이얼번호 변경 | 부분구현 | `/numbers` — DID·내선·큐·기능코드 인덱스 + 충돌 표시 | **전체 번호체계 일괄 변경 UI 는 의도적 미채택** (위험) |
| A | 725 | 통화정보 출력 옵션 | 구현 | SMDR TCP 3포트(로지 28002 / 아이콘 28003 / 콜마너 28004), OfficeServ CDR 122·154B | 포맷 수정 시 **3개 프로그램 축 전부** 확인 |
| A | 805 | 프로그램 버전 표시 | 부분구현 | `GET /admin/settings/system/version` + 시스템 설정 화면, `agentDesktopReleases` | `GIT_COMMIT` / `BUILD_TIME` 을 **배포 파이프라인이 주입해야** 커밋 식별 가능 |
| A | 811 | 시스템 재시동 | 미지원 | Runbook 문서만 | 설정 reload 는 있으나 재시동과 다름. 강권한 + 2단계 확인 + 감사로그 필요 |
| A | 830 | LAN 파라미터 지정 | 미지원 | 없음 (compose · nginx 영역) | OS / 인프라 범위 |
| A | 831 | MGI 파라미터 지정 | 부분구현 | `ASTERISK_RTP_START/END`, `ASTERISK_RTP_STUN_ADDRESS` 렌더링 | **env 전용. 관리자 화면에서 못 바꾼다** |
| A | 837 | SIP 옵션 지정 | 구현 | `pjsip.renderer.ts` (UDP/WS, DTLS, ICE, codec), `sipRegisterPort` 48950 | WS 8088 은 하드코딩 |
| A | 840 | IP 전화기 정보 | 부분구현 | `GET /asterisk-config/agents-sip` (내선·비밀번호·PJSIP contact 상태) | **단말 모델 / 펌웨어 / MAC 인벤토리 없음** |
| A | 841 | 시스템 IP 연동 정보 | 부분구현 | `ASTERISK_EXTERNAL_MEDIA_ADDRESS`, `ASTERISK_LOCAL_NETS` 렌더링 | **env 전용. 관리자 화면 없음** |
| A | 850 | 시스템 자원 표시 | 구현 | `GET /health`, `GET /monitoring/metrics`, 모니터링 화면 | — |
| A | 851 | 시스템 알람 표시 | 구현 | 대시보드 `AlertsPanel` | DB/Redis/AMI 단절, outbox 적체, stuck 콜, 큐 SLA |
| A | 890 | 포트 초기화(강제끊기) | 미지원 | Runbook 계획만 | "채널 정리 / 등록 초기화 / 설정 초기화" 위험도별 분리 설계 필요 |
| B | 1 | soft phone 기능 | 구현 | `apps/desktop` — Electron 33 + `sip.js@0.21.2`, 창 모드 8종 | 현재 0.1.1 |
| B | 2 | SMDR 대체 기능 | 구현 | `modules/smdr` — TCP 3포트 상시 개방, `call.ended` 시 CDR 송출 | 프로그램별 inbound/outbound 규칙 분리 |
| B | 3 | TAPI 대체 (open TSP) | 변경구현 | REST 21개 + Socket.IO 7종 (`2026-08-07-external-cti-api-guide.md`) | **TSP 드라이버가 아니다. Windows TAPI 앱과 직접 호환 안 됨 — 기대 형태 확인 필요** |
| B | 4 | 그룹 활성화·관리 (STN/SGP/TRK/TGP/V_EXT) | 부분구현 | STN→`agents.extension`, SGP→`agentGroups`, TRK/TGP→트렁크(그룹), V_EXT→`QUEUED` | **번호대역 기본값을 설정·강제하는 기능 없음** |
| C | 1 | 소프트폰 (SIP STN) | 구현 | `apps/desktop`, 당겨받기 2초 규칙 = `PICKUP_DEBOUNCE_MS` + Redis `SET PX NX` | 2026-08-09 반영 |
| C | 2 | CTI 서버연동 | 구현 | AMI 정규화 → `linkedid` 세션 → outbox → Redis Pub/Sub → `/ws` | **"실시간 감청 연동"은 정책상 미지원** |
| C | 3 | 국선 (SIP TRK) — KCT망 070 | 부분구현 | 트렁크 CRUD · PJSIP 렌더링 · 트렁크 그룹 | **실 통신사 회선 연동 검증 미실시** |
| C | 4 | 내선 (SIP STN) — 모임스톤 등 | 구현 | PJSIP endpoint / auth / aor 렌더링, 등록 상태 조회 | 2초 규칙은 C-1 과 함께 반영 |
| C | 5 | 가상버퍼 생성 (3501~3799) | 변경구현 | 큐 대기 상태(`QUEUED`) 표시 | **번호를 할당하지 않는다.** 다이얼 가능한 자원 아님 |
| C | 6 | 내선번호 생성 (3001~3499) | 부분구현 | `agents.extension` 자유 입력 + `/numbers` 충돌 검사 | **대역 강제 없음** |
| C | 7 | ARS번호 생성 (6901~6999) | 변경구현 | DID + `AsteriskIvrMenu` | 별도 번호 자원 미채택 |
| C | 8 | 국선번호 생성 (7001~7999) | 변경구현 | `AsteriskTrunk.displayNumber` | 별도 번호 자원 아님 |
| C | 9 | 국선그룹 생성 (8001~8999) | 구현 | `AsteriskTrunkGroup` | 대역 강제 없음 |
| C | 10 | 내선그룹 생성 (5000~5099) + OVERFLOW | 구현 | `queues.distributionMode`(SEQU/DIST/UNCON) + `queueOverflowRules` + `[queue-overflow]` | — |
| C | 11 | 각종 기능코드 생성 | 구현 | `featureCodes` 모델 + `GET`/`PUT /asterisk-config/feature-codes` + `FeatureCodesTab` + agent-dialplan | 2026-08-09 반영. 고정 카탈로그 4개. **실 PBX 검증 미실시** |
| D | 1 | IVR/Queue 초과 시 AI센터 전환 | 구현 | `queueOverflowRules` + `queues.service.ts` + `[queue-overflow]` · `[queue-overflow-timeout]` + 큐 모달 | 실 전환 동작 미검증 |
| D | 2 | 콜마너/올플릿 접수·배차 API 연동 | 미지원 | 없음 (`dispatch-integrations` 검색 0건) | **유일한 미착수 우선순위.** 설계는 이미 있음. 현 `integrationAutomations` 는 범용 4종뿐 |
| D | 3 | 녹취 수집·보관·장애복구·암호화 | 구현 | `recording-pipeline` — finalizer / storage / retention(1095일) / encryption(AES-256-GCM) / reconcile | **화자분리(diarization) 미구현.** 암호화 후 재생 e2e 미검증 |
| D | 4 | 보안 및 이중화 | 부분구현 | `sip-security`, `resilience`(운영모드 / 스풀 / LKG), JWT + 역할 + 메뉴 RBAC, WebRTC DTLS | **MFA(TOTP) / 관리자 IP allowlist / 통합 감사로그 / 민감필드 암호화 4종 없음** (검색 0건) |
| E | 1 | 실시간 이벤트 7종 (`cti-event-contract.md`) | 구현 | `outbox-publisher.service.ts`, `auth.service.ts`, `admin.service.ts` 에서 7종 전부 발행 | — |
| E | 2 | 리더선출 · outbox · 세션복구 · 멀티노드 (`operations-architecture.md`) | 구현 | `AmiLeaderElection` / `OutboxPublisher` / `SessionRecoverySweeper` / `RecordingFinalizer` | 주기 작업 4개 모두 리더 가드 |
| E | 3 | 외부 연동 REST/WS 계약 | 구현 | `calls.controller.ts` 21개 엔드포인트 | B-3 의 TSP 이슈와 연동 |
| E | 4 | 상담원 앱 실시간 이벤트 정합성 (P0 #1) | 구현(해소) | 감사 시점 미발행 3개 이벤트 현재 모두 발행 | — |
| E | 5 | PBX conf 렌더링 파이프라인 | 부분구현 | 렌더러 6종 + 검증 + AMI reload | **실 PBX 반영 검증 미실시** |

---

## 재확인한 항목 (2026-08-19, 코드 존재만)

판정이 뒤집히면 영향이 큰 항목만 골라 코드 존재를 다시 확인했다. 9건 모두 원본 판정과 일치한다.

| 확인 대상 | 결과 |
|---|---|
| 기능코드 registry (C-11) | `prisma/schema.prisma:1376` `model featureCodes`, `feature-codes.service.spec.ts`, `FeatureCodesTab.tsx` 존재 |
| 서버 버전 조회 (A-805) | `admin.controller.ts:383` `@Get('settings/system/version')`, 관리자 화면 표시 존재 |
| 당겨받기 2초 규칙 (C-1) | `calls.service.ts:59` `PICKUP_DEBOUNCE_MS = 2_000`, `:1274` Redis `set(key,'1','PX',...,'NX')` |
| 큐 오버플로 (C-10 / D-1) | `queueOverflowRules` 스키마 존재 |
| 녹취 암호화 (D-3) | `recording-encryption.service.ts` `aes-256-gcm` (cipher / decipher) |
| 배차 API 모듈 (D-2) | `dispatch-integrations` 0건 → **미지원 확인** |
| 민감필드 암호화 (D-4) | `SensitiveFieldCrypto` 0건 → **미지원 확인** |
| MFA / IP allowlist (D-4) | `totp` / `TOTP` / `ipAllowlist` 0건 → **미지원 확인** |
| 응답모드 (A-103) | `autoAnswer` 0건 → **미지원 확인** |

## 판정과 별개로 결정이 필요한 것

개발이 아니라 판단이 필요한 항목이다. 원본 10장과 동일하며, **확정 전에는 번호 정책을 코드에 넣지 않는다.**

1. **번호대역 확정** — 원본 요구사항 내부 모순. 내선 `2001~3499`(프로그램 시트) vs `3001~3499`(주요연동 시트),
   가상버퍼 `3501~3999` vs `3501~3799`. 현재 시드 내선은 `1001` / `2001` 로 **두 안 모두와 어긋난다.**
2. **"TAPI 대체(open TSP)" 기대 형태** (B-3) — REST 로 충족인지, TSP 드라이버가 필요한지. 후자면 별도 제품 범위.
3. **MMC 301 등급 경계 합의** — 시외 · 시내 구분이 실제로 필요한지.
4. **"브랜치 그룹"(A-315) 용어 확정** — CTI 지사인지 단말 pickup 그룹인지.

## 관련 문서

- 원본 평가표(판정 근거 · 서술): [`2026-08-09-requirements-vs-implementation-verification.md`](2026-08-09-requirements-vs-implementation-verification.md)
- 작업 로그: [`../work-log/2026-08-09-requirements-assessment-and-gap-fixes-worklog.md`](../work-log/2026-08-09-requirements-assessment-and-gap-fixes-worklog.md)
- 선행 매핑표: [`../design/pbx-requirements-implementation-mapping-20260716.md`](../design/pbx-requirements-implementation-mapping-20260716.md)
- 운영 검증 절차: [`../operations/pbx-operational-validation-runbook-20260716.md`](../operations/pbx-operational-validation-runbook-20260716.md)
