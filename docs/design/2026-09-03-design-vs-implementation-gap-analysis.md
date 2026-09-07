# 설계 대비 구현 갭 분석

작성일: 2026-09-03
기준 커밋: `d7299d9` (`main`)
대상: `docs/reference/01~03` 설계 PDF 3종 · 요구사항 66건 평가표(2026-08-19) · 2026-08-19 이후 설계서 5건 · `plans/project-integrated-plan.md` 잔여 과제
검증 실행 (이 문서 작성 시점, 2026-09-03):

| 앱 | 명령 | 결과 |
|---|---|---|
| `apps/server` | `npx jest` | 161 suite / **1,509 passed** (124초) |
| `apps/admin` | `npx vitest run` | 64 file / **346 passed** |
| `apps/web` | `npx vitest run` | 6 file / **38 passed** |
| `apps/desktop` (Electron) | `npx vitest run` | 38 file / **222 passed** |
| `apps/desktop-win` (C#) | `dotnet test` | **718 passed**, 0 failed |

## 0. 결론

**원 설계서(PDF 3종)가 정한 범위는 전부 구현됐고, 그 위에 설계서에 없던 기능이 6개 영역만큼 더 붙었다.
지금 남은 갭은 "기능이 없다"가 아니라 세 종류다 — ① 신규 사이트를 세울 때 막히는 설치 결함 3건,
② 실 PBX 에서 아직 한 번도 확인하지 않은 경로 7건, ③ 결정 없이 굳혀 둘 수 없는 정책 4건.**

가장 중요한 사실 다섯 가지를 먼저 적는다.

1. **테넌트를 만드는 경로가 데모 시드뿐이다.** `tenants` 를 만드는 코드는 `prisma/seed.ts` 하나이고
   (`grep tenants.create|upsert` 결과 1건), 플랫폼 관리자 API 는 목록 조회만 있다
   (`platform-tenants.controller.ts` — `GET` 하나). 신규 사이트는 데모 계정(`agent1001 / Password123!`)이 함께
   생기는 시드를 돌리거나 SQL 을 직접 넣어야 한다. **설치 매뉴얼이 이 우회를 적어야 하고, 제품은 이것을 고쳐야 한다.**
   → **2026-09-03 반영**: `TenantBootstrapService` 가 `TENANT_BOOTSTRAP_*` env 로 첫 테넌트와 `admin` 을 만든다 (8.1 참조).
2. **2026-08-19 평가 이후 156커밋(787파일, +89,566줄)이 들어왔고, 66건 중 판정이 바뀐 것은 6건이다.**
   나머지 60건은 그때 판정이 그대로 유효하다 (3장).
3. **실 PBX 검증은 "전혀 없음"에서 "개발 PBX 에서 등록·발신·수신·양방향 음성·토큰 회전까지 확인"으로 올라왔다**
   (`qa/2026-08-20-csharp-softphone-phase1-verification.md` 6~12장). 그러나 에코, 큐 오버플로 전환, 녹취 암호화 후 재생,
   ARS 플로우·HTTP_LOOKUP 실통화, AI 분석 실녹취는 아직 사람이 걸어 본 적이 없다 (7장).
4. **상담원 데스크톱이 두 벌이다.** Electron(`apps/desktop`)과 C#(`apps/desktop-win` 1.0.0, 개발서버에 배포됨)이
   병행 유지 중이며, 설계서는 "현장 검증 후 교체"라고 적었다. CI 는 Electron 만 돈다. 교체 시점 결정이 필요하다.
5. **인증·보안 4종(MFA · 관리자 IP allowlist · 통합 감사로그 · 민감필드 암호화)은 여전히 없다.** 감사로그는 도메인별 5개
   테이블로 흩어져 있고(`*AuditLog*` 모델 5개), 로그인 감사는 `lastLoginAt` 한 컬럼뿐이다.

## 1. 비교 기준과 방법

| 축 | 원천 | 이 문서에서 하는 일 |
|---|---|---|
| A | `reference/01_project_overview.pdf`, `02_practical_design.pdf`(10p), `03_db_api_asterisk_spec.pdf`(14p) | 설계서 항목을 하나씩 코드와 대조 (2장). **이 세 문서를 코드와 직접 대조한 것은 이번이 처음이다** — 08-09 평가표는 고객 엑셀을 원천으로 썼다 |
| B | `qa/2026-08-19-requirements-implementation-comparison-verification.md` 66건 | 판정을 승계하고, 이후 커밋으로 바뀐 것만 다시 판정 (3장) |
| C | `design/2026-08-20-csharp-desktop-client-design.md`, `2026-09-01-ars-flow-builder-design.md`, `2026-09-01-feature-entitlement-design.md`, `2026-09-02-ars-http-lookup-design.md`, `plans/2026-09-01-ai-layer-plan.md` | 설계 범위 대비 구현 완료·미완 (4장) |
| D | `plans/project-integrated-plan.md` 8장 P0/P1/P2 | 잔여 과제 현황 (5장) |

판정 등급은 08-09 평가표와 같다: `구현` / `변경구현`(있으나 형태가 다름) / `부분구현` / `미지원`(결정) / `불가능`(제약).

확인 방법은 코드 존재 + 단위·통합 테스트 실행 + 실환경 QA 기록 인용이다. **실 PBX 동작은 QA 문서에 기록된 것만 인정한다.**

---

## 2. 축 A — 원 설계서(PDF) 대비

### 2.1 범위와 아키텍처 (02 §1~2)

| 설계 항목 | 판정 | 구현 위치 / 비고 |
|---|---|---|
| Asterisk 22 LTS + PJSIP, chan_sip 미사용 | 구현 | `pjsip.renderer.ts`. 실 PBX 버전은 문서에 기록 없음 → 설치 매뉴얼에서 확인 항목으로 둔다 |
| 계층 분리 (PBX / Middleware / UI / DB) | 구현 | `apps/server` · `apps/web` · `apps/admin` · Prisma |
| "상담원 화면은 PBX 상태를 직접 해석하지 않는다" | 구현 | 웹·데스크톱 모두 서버 `sessionStatus` 를 따른다. C# 클라이언트는 SIP 상태와 서버 상태를 합칠 때 **서버가 이긴다** (`781c6d2`) |
| AMI 기본 + ARI 는 2차 | 변경구현 | ARI 를 쓰지 않는다. 특수 제어(수락/거절 대기, 외부 조회)는 **AGI + System() 훅**으로 풀었다 (`agent-offer-agi.ts`, `hook-paths.ts`) |
| CRM 연동 (CRM Adapter) | 변경구현 | 별도 CRM 이 아니라 자체 `customers` + `integrations`(VIX_PHONE/VIX_SMS/WEBHOOK/SLACK_WEBHOOK) + ARS `HTTP_LOOKUP` |
| 권장 물리 구성 (PBX 분리, NAS, Nginx) | 구현 | `deploy/sites/_template/compose.prod.yml` + nginx gateway. PBX 는 별도 호스트 전제 |
| 범위 제외: Predictive Dialer, WFM, AI 학습 | 일치 | 없음 (설계와 같음) |

### 2.2 콜 시나리오 (02 §3)

| 시나리오 | 판정 | 비고 |
|---|---|---|
| 인바운드 기본 (트렁크→dialplan→IVR→Queue→분배→팝업→메모→저장) | 구현 | `SessionEngineService` + `screenpop.customer` + `callMemos`. **분배 전에 상담원에게 수락/거절을 묻는 단계**가 설계에 없던 추가다 (`88ec413`, `7b4b071` 동시 제안) |
| 미응답·포기 (abandoned, 재분배 시 linkedid 유지, 임계 대기 시 콜백 메뉴) | 부분구현 | abandon·재분배는 구현. **콜백 접수 메뉴는 없다** — `callSessions.callbackFlag` 컬럼만 있고 쓰는 코드가 없다. 대신 큐 오버플로 규칙(`queueOverflowRules`)으로 외부 전환 |
| 전환 (blind / attended, 원 linkedid 에 묶음) | 구현 | `callTransfers`, `TransferDetectorService`. C# 클라이언트 협의 전환 `624d71e` |
| 클릭투콜 (상담원 내선 먼저 울림 → 고객 발신) | 구현 | `POST /calls/originate` + 클라이언트 전용 `POST /client/call-commands/originate`. 데스크톱은 "자동응답 대기(초)" 로 자기 벨을 자동으로 받는다 |

### 2.3 PBX 설계 (02 §4, 03 §5)

| 설계 항목 | 판정 | 비고 |
|---|---|---|
| 파일 분리 (pjsip / extensions / _inbound / _queue / _agent / queues / manager / ari) | 구현 | 렌더러가 7개 파일을 쓴다 (`asterisk-reload.service.ts:1085~1091`). `ari.conf` 는 ARI 미사용으로 없음. `extensions_transfer.conf` 가 추가됨 |
| Dialplan 원칙 (컨텍스트 분리, 업무 판단은 AGI/API) | 구현 | opt-out / Smart ARS / 제안 / 외부 조회가 전부 훅·AGI 로 나간다 |
| Queue 정책 (leastrecent, timeout 15~20, wrapup, autopause, setinterfacevar) | 구현 | `queues.renderer.ts`, 관리자 `호 분배룰 설정` 에서 링 타임아웃·후처리·Auto Pause 편집 |
| `manager.conf` ACL (permit/deny) | 구현 | `infra/asterisk/manager.conf` 초안. **운영 값은 손으로 넣는다** (렌더 대상 아님) |
| MixMonitor 브리지 녹취 | 구현 | `recording-mode.ts` (모노/스테레오), `recording-pipeline` |

### 2.4 CTI Middleware (02 §5~6)

| 설계 항목 | 판정 | 비고 |
|---|---|---|
| 내부 모듈 7종 (AMI Connector, Session Engine, Agent State, CRM Adapter, Call Command, WS Gateway, Persistence) | 구현 | `modules/ami`, `calls/session-engine`, `agents`, `customers`, `calls`, `realtime`, Prisma |
| 세션 상태 9종 (NEW/IVR/QUEUED/RINGING_AGENT/TALKING/HOLD/TRANSFERRING/AFTER_CALL_WORK/ENDED) | 구현 | `SESSION_PRECEDENCE` 에 9종 전부. HOLD 는 `ASTERISK_HOLD_FEATURE_CODE` opt-in |
| 정합성 원칙 5 (idempotent, linkedid 중심, **재접속 후 재동기화**, 유령 세션 타임아웃, raw/정규화 분리) | 부분구현 | 4/5 구현. **AMI 재접속 후 PBX 채널을 다시 읽어 세션을 맞추는 재동기화는 없다.** `SessionRecoverySweeper` 가 10분 뒤 강제 종료로 대체한다. 재접속 직후 놓친 이벤트는 그 10분 동안 화면에 남는다 |
| 중요 AMI 이벤트 12종 (Newchannel ~ Cdr/CEL) | 구현 | `AmiEventNormalizerService`. CEL 은 쓰지 않는다 (CDR 은 SMDR 송출용으로만) |
| 저장 전략 5 테이블 (raw_ami_events, call_sessions, call_legs, agent_presence_history, queue_fact) | 구현 | `rawAmiEvents`, `callSessions`, `callLegs`, `agentStatusHistory`, `queueEvents` |

### 2.5 API / WebSocket (02 §7, 03 §4)

| 설계 항목 | 판정 | 비고 |
|---|---|---|
| REST 12개 (`/auth/login`, `/me/session`, `/agents/{id}/status`, `/calls/active|{id}|memo|originate|transfer|hangup`, `/customers/search`, `/queues/summary`, `/admin/dashboard`) | 구현 | 12/12 존재. 그 위에 컨트롤러 27개(`grep @Controller`)로 늘어났다 |
| 공통 envelope `{success,data,error}`, Bearer, `/api/v1` | 구현 | `ResponseTransformInterceptor`, `AllExceptionsFilter` |
| WS `/ws/agent` · `/ws/admin` 분리 | 변경구현 | **네임스페이스 하나(`/ws`)** + 테넌트 room. 관리자도 같은 스트림을 구독한다 (`8a36a64` 테넌트 격리) |
| WS 이벤트 6종 | 구현 | 6종 + `announcement.pushed` = 7종 (`cti-event-contract.md`) |
| 역할 3종 (agent / supervisor / admin) | 구현 | + **플랫폼 관리자**(`platformAdmins`, 별도 토큰 scope)가 4번째 층으로 추가됨 |

### 2.6 DB (02 §8, 03 §2~3)

| 설계 항목 | 판정 | 비고 |
|---|---|---|
| 핵심 13 테이블 | 구현 | 13/13 존재, 총 **77 모델**로 확장 (`grep ^model` 77건). 이름은 camelCase (`callSessions` 등) |
| `call_sessions` 유니크 `linkedid` | 변경구현 | `(tenantId, linkedid)` 복합 유니크 — 멀티테넌시 때문 |
| 권장 인덱스 6종 | 구현 | `schema.prisma` `@@index` |
| 파티셔닝은 2차 | 미착수 | 설계대로 없음. `rawAmiEvents` 보존기간 정책도 없다 (설계에도 없음) |

### 2.7 상담원 화면 / 관리자 콘솔 (02 §9~10)

| 설계 항목 | 판정 | 비고 |
|---|---|---|
| 상담원 5구역 (상단 바 / 좌 상태·재콜 / 중앙 통화·고객 / 우 메모·전환 / 하단 이력·알림) | 구현 | `apps/web` `FullShell` (TopAppBar + SideNav + CallListPanel + 본문 + KpiPanel). **재콜 목록은 없다** (콜백 미구현과 같은 건) |
| UX: 인입 1초 내 팝업, 3클릭, 종료 즉시 후처리 카드, 상태 전환 이유 코드 | 부분구현 | 팝업·후처리는 구현. **상태 전환 이유 코드(`reasonCode`)는 스키마에만 있고 UI 입력이 없다** |
| 관리자 대시보드 4항목 | 구현 | `features/dashboard` + `AlertsPanel` + `추이 분석`(1분 스냅샷, 설계에 없던 추가) |
| 검색/감사 (전화번호·상담원·일자·결과코드, 녹취 재생, 특이콜 필터, **권한별 마스킹**) | 부분구현 | 검색·재생·필터 구현. **개인정보 마스킹은 AI 분석 전사문(`pii-mask.util.ts`)에만 있고 통화 이력·고객 화면에는 없다** |

### 2.8 보안·장애·모니터링·배포 (02 §11~13)

| 설계 항목 | 판정 | 비고 |
|---|---|---|
| AMI 내부망 한정, manager ACL, HTTPS only, 트렁크 IP 화이트리스트 | 부분구현 | ACL 초안·`identify match` 구현. **HTTPS 는 템플릿 nginx 가 80 만 연다** — TLS 는 외부 LB 전제로 문서화만 됨 |
| JWT, 역할 분리 | 구현 | access 15분 / refresh 14일 회전 |
| 민감정보 마스킹 | 부분구현 | 2.7 과 동일 |
| 감사로그 (로그인·조회·다운로드·녹취 접근) | 부분구현 | 녹취 접근·패킷캡처·업데이트·자격 변경·복구 5종은 있다. **로그인 감사·조회 감사·통합 조회 화면은 없다** |
| 장애: AMI 재접속·재동기화·알림 / DB 지연 큐 적재 / Asterisk 재시작 후 큐 멤버 재동기화 / 스토리지 장애 경보 | 부분구현 | 재접속·`resilience` 스풀·LKG·녹취 reconcile 구현. **재동기화 2종(2.4 참조)은 없다** |
| 모니터링 (PBX 채널·RTP 지연·SIP 등록·트렁크 / App / DB / 스토리지) | 부분구현 | `/health`, `/metrics`(JWT+역할 가드 적용 확인), 스냅샷의 `trunkChannelsInUse`. **RTP 지연·디스크 용량 임계치는 없다** |
| 환경 DEV / STG / PRD | 부분구현 | DEV(`docker-compose.dev.yml`)와 PRD 템플릿만. **STG 없음** |
| CI/CD (Git 배포, migration 버전관리, dialplan 검증) | 부분구현 | CI 는 lint·test·build·hygiene 4잡. **이미지 빌드·registry push 없음**, `GIT_COMMIT`/`BUILD_TIME` 을 `Dockerfile.prod` 가 주입하지 않는다 |
| 테스트 (기능 / 부하 / 재시작 복구 / DB 장애) | 부분구현 | 단위·통합 1,509건, `tools/pbx-loadgen`. **Asterisk 재시작 복구·DB 장애 시나리오는 문서(`2026-08-08-db-ha-resilience-runbook.md`)만 있고 실행 기록이 없다** |

### 2.9 향후 확장 (02 §17)

| 설계 항목 | 판정 | 비고 |
|---|---|---|
| STT 연계 | 구현 (실측 전) | `call-analysis` — `fake / local / openai` 프로바이더. **한국어 8kHz 인식률 실측은 인프라 부재로 미실시** |
| AI 요약·민원 태깅 | 구현 (실측 전) | 요약·감정·상담분류 + `AI 인사이트` 탭 |
| QA 평가 (금칙어, 스크립트 준수율) | 미지원 | 없음 |
| 멀티채널 (채팅·카카오·이메일) | 미지원 | 없음 |

### 2.10 설계서에 없는데 구현된 것

설계서 대비 **추가된** 영역이다. 매뉴얼과 인수인계에서 "설계에 없던 것"으로 표시해야 검수 때 혼선이 없다.

| 영역 | 구현 위치 | 왜 생겼나 |
|---|---|---|
| 상담원 수락/거절 제안 + 동시 제안 + 앱 접속 추적(presence) | `internal/agent-offer`, `agent-offer-agi.ts`, `44b6592` | 실기기 전환 검증에서 "앱이 꺼진 자리로 전화가 간다"는 결함 |
| SMDR/CID TCP 3포트 (로지·아이콘·콜마너) | `modules/smdr` | 고객 요구(A-725) |
| SIP 남용 차단 (`sip-security`) | `modules/sip-security` | 개발 PBX 스캔 공격 관찰 |
| 패킷 캡처 사이드카 | `apps/capture-agent`, `system/packet-capture` | NAT 핀홀 결함 진단 |
| Smart ARS · ARS 플로우 빌더 · HTTP_LOOKUP | `smart-ars`, `ars-flow`, `ars-http-lookup` | 계획서 P1 "IVR 플로우 시각화" |
| 기능 자격 + 플랫폼 관리자 | `feature-entitlement`, `platform-admin` | 사이트별 기능 개폐 |
| 데스크톱 자동 업데이트 허브 + 공개 다운로드 | `agent-updates`, `deploy/agent-downloads` | 현장 배포 |
| DB 장애 대응 (운영모드 / 스풀 / LKG) | `modules/resilience` | `2026-08-08` 이중화 설계 |

---

## 3. 축 B — 요구사항 66건: 2026-08-19 이후 바뀐 판정

08-19 표의 판정을 승계한다. 이후 156커밋으로 **바뀐 것 6건**만 다시 적는다. 나머지 60건은 그대로다.

| 축-# | 요구 | 08-19 판정 | **2026-09-03 판정** | 근거 |
|---|---|---|---|---|
| A-103 | 전화기 응답모드 (Auto Answer) | 미지원 | **변경구현** | C# 클라이언트 설정 "자동 받기(초)" · "자동 끊기(초)" · "후처리 뒤 자동 대기(초)" (`b996461`, `AutoCallActions.cs`). 단말이 아니라 **소프트폰 앱 정책**이다. 제안(수락/거절) 화면에는 걸리지 않는다 |
| B-1 | soft phone | 구현 (Electron 0.1.1) | **구현 (2벌)** | C# `apps/desktop-win` 1.0.0 이 개발서버에 배포됨 (`release.json`, `agent-downloads` nginx). Electron 은 병행 유지. **서명 없음** (`signed: false`) |
| C-1 | 소프트폰 SIP STN | 구현 (실검증 없음) | **구현 (개발 PBX 실검증)** | 등록·발신·수신·양방향 음성·왕복지연·음소거·재연결·토큰 회전 통과 (`qa/2026-08-20-…phase1-verification.md` §6~9, §12). **에코는 판정 보류** (RDP 환경이라 측정 불가) |
| C-3 | 국선 SIP TRK (KCT 070) | 부분구현 (회선 미검증) | **부분구현 → 개발 회선 확인** | 개발 PBX 에 ITSP 트렁크(`27.255.98.132`, identify 방식)와 DID 10개가 붙어 있고 외부 발신이 트렁크로 연결됐다 (§12-3, `400ae71`, `315a978`). **운영 사이트 회선은 아직 없다** |
| D-3 | 녹취 화자분리 | 구현 (diarization 없음) | **변경구현** | AI 분석이 **스테레오 채널 분리**로 화자를 가른다 (`CALL_ANALYSIS_CUSTOMER_CHANNEL`). 모노 녹취 사이트에서는 화자를 못 가른다 |
| E-5 | PBX conf 렌더링 파이프라인 | 부분구현 (실검증 없음) | **구현 (개발 PBX 반영 확인)** | 렌더 → 쓰기 → AMI reload 가 개발 PBX 에 실제 반영됐다 (SIP 포트 36070→48950, `remove_existing`, `qualify_frequency`). 단 **SIP 포트 변경은 reload 로 안 되고 Asterisk 재시작이 필요하다** (§6-1-1, 제품 결함으로 기록) |

### 3.1 바뀌지 않은 것 중 운영에 걸리는 항목

| 축-# | 요구 | 판정 | 지금도 그런가 |
|---|---|---|---|
| D-2 | 콜마너/올플릿 배차 API | 미지원 | 그렇다. `dispatch` 검색 결과가 dialplan 렌더러 문자열뿐 |
| D-4 | MFA · IP allowlist · 통합 감사로그 · 민감필드 암호화 | 부분구현 | 그렇다. `totp` / `ipAllowlist` 0건. 감사로그는 5개 도메인 테이블 |
| A-805 | 프로그램 버전 (커밋 식별) | 부분구현 | 그렇다. `Dockerfile.prod` · `compose.prod.yml` 에 `GIT_COMMIT` 이 없다 |
| B-4 / C-6 | 번호대역 강제 | 부분구현 | 그렇다. `80db1d8` 이 오히려 "코드가 대역을 정하지 않게" 했다 — 의도된 결정 |
| B-3 | TAPI 대체 (open TSP) | 변경구현 | 그렇다. 기대 형태 확인이 아직 없다 |

### 3.2 결정이 필요한 것 (08-09 부터 그대로 열려 있음)

1. 번호대역 확정 (내선 `2001~3499` vs `3001~3499`, 가상버퍼 `~3999` vs `~3799`)
2. "TAPI 대체(open TSP)"의 기대 형태 — REST 로 충족인지, TSP 드라이버인지
3. MMC 301 등급 경계 (시외/시내 구분 필요 여부)
4. "브랜치 그룹"(A-315) 용어 — 지사인지 단말 pickup 그룹인지

---

## 4. 축 C — 2026-08-19 이후 설계서 5건 대비 구현

### 4.1 C# 데스크톱 클라이언트 (설계 08-20, 잔여 계획 08-22)

| 설계 범위 | 상태 | 근거 |
|---|---|---|
| 1단계: 로그인·토큰 회전·REST·WS·SIP UDP·창 모드·화면 3종 | 완료 + 실검증 | `qa/2026-08-20-…phase1-verification.md` |
| 파동 1 호 분배 (presence · 큐 pause · 제안 대기시간 · 동시 제안 · 진 쪽 제안 닫기) | 완료 | `44b6592`, `1ce1bbf`, `0ad82ef`, `7b4b071`, `e7e0730`, `8d30f4f` |
| 파동 2 클라이언트 기반 (뷰모델 분해 · 서브 창) | 완료 | `49ac369`, `e3c2281` |
| 파동 3 통화 제어 (홀드·협의 전환·실기기 DTMF) | 완료 | `754f8b2`, `624d71e`, `e3f88ff` |
| 파동 4 정보 화면 (상담원·큐·공지·고객) | 완료 | `9842a2c` |
| 파동 5 현장 배포 (트레이 · 핫키 · 자동 업데이트 · 프로토콜 · 진단 · 환경설정 · 아이콘 · 설치 파일) | 완료 | `2990609`, `f0bcef5`, `f44fb04`, `5c64466`, `48581ca`, `5268bf1`, `be4db15`, `8e96894` |
| **남은 것** | | ① 코드 서명 (`signed: false`) ② Electron 교체 결정 ③ 계획서가 답하지 않은 3건: 상담원 고객 DB 조회 권한, 큐별 제안 대기시간, **WS 큐 요약의 테넌트 필터** ④ `primaryAgentId` 가 발신 세션에서 비어 있음 (QA §12-4) ⑤ 에코 측정 ⑥ **CI 없음** (Windows 러너 필요) |

### 4.2 AI 레이어 (계획 09-01)

| 단계 | 상태 | 남은 것 |
|---|---|---|
| 1단계 STT + 요약·감정·분류 (`call-analysis`, 마이그레이션 `20260901_call_analysis`) | 코드 완료, `fake` 로 파이프라인 검증 | 실 프로바이더 실측 — **whisper 사이드카(개발서버 Docker Hub 차단) 또는 OpenAI/Anthropic 키 중 하나가 있어야** 한국어 8kHz 인식률을 잰다. 실 MixMonitor 스테레오로 화자-채널 대응 확인 |
| 2단계 AI 인사이트 탭 (`features/trends/CallInsightsPanel`) | 코드 완료 | 인사이트 SQL 을 실 DB 로 대조 |
| 3단계 (계획서 미기재) | — | — |
| 4단계 ARS 플로우 빌더 | 4.3 으로 분리 | |

기본값은 `CALL_ANALYSIS_ENABLED=false` + 자격 `call-analysis`/`ai-insights` 기본 꺼짐이라 **기존 사이트 영향은 0**이다.

### 4.3 ARS 플로우 빌더 (설계·계획 09-01)

| Phase | 상태 | 남은 것 |
|---|---|---|
| 0 컴파일러·검증기 | 완료 (`174b44b`) | — |
| 1 DID 결선·렌더 가드·미리보기·적용 | 완료 (`0cb8fdb`, `57d835c`, `5fa8ee8`) | 파일럿 DID 실통화 (사람) |
| 2 캔버스 편집기 | 완료 (`a05c526`, `b4511ae`) | — |
| 3 확장·흡수 | 부분 — `COLLECT_DIGITS` 와 IVR 메뉴 가져오기는 완료 (`5e28d89`, `42b45ed`) | **Smart ARS 가져오기·수신거부 가져오기는 의도적으로 보류** (`work-log/2026-09-02-ars-flow-phase3-worklog.md` §5 — 재시도 한도·훅 실패 분기·관측 이벤트·출처 통계가 달라진다). 설계 §4.4 조건 2(바이트 동등)는 달성 불가 → "관찰 동등"으로 재정의 제안 |

### 4.4 ARS HTTP_LOOKUP (설계 09-02)

| 단계 | 상태 | 남은 것 |
|---|---|---|
| P1 엔드포인트 레지스트리 (암호화 자격증명, SSRF 가드) | 완료 (`4053e83`) | — |
| P2 통화 경로 결선 (AGI, 차단기, 타임아웃) | 완료, 로컬 하네스 실왕복 + 개발서버 배포 (`7a1dc3e`, worklog §5.1~5.2) | — |
| P3 파일럿 실통화 | **미실시** | 조회 성공 분기·실패 분기·차단기 열림·안내 음성 4가지를 사람이 건다. **실 Asterisk 가 AGI 를 부른 적은 없다**. 동시 실행 상한 20 은 노드별 카운터 (멀티노드면 곱해진다) |

### 4.5 기능 자격 · 플랫폼 관리자 (설계 09-01, 계획 09-02)

| Phase | 상태 |
|---|---|
| 0 카탈로그·판정 서비스 (`common/feature-catalog.ts` 6키) | 완료 (`3274769`) |
| 1 서버 게이트·메뉴 숨김 | 완료 |
| 2 플랫폼 관리자 인증 (별도 테이블, `scope` 토큰, 부트스트랩 env, 첫 로그인 비밀번호 변경 강제) | 완료 (`a3461ae`) |
| 3 플랫폼 화면 (`/platform/*`, 자격 격자, 이력, 되돌릴 수 없는 기능 확인 대화상자) | 완료 (`apps/admin/src/platform/`) |
| 마이그레이션 3건 (`call_analysis`, `ars_flow`, `feature_entitlement`) | **개발서버 적용됨** — 2026-09-02 배포 시 부팅 `migrate deploy` 로 (`work-log/2026-09-02-ars-http-lookup-p2-worklog.md` §5.2). 실 DB 대조 검증(인사이트 SQL)은 남음 |

**설계가 만들지 않기로 한 것**(설계 §7)은 그대로다: 테넌트 생성·삭제 화면, 테넌트 데이터 열람.
→ 이것이 0장의 결론 1(테넌트 생성 경로 부재)과 맞물린다. 설계 시점에는 "기존 사이트에 자격을 얹는" 관점이었고,
**신규 사이트 설치 관점이 빠졌다.**

---

## 5. 축 D — 통합 계획서 잔여 과제 (P0/P1/P2)

| 우선순위 | 과제 | 상태 (2026-09-03) |
|---|---|---|
| P0 | 실시간 이벤트 계약 정합화 | **완료** (E-4 해소, 7종 발행) |
| P0 | 통화 제어 상태 서버 동기화 | **완료** (ack-only 제거, `call.updated` 기준) |
| P0 | PBX 설정 반영 검증 파이프라인 | **완료** — dry-run · diff · 변경 내역 확인 후 적용(`5fa8ee8`) · owner marker · 렌더 가드 |
| P0 | 데스크톱 실환경 SIP/미디어 검증 | **완료 (에코 제외)** — C# 클라이언트 기준. Electron 은 미실시 |
| P0 | 운영 배포 절차·DB migration 기준 | **부분** — `deploy-prod.sh` · runbook 은 있으나 **운영 사이트에서 한 번도 실행되지 않았다.** 개발서버는 bind-mount 방식이라 이 절차를 타지 않는다 |
| P1 | 관리자 권한 enforcement 전면 적용 | **완료** — `MENU_KEYS` 서버 진실원 + 메뉴 RBAC + 자격 게이트 |
| P1 | IVR 플로우 시각화·실행 이력 | **부분** — 빌더는 완료, **IVR 실행 이력(고객별 입력 이력·timeout 리포트)은 `reports/ivr-failures` 한 화면뿐** |
| P1 | 멘트 파일 업로드·배포 자동화 | **완료** — `prompt-tts.service.ts`(HTTP-JSON TTS), 파일 업로드, `ASTERISK_SOUNDS_DIR` 배포, 기본 MOH |
| P1 | 큐 상세 drill-down | **부분** — 큐 현황·대기호 목록은 있으나 큐 단건 상세 화면은 없다 |
| P1 | 테스트 앱 smoke/regression 표준화 | **미착수** — `pbx-loadgen` 은 있으나 배포 게이트에 연결되지 않았다. 마지막 smoke 리허설 기록이 2026-05-05 |
| P2 | 공지사항 상담원 앱 노출 | **완료** (`AnnouncementsPanel`, 데스크톱 공지 창) |
| P2 | 리포트 고도화 | **부분** — 추이 분석·AI 인사이트 추가. export 권한은 `PermissionAction` 에 있음 |
| P2 | 프론트 runtime config | **미착수** — 여전히 build-time `VITE_*`. `build-frontend-dist.sh` 가 사고를 막는 우회책 |
| P2 | site 별 배포 자동화 | **미착수** — CI 이미지 빌드·registry 없음 |
| P2 | 운영 알림·대시보드 확장 | **부분** — `AlertsPanel` 경보는 있으나 외부 알림(메일·메신저) 발송은 `integrations` SLACK_WEBHOOK 을 수동 결선해야 한다 |

---

## 6. 이번 조사에서 새로 드러난 공백 (운영 투입 관점)

08-19 표에 없던 것이다. 번호는 우선순위가 아니라 발견 순서다. 우선순위는 8장.

| # | 공백 | 근거 | 영향 |
|---|---|---|---|
| G1 | **테넌트 생성 경로 없음** — **해소(2026-09-03)** `modules/tenant-bootstrap/` | `tenants.upsert` 는 `seed.ts` 뿐. `platform/tenants` 는 GET 만 | 신규 사이트 설치 시 데모 시드(데모 계정 동반) 또는 SQL 직접 삽입 |
| G2 | **첫 관리자 계정 생성 경로 없음** — **해소(2026-09-03)** 같은 부트스트랩이 `role=admin` 을 만든다. 첫 로그인 강제 변경은 없음 | 시드는 `agent1001`(agent) · `supervisor1`(supervisor) 만. `role=admin` 계정은 supervisor 가 `POST /agents` 로 만든다 | 설치 후 데모 supervisor 로 들어가 admin 을 만들고 데모 계정을 비활성화하는 절차가 필요 |
| G3 | `docker-entrypoint.sh` 의 `AUTO_SEED_DEMO_DATA` 기본값이 `true` — **해소(2026-09-03)** 기본 `false` | `apps/server/docker-entrypoint.sh` | 운영 compose 는 `false` 를 넘기지만, compose 를 안 쓰는 배포는 데모 데이터가 들어간다 |
| G4 | 빌드 식별자 미주입 — **해소(2026-09-03)** `Dockerfile.prod` ARG + `deploy-prod.sh` 가 `git rev-parse` 주입 | `Dockerfile.prod` · `compose.prod.yml` 에 `GIT_COMMIT`/`BUILD_TIME` 없음 | 운영에서 "어떤 빌드가 떠 있나"를 답할 수 없다 (A-805 그대로) |
| G5 | C# 클라이언트 CI 없음 | `.github/workflows/ci.yml` 매트릭스 `[admin, web, desktop]` | 배포 중인 클라이언트가 회귀 검사 없이 나간다 |
| G6 | 데스크톱 릴리스 등록이 스크립트 SQL | `scripts/publish-desktop-release.sh` 가 `INSERT INTO "agentDesktopReleases"` | 관리자 화면 없음. 원격 호스트·컨테이너명이 스크립트 기본값에 박혀 있다 (`blueadm@49.247.46.86`) |
| G7 | 설치 파일 서명 없음 | `release.json` `signed: false`, `build-release.ps1 -RequireSign` 미사용 | SmartScreen 경고, 위변조 방어 없음 |
| G8 | **PBX 호스트 준비 절차 문서 없음** | `grep "asterisk 설치|apt install asterisk"` docs·scripts 0건 (chatgpt 아카이브 제외) | Asterisk 설치·모듈·한국어 음원·`manager.conf`·owner marker·훅 스크립트 권한을 정리한 문서가 없다 → 이번 설치 매뉴얼에서 처음 정리 |
| G9 | 운영 문서 드리프트 | `scripts/deploy-dev.sh`·`operations/deployment-runbook.md` 는 rsync+build 전제(개발서버는 빌드 불가), `design/pbx-requirement-menu-setting-guide-20260717.md` 37번의 `SMDR_TCP_*` env 는 `CID_*_TCP_PORT` 로 바뀜, `docs/README.md` 인덱스 문서 수가 실제와 다름 | 설치자가 낡은 절차를 따라간다 |
| G10 | AMI 재접속 후 재동기화 없음 | 2.4 | 재접속 구간 이벤트 유실 시 세션이 최대 10분 잘못 표시 |
| G11 | 콜백 접수·재콜 목록 없음 | `callbackFlag` 미사용 | 설계 §3.2 · §9.1 미충족 |
| G12 | 상태 전환 이유 코드 UI 없음 | `agentStatusHistory.reasonCode` 미입력 | 설계 §9.2 미충족. 이석 사유 통계 불가 |
| G13 | 통화 이력·고객 화면 개인정보 마스킹 없음 | `mask` 는 AI 전사문·설정 비밀번호에만 | 설계 §10.2 · §11.2 미충족 |
| G14 | 재접속·재시작·DB 장애 복구 시나리오 실행 기록 없음 | `db-ha-resilience-acceptance-report-template.md` 가 템플릿 상태 | 이중화 설계가 검증되지 않음 |
| G15 | 큐 요약 WS 이벤트 테넌트 필터 | 데스크톱 잔여 계획 "답하지 않는 것" | 멀티테넌트 사이트에서 다른 회사 큐 요약이 섞일 수 있다 |
| G16 | `/metrics` 인증 — **해소됨** | `monitoring.controller.ts:16` `JwtAuthGuard, RolesGuard` | 2026-04-16 메모리의 미해결 항목이 닫혔다. 기록만 남긴다 |
| G18 | **설계는 Asterisk 22, 검증된 PBX 는 apt 18.10.0** | 개발서버 `asterisk -V` = `18.10.0~dfsg` (Ubuntu 22.04 패키지), Docker 도 Ubuntu `docker.io` — 2026-09-03 실측. 설계서·이전 매뉴얼의 "22 소스 빌드"는 실행된 적 없음 | 설치 매뉴얼·`install/install.sh` 는 18.10 을 검증된 기준으로 고정(다른 조합은 `ALLOW_UNVERIFIED`). 22 로 올리려면 렌더러·훅·녹취를 검증용 PBX 에서 다시 확인해야 한다 |
| G17 | **운영 compose 템플릿이 PBX 연동 없이 뜬다** — **해소(2026-09-03)** 템플릿에 마운트·env·포트 반영, `.env.example` 보강 | `deploy/sites/_template/compose.prod.yml` — `server` 에 `/etc/asterisk` · 음원 · 대기음 · 녹취 마운트가 없고, `extra_hosts`(host-gateway) · `ASTERISK_CONF_OWNER_ID` · `ASTERISK_EXTERNAL_*` · `SOFTPHONE_*` · `CID_*` · `RESILIENCE_*` env 를 넘기지 않으며, 훅 콜백용 3000 포트와 CID 포트를 열지 않는다. 개발서버의 `docker-compose.dev.yml` 에는 전부 있다 | 템플릿대로 세운 사이트는 서버는 뜨지만 PBX 설정 반영 · 멘트 배포 · 수신거부/Smart ARS 훅 · CID 송출 · 소프트폰 등록정보가 조용히 동작하지 않는다. 설치 매뉴얼 5.3 이 보정 YAML 을 제공한다 |

---

## 7. 검증하지 못한 것

| 항목 | 왜 | 확인 방법 |
|---|---|---|
| 에코 | 측정 환경(RDP) 부적합 | 실제 상담석 헤드셋으로 `qa/2026-08-20-csharp-softphone-audio-verification.md` 절차 |
| 큐 오버플로 → AI센터/외부 전환 | 실통화 없음 | 렌더된 `[queue-overflow]` + 대표 DID 실호 |
| 녹취 암호화 후 재생 e2e | 실 MixMonitor 파일 필요 | 자격 `recording-encryption` 은 **되돌릴 수 없으므로** 검증 전용 테넌트에서 |
| ARS 플로우·HTTP_LOOKUP 실통화 | 4.3 · 4.4 | 파일럿 DID 1개 |
| AI 분석 실녹취·인식률 | 인프라 부재 | whisper 사이드카 또는 API 키 |
| 운영 사이트 `deploy-prod.sh` 실행 | 운영 사이트 없음 | 설치 매뉴얼 리허설 |
| 운영 통신사 회선 | 회선 없음 | `design/sip-trunk-spec-template.md` 로 요청 |
| Electron 데스크톱 실환경 | C# 으로 검증 대체 | 교체 결정 후 불필요해질 수 있음 |

---

## 8. 권장 조치 (우선순위 순)

### 8.1 설치를 막는 것 — 첫 사이트 전에

1. ~~**테넌트·첫 관리자 부트스트랩** (G1·G2)~~ **완료 2026-09-03** — `TENANT_BOOTSTRAP_CODE/NAME/ADMIN_LOGIN/ADMIN_PASSWORD[/ADMIN_EXTENSION]` env. `tenants` 0건일 때만, 고정 id `…0001`, 테넌트+admin 한 트랜잭션. 플랫폼 관리자 화면은 그대로 목록만 (설계 §7 유지). **남긴 것**: 상담원 계정에는 `mustChangePassword` 가 없어 첫 로그인 강제 변경을 넣지 않았다 — 스키마 + 로그인 응답 + 웹·관리자·데스크톱(Electron·C#) 4개 클라이언트를 함께 고쳐야 하므로 별도 결정.
2. ~~**`AUTO_SEED_DEMO_DATA` 기본값을 `false` 로** (G3)~~ **완료 2026-09-03**. 개발 compose 는 명시적 `"true"` 그대로.
3. ~~**PBX 호스트 준비 절차**를 설치 매뉴얼로 고정 (G8)~~ **완료 2026-09-03** — 설치 매뉴얼 4장.
4. ~~`GIT_COMMIT`/`BUILD_TIME` 을 `Dockerfile.prod` `ARG` 로 받아 `compose.prod.yml` 이 `git rev-parse` 값을 넘기게 (G4)~~ **완료 2026-09-03** — 운영·개발 compose 양쪽 build args, `deploy-prod.sh` 가 채운다. 개발서버의 bind-mount dist 교체 배포는 이미지를 안 만드므로 여전히 null.
6. **설치 스크립트** — **완료 2026-09-03**: `install/install.sh` (system → site → asterisk → firewall → deploy → verify, `--wizard`·답안 파일·`--dry-run`·멱등) + `install/make-offline-bundle.sh` (deb·이미지·저장소 번들). CI `installer` 잡이 ubuntu-22.04 러너에서 system·site·asterisk 를 실제 실행. deploy·verify 까지의 실 서버 리허설은 없음. G18 을 이 작업에서 발견했다.
5. ~~**운영 compose 템플릿을 개발 compose 수준으로 맞춘다** (G17)~~ **완료 2026-09-03** — 템플릿에 반영, `.env.example` 보강, `deploy-prod.sh` 가 `KASTER_INTERNAL_SECRET` 필수·기본값 거부. 렌더링(`compose config`)과 스크립트 preflight 는 로컬 검증, **실 사이트 기동 리허설은 없음.**

### 8.2 운영 첫 달 안에

5. C# 클라이언트 Windows CI (G5) + 코드 서명 (G7, `agent-desktop-internal-code-signing.md` 절차 있음).
6. 릴리스 등록을 플랫폼 관리자 화면 또는 `POST /agent-updates/releases` 로 (G6).
7. 문서 드리프트 정리 (G9): `deploy-dev.sh` 폐기 표시, 메뉴 가이드 env 명 정정, `docs/README.md` 문서 수 재집계.
8. Electron 데스크톱 교체 결정 — 유지하면 실환경 검증 비용이 두 배, 폐기하면 CI 매트릭스와 `agent-updates` 채널 정리.

### 8.3 인증·심사 예정이면 선행

9. 보안 4종 (MFA · IP allowlist · 통합 감사로그 · 민감필드 암호화) + 로그인 감사 + 화면 마스킹 (G13).
10. AMI 재접속 재동기화 (G10) — 재접속 직후 `CoreShowChannels` 로 열린 세션 대조.

### 8.4 기능

11. 배차 API 연동 (D-2) — 설계 있음, 유일한 미착수 우선순위.
12. 콜백 접수·재콜 목록 (G11), 상태 이유 코드 (G12), 큐 단건 상세.
13. 결정 4건 (3.2) 을 닫기 전에는 번호 정책을 코드에 넣지 않는다.

---

## 관련 문서

- 요구사항 66건 통합 비교표: [`../qa/2026-08-19-requirements-implementation-comparison-verification.md`](../qa/2026-08-19-requirements-implementation-comparison-verification.md)
- 판정 근거 원본: [`../qa/2026-08-09-requirements-vs-implementation-verification.md`](../qa/2026-08-09-requirements-vs-implementation-verification.md)
- 실 PBX 검증 기록: [`../qa/2026-08-20-csharp-softphone-phase1-verification.md`](../qa/2026-08-20-csharp-softphone-phase1-verification.md)
- 통합 계획서: [`../plans/project-integrated-plan.md`](../plans/project-integrated-plan.md)
- 이 분석을 반영한 매뉴얼: [`../operations/2026-09-03-user-manual-runbook.md`](../operations/2026-09-03-user-manual-runbook.md) · [`../operations/2026-09-03-site-installation-guide-runbook.md`](../operations/2026-09-03-site-installation-guide-runbook.md)
