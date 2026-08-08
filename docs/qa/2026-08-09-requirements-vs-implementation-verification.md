# 요구사항 · 설계문서 대비 구현 검증 평가표

작성일: 2026-08-09
기준 커밋: `c8e2f62` (PR #8 병합 시점)
검증 실행: `apps/server` — 68 suite / 474 test 통과 (2026-08-09 최초 작성 시점)
개정일: 2026-08-09 — 미구현 3건(당겨받기 2초 규칙 · 서버 버전 · 기능코드 registry) 반영 후 갱신.
갱신 시점 검증: 서버 71 suite / 507 test, 관리자 39 file / 143 test 통과.

## 1. 결론

**원본 고객 요구사항 57건 중 실제로 못 쓰는 항목은 9건이고, 그중 2건만 구조적으로 불가능하다.**
나머지 7건은 "안 만들기로 한 것"(정책·범위 밖·후순위)이지 막힌 것이 아니다.

가장 중요한 사실 세 가지를 먼저 적는다.

1. **요구사항의 40%는 원문 그대로가 아니라 CTI 구조로 번역돼 구현됐다.** 표에서 `변경구현`으로 표시한
   항목이다. 예를 들어 "내선 서비스 등급표(MMC 301/701)"는 등급표가 아니라 상담원별 발신 카테고리
   권한(국내/대표번호/유료/국제)으로 구현돼 있다. **기능은 있지만 화면 이름이 달라서 없는 것처럼 보인다.**
   운영자 인수인계 때 이 대응 관계를 넘기지 않으면 "요구한 기능이 빠졌다"는 오해가 반드시 발생한다.
2. **원본 요구사항 자체에 번호대역 모순이 있다.** 같은 엑셀 안에서 내선 대역이 `2001~3499`(프로그램 시트)와
   `3001~3499`(주요연동 시트)로, 가상버퍼가 `3501~3999`와 `3501~3799`로 다르게 적혀 있다.
   현재 구현은 대역을 강제하지 않으므로 지금 당장 깨지지는 않지만, **확정 없이 운영에 들어가면 안 된다.**
3. **IPCC 우선순위 4건 중 2번(콜마너/올플릿 배차 API 연동)만 미착수다.** 나머지 3건(AI센터 전환,
   녹취 파이프라인, 보안·이중화)은 구현 또는 부분구현 상태다.

### 축별 집계

| 요구사항 축 | 건수 | 구현 | 변경구현 | 부분구현 | 미지원 | 불가능 |
|---|---:|---:|---:|---:|---:|---:|
| A. MMC 적용필요 (엑셀 노랑) | 42 | 13 | 8 | 12 | 7 | 2 |
| B. 주요확인 및 적용사항 | 4 | 2 | 1 | 1 | 0 | 0 |
| C. 주요연동 시트 | 11 | 5 | 4 | 2 | 0 | 0 |
| D. IPCC 구성도 우선순위 | 4 | 2 | 0 | 1 | 1 | 0 |
| E. 내부 설계문서 계약 | 5 | 4 | 0 | 1 | 0 | 0 |
| **합계** | **66** | **26** | **13** | **17** | **8** | **2** |

## 2. 평가 등급 정의

| 등급 | 의미 | 운영자가 알아야 할 것 |
|---|---|---|
| `구현` | 요구한 대로 동작한다. 스키마·API·화면·PBX 렌더링·테스트가 있다 | 그대로 쓴다 |
| `변경구현` | **기능은 있으나 요구서와 이름·형태가 다르다.** CTI 구조에 맞게 재해석했다 | **대응 관계를 인수인계해야 한다** |
| `부분구현` | 핵심 골격은 있으나 요구 범위 전체를 덮지 못한다 | 어디까지 되는지 경계를 알아야 한다 |
| `미지원` | 구현이 없다. 정책상 안 하거나, 범위 밖이거나, 후순위다 | 필요하면 별도 요청해야 한다 |
| `불가능` | 현재 구조에서 단독 구현이 불가능하다 | 선행 조건이 충족돼야 재검토 가능 |

`미지원`과 `불가능`은 다르다. **`미지원`은 결정의 결과이고 `불가능`은 제약의 결과다.**
`미지원`은 요청하면 만들 수 있고, `불가능`은 전제(단말 모델 확정 등)가 바뀌어야 한다.

## 3. 검증 방법

### 요구사항 원천

| 축 | 원천 | 추출 방법 |
|---|---|---|
| A | `docs/reference/IPPBX_개발시 참조용_20260104/1_비씨앤 IP PBX 초안_20260104.xlsx` `프로그램` 시트 | 셀 배경색 `FFFFFF00`(노랑 = "적용필요") 42건을 openpyxl 로 추출 |
| B | 같은 시트 우측 하단 `(주요확인 및 적용사항)` 블록 | 배경색 `theme9` 4건 |
| C | 같은 파일 `주요연동` 시트 | 전체 11행 |
| D | `docs/design/ipcc-priority-implementation-design-20260727.md` | 우선순위 4건 |
| E | `docs/design/cti-event-contract.md`, `operations-architecture.md`, `2026-08-07-external-cti-api-guide.md`, `admin-agent-gap-audit.md` | 계약·갭 항목 |

노랑 표시는 엑셀 상단 안내문 `1.노랑>적용필요` 에 근거한다. 즉 **MMC 전체 목록이 아니라
고객이 노랑으로 골라낸 42건이 요구 범위**다.

### 구현 확인 범위

`apps/server/prisma/schema.prisma`(60 모델), `apps/server/src/modules/`(26 모듈),
`apps/admin/src/app/router.tsx`(32 라우트), `apps/admin/src/features/`,
`apps/desktop/`, `apps/server/src/modules/asterisk-config/renderers/`.

### 실행 증거

```
cd apps/server && npm test
→ Test Suites: 68 passed, 68 total
  Tests:       474 passed, 474 total
```

**이 평가표는 코드 존재와 단위/통합 테스트까지만 확인했다.** 실 PBX 연동 동작은 확인하지 않았다
(6장 참조).

---

## 4. 축 A — MMC 적용필요 42건

### 4.1 구현 (13건)

| MMC | 요구 기능 | 구현 근거 |
|---:|---|---|
| 102 | 착신전환 지정 | `asteriskForwardingRules`, `forwardTriggerMode`(IMMEDIATE/AFTER_QUEUE_WAIT/SMART_NO_READY), `/settings/forwarding` 화면, dialplan 렌더링 |
| 104 | 내선 이름 변경 | `agents.extensionDisplayName`, PJSIP `callerid=<표시명> <내선>` 렌더링, 표시명 우선순위 테스트 |
| 302 | 대리응답 그룹 지정 | `POST /calls/:callId/pickup`, PJSIP `named_pickup_group` 렌더링, 같은 그룹 제한 검증 |
| 323 | 발신자 번호 지정 | `outboundCallerIdRules`, `agentBranchCallerIds`, `/settings/outbound-rules` 화면, `POST /outbound-rules/test` |
| 404 | 국선 이름 입력 | `AsteriskTrunk.name` (`@@unique([tenantId, name])`), 트렁크 CRUD |
| 507 | 링 모드 자동변환 시간 | `asteriskForwardingRules.scheduleJson`, dialplan 시간조건 렌더링, 복수 시간표 지원 |
| 509 | 공휴일 지정 | `tenantHolidayRules`, `/settings/holidays` 화면, 공휴일 우선 렌더링 테스트 |
| 603 | 국선그룹 지정 | `AsteriskTrunkGroup` + `AsteriskTrunkGroupMember`, `/asterisk-config/trunk-groups`, 그룹 기반 Dial 렌더링 |
| 705 | 공동 단축다이얼 입력 | `AsteriskSpeedDial`, `/asterisk-config/speed-dials`, `agent-phone-{내선}` context 렌더링 |
| 725 | 통화정보 출력 옵션 | SMDR TCP 3포트(로지 28002 / 아이콘 28003 / 콜마너 28004), Samsung OfficeServ CDR 122·154바이트 포맷 |
| 837 | SIP 옵션 지정 | `pjsip.renderer.ts` — transport(UDP/WS), DTLS, ICE, webrtc, codec, `sipRegisterPort`(48950) 시스템 설정 화면 |
| 850 | 시스템 자원 표시 | `GET /health`(DB·Redis·AMI + 콜/상담원/큐 요약), `GET /monitoring/metrics`(Prometheus), 관리자 모니터링 화면 |
| 851 | 시스템 알람 표시 | 대시보드 `AlertsPanel` — DB/Redis/AMI 단절, outbox 적체, 복구 타임아웃, stuck 콜, 큐 SLA·포기율 초과 경보 |

### 4.2 변경구현 (8건) — 이름이 다르니 인수인계 필수

| MMC | 요구 기능 | **실제 구현 형태** | 근거 |
|---:|---|---|---|
| 100 | 내선 잠금 | 단말 잠금이 아니라 **상담원 엔드포인트 사용 제한 정책** | `agents.extensionLockMode`, 발신/전체 잠금 dialplan 렌더링 |
| 109 | 날짜/시간 표시 형태(24시간) | 단말별 표시가 아니라 **시스템 전역 포맷 설정** | `tenantSystemSettings.dateFormat`, `timezone`, 시스템 설정 화면 |
| 110 | 가입자 기능 온/오프 | 통합 토글표가 아니라 **기능별 개별 정책으로 분해** | `agentMenuPermissions`, `extensionLockMode`, `settingsProfile.outboundDialPermissions` |
| 300 | 내선별 기능 온/오프 | 위와 동일 | 위와 동일 |
| 301 | 내선 서비스 등급(국제/시외/시내/구내) | 등급표가 아니라 **상담원별 발신 카테고리 권한** — `domestic` / `representative` / `paid` / `international` / `phoneDirect` | `common/outbound-dial-policy.util.ts`, `agents.settingsProfile`, `AgentEditModal.tsx`, `agent-dialplan.renderer.ts` |
| 501 | 시스템 시간변수 변경 | 통합 타이머표가 아니라 **기능별 개별 타이머** | `defaultMaxWaitSeconds`, `queueOverflowRules.waitSeconds`, `asteriskForwardingRules.queueWaitSeconds` |
| 505 | 시스템 날짜/시간 변경 | **변경이 아니라 조회 + 드리프트 감시.** 시간 설정은 OS/NTP 책임 | `GET /admin/settings/system/time-sync` → `pbxTime`, `driftSeconds` |
| 601 | 내선그룹 지정 | 내선 그룹이 아니라 **상담원 그룹** | `agentGroups`, `agents.agentGroupId`, `/settings/agent-groups`, 큐 멤버 그룹 추가 |

> MMC 301 은 오해가 가장 크게 생길 항목이다. 요구서의 "국제/시외/시내/구내" 4등급과
> 구현의 "국내/대표번호/유료/국제" 4카테고리는 **경계가 다르다.** 시외·시내를 구분하지 않는 대신
> 대표번호(15xx/16xx/18xx)와 유료(060)를 분리했다. 국내 통화 요금 구조에 맞춘 재설계지만,
> **요구서 기준으로 검수하면 "시외/시내 구분이 없다"는 지적이 나온다.**

### 4.3 부분구현 (12건) — 경계를 알아야 하는 항목

| MMC | 요구 기능 | 되는 것 | **안 되는 것** |
|---:|---|---|---|
| 210 | 시스템 온/오프 지정 | `tenantSystemSettings` 10개 항목(녹취, 직접발신 허용, 기본 대기시간, 발신번호 등) | MMC 210 원본 수준의 시스템 기능 전수 토글표 |
| 304 | 내선별 통화가능 국선 지정 | 지사–상담원 발신번호 매트릭스(`agentBranchCallerIds`), 국선 그룹 기본 발신 풀 | **내선 × 국선 개별 허용 매트릭스** |
| 306 | 직통전화 지정 | DID→내선 직결(`AsteriskDid.directExtension`), 공용 단축발신 | **오프훅 자동발신**(단말 지원·현장 정책 미확정) |
| 315 | 브랜치 그룹 지정 | 지사(`branches`) + 대리응답 pickup group | 요구서의 "브랜치 그룹"이 지사인지 단말 pickup 그룹인지 **용어 미확정** |
| 400 | 국선별 기능 온/오프 | 트렁크 `enabled`, codec, `displayNumber`, 그룹 소속 | 국선별 기능 전수 토글 |
| 407 | 국선 강제로 끊기 | `POST /calls/:callId/hangup` — **통화 단위** 강제 종료 | **국선(트렁크) 단위** 일괄 강제 끊기 |
| 714 | 내선 직접다이얼 변환표 | DID→내선 직결 매핑 | **자릿수 변환 규칙표**(수신번호 일부를 잘라 내선으로 변환) |
| 724 | 다이얼번호 변경 | `/numbers` 화면 — DID·내선·큐·기능코드 인덱스, 충돌 표시, 설정 화면 바로가기 | **전체 번호체계 일괄 변경 UI**(의도적 미채택 — 위험) |
| 805 | 프로그램 버전 표시 | **2026-08-09 반영.** `GET /admin/settings/system/version` (버전·커밋·빌드시각·가동시간) + 시스템 설정 화면 표시. 데스크톱은 `agentDesktopReleases` | `GIT_COMMIT`/`BUILD_TIME` 을 배포 파이프라인이 주입해야 커밋 식별이 된다 |
| 831 | MGI 파라미터 지정 | RTP 포트 대역·STUN 렌더링(`ASTERISK_RTP_START/END`, `ASTERISK_RTP_STUN_ADDRESS`) | **env 전용. 관리자 화면에서 못 바꾼다** |
| 840 | IP 전화기 정보 | `GET /asterisk-config/agents-sip` — 내선·SIP 비밀번호·**PJSIP 실시간 등록(contact) 상태** | 단말 모델/펌웨어/MAC 등 장비 인벤토리 |
| 841 | 시스템 IP 연동 정보 | `ASTERISK_EXTERNAL_MEDIA_ADDRESS`, `ASTERISK_LOCAL_NETS`, `external_signaling_address` 렌더링 | **env 전용. 관리자 화면 없음** |

### 4.4 미지원 (7건) — 만들 수 있으나 안 만든 것

| MMC | 요구 기능 | 사유 | 필요해지면 |
|---:|---|---|---|
| 103 | 전화기 응답모드 지정 | Auto Answer / Voice Announce 요구 시나리오 미확정. 코드 없음(`autoAnswer` 검색 0건) | 소프트폰/단말 정책으로 설계 |
| 105 | 개별(내선별) 단축다이얼 | 공용 단축발신(MMC 705)으로 1차 충족. 개인별은 고객·연락처 기능과 중복 소지 | 개인 단축번호 요구 확인 후 |
| 206 | 통화 감청 허용여부 | **정책상 불수용.** 실시간 감청은 지원하지 않기로 확정 | 정책 변경 필요 (아래 5장) |
| 701 | 서비스 등급표 지정 | COS 표 전체 복제 미채택. MMC 301 의 카테고리 권한으로 대체 | 등급표 형태가 꼭 필요하면 별도 설계 |
| 811 | 시스템 재시동 | Runbook 문서만 존재. API/UI 없음. 설정 reload(`POST /asterisk-config/reload`)는 있으나 재시동과 다름 | 강권한 + 2단계 확인 + 감사로그 정책 확정 후 |
| 830 | LAN 파라미터 지정 | OS/인프라 영역(compose·nginx). CTI 관리 범위 밖 | 인프라 관리 화면을 범위에 넣을 때 |
| 890 | 포트 초기화(강제끊기) | Runbook 계획만. "채널 정리 / 등록 초기화 / 설정 초기화"를 분리해야 함 | 위험도별 분리 설계 후 |

### 4.5 불가능 (2건)

| MMC | 요구 기능 | **왜 불가능한가** | 전제가 바뀌면 |
|---:|---|---|---|
| 722 | 내선별 키버튼 지정 | PBX 는 단말 버튼의 물리 위치·라벨·LED·soft key 배열을 **제어하지 않는다.** PBX 가 보는 것은 버튼을 누른 뒤 단말이 보낸 SIP 요청·DTMF·기능코드·`SUBSCRIBE/NOTIFY` 뿐이다. 버튼 매핑은 제조사별 프로비저닝 파일에서 정해진다 | 지원 단말 모델과 프로비저닝 포맷이 확정되면 **프로비저닝 서버 기능**으로 재검토 |
| 723 | 전화기 종류별 버튼 지정 | 위와 동일. 제조사마다 line key / DSS key / BLF key 명칭과 포맷이 다르다 | 위와 동일 |

> 이 2건은 "안 만든 것"이 아니라 **PBX 계층에서 접근할 수 없는 정보**다.
> 단말 프로비저닝(TFTP/HTTP config 배포)을 제품 범위에 넣지 않는 한 해결되지 않는다.

---

## 5. 축 B — 주요확인 및 적용사항 4건

| # | 요구 | 판정 | 근거 / 경계 |
|---:|---|---|---|
| 1 | soft phone 기능 | **구현** | `apps/desktop` — Electron 33 + `sip.js@0.21.2`, 등록/INVITE/미디어 협상, 통화단계별 8종 창 모드. 현재 버전 0.1.1 |
| 2 | SMDR 대체 기능 | **구현** | `modules/smdr` — 부팅 시 TCP 3포트 상시 개방, `call.ended` 시 Samsung OfficeServ CDR 라인 송출. 프로그램별 inbound/outbound 포함 규칙 분리 |
| 3 | TAPI 대체 기능 (open TSP) | **변경구현** | TAPI/TSP 드라이버가 아니라 **REST + Socket.IO 기반 외부 CTI API**. 계약: `docs/design/2026-08-07-external-cti-api-guide.md`. 통화 제어 21개 엔드포인트 + 7개 실시간 이벤트. **Windows TAPI 애플리케이션과 직접 호환되지 않는다** |
| 4 | 그룹 활성화·관리 (STN/SGP/TRK/TGP/V_EXT) + 번호대역 | **부분구현** | STN→`agents.extension`, SGP→`agentGroups`, TRK→`AsteriskTrunk`, TGP→`AsteriskTrunkGroup`, V_EXT→`sessionStatus=QUEUED` 가상버퍼 표시. **번호대역 기본값(2001~3499 등)을 설정·강제하는 기능은 없다** |

> 3번은 검수 리스크가 있다. 요구서 문구가 "tapi 대체 기능 (open TSP)" 이므로, 발주 측이
> **TSP 드라이버 자체**를 기대했다면 REST API 로는 충족되지 않는다. 기대 형태를 확인해야 한다.

---

## 6. 축 C — 주요연동 시트 11건

| # | 요구 | 판정 | 근거 / 경계 |
|---:|---|---|---|
| 1 | 소프트폰 (SIP STN) | 구현 | `apps/desktop`. "당겨받기 키 2초 이내 1회만 인정" 규칙은 **2026-08-09 반영** — Redis `SET PX 2000 NX` 로 상담원 단위 선점 |
| 2 | CTI 서버연동 | 구현 | AMI 정규화 → `linkedid` 세션 조립 → outbox → Redis Pub/Sub → `/ws`. **"실시간 감청 연동"은 정책상 미지원** |
| 3 | 국선 (SIP TRK) — KCT망 070 | 부분구현 | 트렁크 CRUD·PJSIP 렌더링·트렁크 그룹 구현. **실제 통신사 회선 연동 검증은 미실시** |
| 4 | 내선 (SIP STN) — 모임스톤 등 | 구현 | PJSIP endpoint/auth/aor 렌더링, 등록 상태 조회. 2초 규칙은 1번과 함께 반영됨 |
| 5 | 가상버퍼 생성 (3501~3799) | 변경구현 | **번호를 할당하지 않고** 큐 대기 상태(`QUEUED`)로 표시. 다이얼 가능한 번호 자원이 아니라는 판단 |
| 6 | 내선번호 생성 (3001~3499) | 부분구현 | `agents.extension` 자유 입력 + `/numbers` 충돌 검사. **대역 강제 없음** |
| 7 | ARS번호 생성 (6901~6999) | 변경구현 | 별도 번호 미채택. DID + `AsteriskIvrMenu` 로 처리 (고객이 누르는 건 DID, ARS 는 처리 흐름) |
| 8 | 국선번호 생성 (7001~7999) | 변경구현 | `AsteriskTrunk.displayNumber` 로 표시. 별도 번호 자원 아님 |
| 9 | 국선그룹 생성 (8001~8999) | 구현 | `AsteriskTrunkGroup`. 대역 강제는 없음 |
| 10 | 내선그룹 생성 (5000~5099) — SEQU/DIST/UNCON + OVERFLOW | 구현 | `queues.distributionMode`(SEQUENTIAL/DISTRIBUTE/UNCONDITIONAL) + `unconditionalTargetType/Value` + **`queueOverflowRules`** + `[queue-overflow]` dialplan |
| 11 | 각종 기능코드 생성 | 구현 | **2026-08-09 반영.** `featureCodes` registry(고정 카탈로그 4개) + `GET`/`PUT /asterisk-config/feature-codes` + `PBX 설정 > 기능코드` 화면 + agent-dialplan 렌더링. 대리응답은 네이티브 `Pickup()` 으로 단말 다이얼 지원. 실 PBX 검증은 미실시 |

### 6.1 원본 요구사항 내부 모순 — 결정 필요

| 자원 | `프로그램` 시트 | `주요연동` 시트 | 현재 구현 |
|---|---|---|---|
| 내선(STN) | `2001~3499` | `3001~3499` | 대역 강제 없음 (시드는 1001·2001 사용) |
| 가상버퍼(V_EXT) | `3501~3999` | `3501~3799` | 번호 미할당 |

**둘 다 채택할 수 없다.** 현재는 대역을 강제하지 않아 충돌이 드러나지 않지만,
번호 정책을 코드에 넣는 순간 어느 쪽을 따를지 정해야 한다.
참고로 현재 시드 계정 내선은 `1001`(상담원) / `2001`(수퍼바이저)로, **두 안 모두와 어긋난다.**

---

## 7. 축 D — IPCC 구성도 우선순위 4건

기준: `docs/design/ipcc-priority-implementation-design-20260727.md` (2026-07-27 설계)

| # | 우선순위 | 판정 | 구현 상태 |
|---:|---|---|---|
| 1 | IVR/Queue 대기 초과 시 AI센터 전환 | **구현** | `queueOverflowRules`(triggerMode/waitSeconds/targetType/targetValue/priority) + `queues.service.ts` CRUD + `dialplan.renderer.ts` `[queue-overflow]`·`[queue-overflow-timeout]` + `QueueCreateModal`/`QueueEditModal` UI |
| 2 | 콜마너/올플릿 접수·배차 API 연동 | **미지원** | 설계상 `dispatch-integrations` 모듈·adapter·outbox·`serviceType`·멱등키가 필요하나 **모듈 없음.** 현재 `integrationAutomations` 는 `VIX_PHONE`/`VIX_SMS`/`WEBHOOK`/`SLACK_WEBHOOK` 4종 범용 연동만 지원 |
| 3 | 녹취 수집·보관·장애복구·암호화 | **구현** | `recording-pipeline` 모듈 — finalizer(15초 sweep, 리더 전용) / storage / retention(기본 1095일=3년) / **encryption(AES-256-GCM, `iv(12)+tag(16)` append)** / reconcile. 스테레오 RAW→WAV 재생 지원. **화자분리(diarization)는 설계대로 미구현** |
| 4 | 보안 및 이중화 | **부분구현** | 되는 것: SIP INVITE/REGISTER 남용 차단(`sip-security`), DB 장애 대응(`resilience` — 운영모드/스풀/LKG), JWT + 역할 + 메뉴 RBAC, WebRTC DTLS. **안 되는 것: MFA(TOTP), 관리자 IP allowlist, 통합 감사로그, 민감필드 암호화(`SensitiveFieldCryptoService`)** — 4개 모두 검색 0건 |

> 4번의 미구현 4종은 **인증(ISMS-P 등) 준비 항목**이다. 지금 없다고 운영이 막히지는 않지만,
> 보안 심사를 받는다면 선행 과제다. 감사로그는 도메인별로만 존재한다
> (`callRecordingAccessAuditLogs`, `agentDesktopUpdateAuditLogs`, `recoveryAuditLog`) — 통합 감사로그가 아니다.

---

## 8. 축 E — 내부 설계문서 계약

| 설계 문서 | 계약 항목 | 판정 | 근거 |
|---|---|---|---|
| `cti-event-contract.md` | 실시간 이벤트 7종 | **구현** | 7종 전부 발행처 확인: `call.created`/`call.updated`/`call.ended`·`screenpop.customer`(`outbox-publisher.service.ts:39`)·`agent.status.changed`·`queue.summary.updated`(`auth.service.ts`)·`announcement.pushed`(`admin.service.ts`) |
| `operations-architecture.md` | 리더선출·outbox·세션복구·멀티노드 | **구현** | `AmiLeaderElectionService`(Redis `SET NX PX`, 5초 갱신 + `leadershipKnown` 구분), `OutboxPublisherService`, `SessionRecoverySweeperService`, `RecordingFinalizerService` — 4개 주기 작업 모두 리더 가드 |
| `2026-08-07-external-cti-api-guide.md` | 외부 연동 REST/WS 계약 | **구현** | `calls.controller.ts` 21개 엔드포인트(originate/transfer/consultation/pickup/answer/mute/hold/resume/memo/hangup/recordings) |
| `admin-agent-gap-audit.md` P0 #1 | 상담원 앱 실시간 이벤트 정합성 | **해소** | 감사 시점(2026-04-19)에 미발행이던 3개 이벤트가 현재 모두 발행됨 |
| `system-design.md` / `pbx-config-mapping.md` | PBX conf 렌더링 파이프라인 | **부분구현** | 6개 렌더러(pjsip/dialplan/agent-dialplan/queues/rtp/musiconhold) + 검증 + AMI reload 구현. **실 PBX 반영 검증은 미실시** |

---

## 9. 검증하지 못한 것

이 평가표는 **코드와 테스트까지만** 확인했다. 아래는 확인하지 않았으므로 "구현"으로 적힌 항목도
실환경 동작을 보장하지 않는다.

| 미검증 항목 | 왜 못 했나 | 확인 방법 |
|---|---|---|
| 실 PBX 연동 동작 전반 | 로컬에 PBX/AMI 없음 | `docs/operations/pbx-operational-validation-runbook-20260716.md` |
| 통신사 SIP Trunk(070) 실회선 | 회선 미확보 | `docs/design/sip-trunk-spec-template.md` 로 통신사 요청 |
| Queue overflow → AI센터 실제 전환 | 위와 동일 | 렌더링된 dialplan + 실호 테스트 |
| 녹취 암호화 후 재생 end-to-end | 실 MixMonitor 파일 필요 | 운영 리허설 |
| PostgreSQL HA / Patroni / pgBackRest | 로컬 Docker 미가동 | `docs/operations/2026-08-08-db-ha-resilience-runbook.md` |
| Prisma 스키마 드리프트 170건 | 실 DB 필요 | `docs/plans/2026-08-08-prisma-schema-drift-plan.md` |

---

## 10. 권장 조치

### 즉시 결정이 필요한 것 (개발 아님, 판단)

1. **번호대역 확정** — 6.1의 모순 두 건. 확정 전에는 번호 정책을 코드에 넣지 않는다.
2. **"TAPI 대체(open TSP)"의 기대 형태 확인** — REST API 로 충족인지, TSP 드라이버가 필요한지.
   후자면 별도 제품 범위다.
3. **MMC 301 등급 경계 합의** — 요구서의 "국제/시외/시내/구내" vs 구현의
   "국내/대표번호/유료/국제". 시외·시내 구분이 실제로 필요한지 확인.
4. **"브랜치 그룹"(MMC 315) 용어 확정** — CTI 지사인지 단말 pickup 그룹인지.

### 구현이 필요한 것 (우선순위 순)

1. **콜마너/올플릿 배차 API 연동** (IPCC 우선순위 2) — 유일한 미착수 우선순위. 설계는 이미 있다.
2. ~~기능코드 registry~~ · ~~당겨받기 2초 중복 억제~~ · ~~서버 버전 조회 엔드포인트~~ — **2026-08-09 완료.**
   기능코드는 [`docs/plans/2026-08-09-feature-code-registry-plan.md`](../plans/2026-08-09-feature-code-registry-plan.md) 참조.
3. **보안 4종** (MFA / 관리자 IP allowlist / 통합 감사로그 / 민감필드 암호화) — 인증 심사 예정이면 선행.

### 문서 조치

- 이 평가표의 **4.2 변경구현 8건 대응표를 운영자 인수인계 문서에 포함한다.** 이것을 넘기지 않으면
  검수 단계에서 "요구 기능 누락"으로 잘못 판정된다.

---

## 관련 문서

- 선행 매핑표: [`docs/design/pbx-requirements-implementation-mapping-20260716.md`](../design/pbx-requirements-implementation-mapping-20260716.md)
- 요구사항 분석 원본: [`docs/design/samsung-pbx-requirements-analysis-20260513.md`](../design/samsung-pbx-requirements-analysis-20260513.md)
- 보류 근거: [`docs/plans/pbx-deferred-feature-backlog-20260522.md`](../plans/pbx-deferred-feature-backlog-20260522.md)
- IPCC 설계: [`docs/design/ipcc-priority-implementation-design-20260727.md`](../design/ipcc-priority-implementation-design-20260727.md)
- 운영 검증 절차: [`docs/operations/pbx-operational-validation-runbook-20260716.md`](../operations/pbx-operational-validation-runbook-20260716.md)
