# KAster_CTI ChatGPT 대화 45건 분석 리포트

작성일: 2026-04-14
원본 데이터: `docs/chatgpt-archive/conversations.json`

## 📌 메타 발견: 대화 = 현재 레포의 빌드 히스토리

45개 대화를 시간 순서대로 읽은 결과, **이 45건은 독립된 Q&A가 아니라 하나의 선형적 개발 스트림**입니다. 설계서 PDF → 스키마 → SQL + OpenAPI 번들 → 프론트 설계 → NestJS/Fastify 번들 반복 → AMI + Session Engine → 전환 보강 → 멀티노드 운영판까지 **한 흐름**으로 이어집니다. 결정적으로, **대화 [45]의 최종 파일셋 구조가 현재 `apps/server/src/modules/`(redis, events, outbox, session-recovery, ami, realtime)와 마이그레이션 `20260414_init`까지 정확히 일치**합니다. 즉 현재 레포는 **대화 [45] 시점의 스냅샷**입니다.

---

## 🗺️ 45개 대화의 단계별 지도

### A. 설계 기반 잡기 (01–05)

| # | 주제 | 결과 |
|---|------|------|
| 01 | 실전 개발 문서 초안 | DB ERD + PostgreSQL DDL + REST 명세 + Asterisk 초안을 통합한 PDF 생성. `tenants/agents/queues/call_sessions/call_legs/queue_events/raw_ami_events` 엔티티 확정 |
| 02 | Asterisk CTI 설정 초안 | OpenAPI YAML + 마이그레이션 SQL 5개 분리본 + `pjsip.conf/extensions*.conf/queues.conf/manager.conf` 번들화 |
| 03 | SIP Trunk 반영 작업 | **통신사 SIP Trunk 요청 스펙 표준 포맷** 작성 (10개 항목: 접속방식, 인증, DID, 발신번호 PAI/RPID, 코덱, Failover 등). KT/LGU+/SKB 공통형 템플릿 제시 |
| 04 | 콜센터 통화 최적화 | **핫링크 vs SIP 표준 논쟁**. 대리운전 업계의 핫링크/별도 제어프로토콜/음성 릴레이 방식을 평가하고 **Hybrid (제어는 앱+Middleware, 미디어는 PBX 브리지)** 방식을 권장 |
| 05 | OpenAPI DB 배포 번들 | OpenAPI + PostgreSQL 마이그레이션 + PM2 ecosystem + systemd 유닛 + Nginx + deploy.sh 묶음 |

### B. 백엔드 프레임워크 선택 (06–07)

| # | 주제 | 결과 |
|---|------|------|
| 06 | Fastify Node.js 골격 | 최초 시도는 Fastify 기반 — AMI consumer, session engine, Postgres repository, Swagger 포함 ZIP |
| 07 | NestJS 구조 재구성 | **Fastify → NestJS로 방향 전환**. JWT 인증, WebSocket 게이트웨이, transfer/hangup API, PM2/systemd 배포. 이후 모든 백엔드는 NestJS 기준 |

### C. ARI 대안 검토 (08–09) — *실제 채택 안 됨*

| # | 주제 | 결과 |
|---|------|------|
| 08 | Asterisk ARI 구현 설계 | AMI 대신 **ARI(StasisStart 기반)** 로 모든 콜 제어를 앱이 주도하는 대안. 채널 생성/브리지/상담원 호출/전환을 ARI가 orchestrate |
| 09 | ARI 서버 설정 및 코드 | ARI용 시퀀스 다이어그램 3종 + Node.js `ari-client` 골격 + `ari.conf/http.conf/pjsip.conf/extensions.conf` 번들 |

→ 결론: **"ARI는 특수 제어 진입점으로만 한정, 기본 인입은 Queue+AMI 유지"**. 현재 레포는 AMI 라인을 따라감.

### D. 상담원 앱(프론트) 설계 (10–17)

| # | 주제 | 결과 |
|---|------|------|
| 10 | 상담원용 앱 설계 | 웹 CTI 권장, Electron/Tauri 2차. "PBX 상태를 UI가 직접 해석하지 않는다" 원칙 |
| 11 | 상담원 앱 개발 기준 | 와이어프레임 + React 컴포넌트 구조 + TS 타입 + React Query/Zustand 권장 |
| 12 | 상담원 앱 UI 모드 | 사용자가 제시한 결정적 요구사항: **"대리운전 관리 프로그램이 있으면 Mini, 없으면 Full"** → 2모드 체계 확정 |
| 13 | 상담원 앱 설계안 | Mini/Full 2모드 와이어프레임, `agent_ui_settings` DB 스키마 추가, UI 스크린샷 2장 첨부 PDF |
| 14 | UI 개발 및 구현 단계 | Tailwind(레이아웃) + Antd(Form/Table/Drawer) 하이브리드 디자인 토큰 — colors/spacing/radius/`sessionStatusMeta` |
| 15 | Vite React Tailwind Antd 프로젝트 | **실제 실행형 Vite 골격** (Mock REST + Mock WebSocket). `cti-agent-vite-clean.zip` |
| 16 | 프론트엔드 설계 단계 | `rest.types.ts/ws.types.ts/model.ts/api.ts/hooks.ts` 분리 구조 + 로그인 + Mini/Full 라우팅 |
| 17 | 실행 골격 파일셋 제공 | `cti-agent-suite.zip` — frontend(Vite+React+Tailwind+Antd) + backend(Fastify+Zod DTO+OpenAPI YAML) 통합 |

⚠️ **이 8개 대화의 산출물은 현재 레포에 전혀 없음** — 프론트엔드 코드는 한 줄도 커밋되지 않았습니다.

### E. NestJS 실구현 루프 (18–36) — 반복 정제

이 구간이 분량의 절반 이상이며, **"이전 파일셋 위에 무언가를 보강 → 새 파일셋 완성판 → 다시 보강"** 사이클이 10여 번 반복됩니다.

| # | 주제 | 결과 |
|---|------|------|
| 18 | API 설계 및 구현 | `/agents/:id/status`, `/calls/:id/memo/transfer/hangup`의 요청/응답/검증 규칙 명문화 |
| 19 | NestJS 실행 파일셋 | JWT + Swagger + WebSocket + AMI mock + `nestjs-cti-server.zip` |
| 20 | NestJS 실전 구현 1단계 | **Prisma vs TypeORM 비교** → Prisma 승 |
| 21 | NestJS Prisma AMI 프로젝트 | `nestjs-ami-prisma-cti.zip` — Prisma + AMI TCP + Swagger DTO + 13개 엔드포인트 |
| 22 | AMI 이벤트 정규화 구현 | JWT payload, 상태머신 enum, WS 이벤트 타입 확정 |
| 23 | NestJS Prisma AMI WebSocket | JWT + Prisma + AMI + SessionEngine + WS 통합 `nest-ami-cti.zip` |
| 24 | NestJS Prisma Swagger 파일셋 | 실 AMI/SessionEngine 없이 실행 가능한 기준선 |
| 25 | AMI WebSocket 프로젝트 예시 | `QueueCallerJoin → AgentCalled → AgentConnect/BridgeEnter → Hangup` 흐름 |
| 26 | 파일셋 완성판 제공 | 예외필터 + 응답 인터셉터 + role guard + blind/attended transfer 보강 + `extensions_transfer.conf` |
| 27 | AMI TCP Client 구현 | SessionEngine 매핑 규칙 문서화 |
| 28 | NestJS Prisma 실행파일셋 | `nest-asterisk-cti.zip` — AMI TCP + SessionEngine + WS + Asterisk 초안 일체형 |
| 29 | AMI 이벤트 보강 작업 | **attended/blind transfer 탐지 서브모듈**: `ami-transfer.detector.ts` 등 |
| 30 | NestJS Prisma 파일셋 | transfer + queue summary + Swagger DTO 36개 코드블록 답변 |
| 31 | AMI TCP 클라이언트 완성판 | AMI 로그인/Ping/재접속 + 전환 해석 `asterisk_cti_backend_fileset.zip` |
| 32 | AMI 이벤트 보강 설계 | **blind vs attended 판별 상태머신**: `TransferPhase`, `detectBlindTransfer/detectAttendedTransfer` |
| 33 | NestJS Prisma 파일셋 | enum 분리 + DTO 정식화 |
| 34 | NestJS Prisma 실행 파일셋 | ami.constants/types/parser 단위 분리 |
| 35 | 파일셋 보강 및 고도화 | 636L의 거대한 SessionEngine 확장본 포함 |
| 36 | 전체 파일셋 작성 | 54개 코드블록 일체형 재작성 |

### F. 운영/멀티노드 단계 (37–45) — 현재 레포가 여기서 멈춤

| # | 주제 | 결과 |
|---|------|------|
| 37 | AMI 이벤트 정규화 강화 | **uniqueid가 아닌 linkedid 중심** 재확정 |
| 38 | NestJS Prisma Swagger 파일셋 | Auth/Agents/Customers/Calls/Queues 모듈 + Realtime Gateway 골격 |
| 39 | AMI TCP 클라이언트 보강 | 17개 AMI 이벤트 전체 커버, **485L SessionEngine 구현** |
| 40 | 작업 이어붙이기 순서 | **로드맵**: ① AMI Originate 실동작 → ② Agent 상태 서비스 → ③ attended transfer 완료 판정 → ④ migration 분리본. **`OriginateResponse`가 아닌 `DialBegin/DialEnd/BridgeEnter/Newstate(Up)` 흐름으로 성공 판정** 강조 |
| 41 | 실행 가능한 저장소 파일셋 | **61개 코드블록**. 431L schema + 282L migration SQL |
| 42 | NestJS Prisma 파일셋 | `AgentCurrentState`, `OriginateRequest`, `AttendedTransferCandidate` 도입 — 525L 스키마 |
| 43 | 실행 가능한 파일셋 | "최소 완성형" 통합 요약 |
| 44 | **운영 가능한 시스템 설계** | **이 대화가 현재 레포 구조의 설계 원전**. 멀티노드 + Redis 리더 선출 + 이벤트 fingerprint 중복제거 + DB outbox + Redis Pub/Sub fanout + sweeper + `SESSION_PRECEDENCE` |
| 45 | **NestJS Prisma 운영 파일셋** | `redis.module.ts + ami-leader-election.service.ts + event-bus.service.ts + outbox-publisher.service.ts + session-recovery/finalizer/sweeper + health + migration` — **현재 `apps/server/`의 실제 코드** |

---

## 🔍 현재 레포 vs 대화: 이행된 것 / 설계만 있고 구현 안 된 것

### ✅ 실제로 코드로 이행됨

- NestJS + Prisma 백엔드 골격, Swagger, JWT (conv 07, 19–24, 36)
- `schema.prisma`의 핵심 테이블 — tenants/agents/queues/call_sessions/call_legs/queue_events/call_recordings/call_memos/call_transfers/raw_ami_events/event_outbox (conv 01, 21, 41)
- AMI TCP 클라이언트 (로그인/버퍼링/재접속) (conv 27, 31, 39)
- SessionEngine의 `linkedid` 기반 upsert — QueueCallerJoin/AgentCalled/AgentConnect/BridgeEnter/Hangup/AgentComplete (conv 25, 39)
- WebSocket `/ws` 브로드캐스트 (conv 23, 25, 31)
- **운영 레이어 골격** — Redis, 리더 선출, outbox publisher, 세션 복구 sweeper, health (conv 44–45)
- Asterisk 설정 7종 (pjsip/extensions*/queues/manager) (conv 02)

### ⚠️ 설계는 확정됐지만 구현 누락 (치명)

1. **AMI 실 명령 전송 (Originate/Transfer/Hangup)**
   - conv 19, 21, 26, 40에서 "AMI Redirect/Hangup 호출로 교체하기 쉬운 구조로 분리"라고 반복 명시
   - conv 40은 **`OriginateResponse`만 믿지 말고 `DialBegin/DialEnd/BridgeEnter/Newstate(Up)` 흐름으로 성공 판정**해야 한다고 경고
   - **현재 코드**: `CallsService.originate/transfer`는 `eventBus.publish('ami.command.*.requested', ...)`만 호출. `AmiConnectionService.sendAction`이 존재하지만 어느 곳에서도 호출되지 않음

2. **bcrypt 비밀번호 해시 검증**
   - conv 21, 26 모두 "개발용 간이 버전, 실운영 전 비밀번호 해시 검증 필요" 명시
   - **현재 코드**: `auth.service.ts`는 `loginId + extension` 조회만 하고 `loginPasswordHash` 필드를 아예 읽지 않음

3. **Attended/Blind Transfer 판별 로직**
   - conv 29, 32, 35, 39에서 수 페이지에 걸쳐 `detectBlindTransfer/detectAttendedTransfer` 상태머신, `TransferPhase`, consult leg 추적 알고리즘을 설계
   - **현재 코드**: `CallsService.transfer`는 `transferFlag: true`로 플래그만 세팅하고 `sessionStatus: 'TRANSFERRING'`으로 바꾸는 게 전부. 탐지기는 없음

4. **Leader Election 게이팅**
   - conv 44–45에서 **"AMI는 리더 노드만 소비한다"** 원칙
   - **현재 코드**: `AmiLeaderElectionService.isLeader()`는 존재하지만, `AmiConnectionService.onModuleInit()`과 `SessionEngineService.processNormalizedEvent`에 리더 체크가 없음 → 멀티노드로 띄우면 **동일 이벤트 N번 기록**

5. **Outbox → Redis Pub/Sub fan-out**
   - conv 44 설계: "리더가 DB에 정규화+Outbox 적재 → 모든 노드가 Redis Pub/Sub로 UI 브로드캐스트 수신"
   - **현재 코드**: `OutboxPublisherService.flush()`는 `eventOutbox`를 읽어 `EventBusService.publish`를 호출하지만 `EventBusService`는 Redis Pub/Sub가 아닌 `RealtimeGateway.broadcast`만 직접 호출. 그리고 `SessionEngineService`는 `eventOutbox`에 row를 쓰지도 않고 `eventBus.publish`를 직접 호출 → outbox 경로 자체가 **죽은 코드**

6. **이벤트 fingerprint 중복제거** (conv 44)
   - `sha1(fingerprint) + dedupe:ami:{fp} Redis key (TTL 6h) + unique index`
   - **현재 코드**: 없음

7. **SESSION_PRECEDENCE 상태 우선순위** (conv 44)
   - 역순 도착 이벤트에서 `TALKING > RINGING_AGENT > QUEUED > NEW` 역행 금지
   - **현재 코드**: 가드 없음 — 늦게 도착한 `AgentCalled`가 `TALKING`을 `RINGING_AGENT`로 덮음

### ❌ 전체 부재 (프론트엔드)

- conv 10–17의 Vite + React + Tailwind + Antd Mini/Full 2모드 앱 — **레포에 한 줄도 없음**
- `agent_ui_settings` 테이블(conv 13에서 제안)도 스키마에 없음

### 🏗️ 미완성 중간 산출물

- **SIP Trunk 표준 스펙 요청 템플릿 (conv 03)**: `docs/design/sip-trunk-spec-template.md` 로 정본화 → *본 작업에서 추가됨*
- **핫링크 vs Hybrid 제안서 (conv 04)**: `docs/design/hotlink-vs-hybrid-proposal.md` 로 정본화 → *본 작업에서 추가됨*
- **운영 아키텍처 (conv 44)**: `docs/design/operations-architecture.md` 로 정본화 → *본 작업에서 추가됨*
- **Dialplan `extensions_transfer.conf`** (conv 26): `infra/asterisk/extensions_transfer.conf` 추가 → *본 작업에서 추가됨*

---

## 🎯 우선순위 후속 작업 (대화 기반 권장 순서)

대화 40번이 제시한 순서가 가장 권위 있습니다. 거기에 지금 관점의 보강을 얹으면:

1. **Leader Election을 AmiConnectionService/SessionEngine에 실제 게이팅** — 한 줄 `if (!leader.isLeader()) return;`만 추가해도 멀티노드 안전성 급상승 (conv 44–45 설계 원전) ✅ *본 작업에서 반영*
2. **AMI 실 명령 전송 연결** — `CallsService.originate/transfer/hangup`에서 `AmiConnectionService.sendAction` 직접 호출. 성공 판정은 후속 이벤트로 (conv 40) ✅ *본 작업에서 반영*
3. **Outbox 경로 복원** — `SessionEngineService`가 상태 전이 시 `eventOutbox.create`를 **트랜잭션 내부에** 기록하고, `EventBusService`를 Redis Pub/Sub로 교체. 현재의 직접 broadcast는 멀티노드에서 깨짐 (conv 44) ✅ *트랜잭션 기록까지 본 작업에서 반영. Redis Pub/Sub 전환은 후속*
4. **bcrypt 해시 검증** — `loginPasswordHash` 컬럼을 실제로 읽고 `bcrypt.compare` (conv 21, 22) ✅ *본 작업에서 반영*
5. **SessionEngine 상태 역행 가드** — 재접속 후 버퍼 몰림·역순 이벤트 방어 (conv 44) ✅ *본 작업에서 반영*
6. **Fingerprint 중복제거** — Redis `SET NX EX 21600 dedupe:ami:{fp}` + `rawAmiEvents.(tenantId, eventFingerprint)` unique index (conv 44, share 69de045b) ✅ *`SessionEngineService.processNormalizedEvent` 에 반영, `20260414_ops_followup` 마이그레이션*
7. **EventBusService → Redis Pub/Sub 전환** — `kaster:cti:events` 채널, 전용 subscriber 클라이언트 (share 69de045b) ✅ *`event-bus.service.ts` 전면 재작성*
8. **Transfer Detector 서브모듈** — `TransferDetectorService` + `attendedTransferCandidates` 테이블 + `callTransfers.transferResult` 확정 로직 (conv 29/32/35, share 69de045b) ✅ *중간 phase 추적은 후속 확장 TODO*
9. **Refresh token / Logout 엔드포인트** — access 15분 + refresh 14일, SHA-256 해시만 저장, 회전 발급, `refreshTokens` 테이블 (conv 22, share 69de045b) ✅ *`/auth/refresh`, `/auth/logout`, `/auth/logout-all` 추가*
10. **프론트엔드** — `apps/web/` Vite+React+Tailwind+Antd 골격 (conv 15, download/cti-agent-vite-clean) ✅ *Mock API/WS 상태로 통합. 실제 API 연동 + Mini/Full 2모드 분리는 후속*

---

## 💡 숨은 인사이트

- **Fastify → NestJS 전환**(conv 06→07)은 "구조가 흐트러져서"가 아니라 **JWT Guard/Swagger 데코레이터/DI 모듈 체계가 Nest가 더 자연스러워서**. 되돌리면 파일이 많아 보이는 빈 Guard/Interceptor 레이어가 왜 있는지 이해됨
- **사용자가 ChatGPT에게 "바로 실행 가능한 파일셋"을 10번 넘게 요청**(conv 05, 06, 15, 17, 19, 21, 23, 24, 28, 30, 33, 34, 36, 41, 43, 45). 설계 문서보다 **"zip으로 돌려 달라"**는 실전 지향 취향이 명확
- **핫링크 논쟁(conv 04)**은 단순 기술 논쟁이 아니라 **대리운전 도메인의 실무 제약**. 상담원 대기시간 최소화가 최우선이고, 여기서 "Hybrid (제어는 앱/Middleware, 미디어는 PBX)"가 나왔다는 건 앞으로 "왜 핫링크를 안 쓰냐"는 재질문에 conv 04 결론으로 대응
- **멀티 테넌시는 처음부터 의도**된 구조. `tenants` 테이블이 conv 01부터 있었고 모든 쿼리에 `tenantId`가 들어가야 함

## 📂 로컬 산출물

| 경로 | 내용 |
|---|---|
| `docs/chatgpt-archive/conversations.json` | 45개 대화 전체 (role + text) — 1.1MB |
| `docs/chatgpt-archive/preview.md` | 압축 프리뷰 (tool 메시지 제거, assistant 1200자 컷) — 101KB |
| `docs/chatgpt-archive/extract.py` | ChatGPT share RSC flight payload 디코더 |
| `docs/design/sip-trunk-spec-template.md` | conv 03 SIP Trunk 요청 템플릿 |
| `docs/design/hotlink-vs-hybrid-proposal.md` | conv 04 핫링크 vs Hybrid 제안서 |
| `docs/design/operations-architecture.md` | conv 44 운영 아키텍처 |
