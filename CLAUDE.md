# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 기본 행동 규칙

이 규칙은 프로젝트별 지침과 함께 적용한다. 사소한 작업에서는 판단해서 간소화할 수 있지만,
기본 방향은 속도보다 정확성과 불필요한 변경 억제다.

### 1. 코딩 전 먼저 생각하기

- 가정을 명시한다. 불확실하면 질문한다.
- 해석이 여러 개면 조용히 하나를 고르지 말고 선택지를 드러낸다.
- 더 단순한 접근이 있으면 말하고, 필요하면 반대 의견을 낸다.
- 이해가 안 되는 부분은 숨기지 말고 멈춰서 혼란 지점을 말한다.

### 2. 단순함 우선

- 요청받지 않은 기능을 추가하지 않는다.
- 한 번만 쓰는 코드를 위해 추상화를 만들지 않는다.
- 요청되지 않은 유연성, 설정 가능성, 확장 포인트를 넣지 않는다.
- 실제로 불가능한 시나리오를 위한 과한 방어 코드를 넣지 않는다.
- 코드가 과하게 길어졌으면 더 작은 해법으로 줄인다.

### 3. 외과적 변경

- 꼭 필요한 파일과 줄만 수정한다.
- 주변 코드, 주석, 포맷을 임의로 개선하지 않는다.
- 기존 스타일을 따른다.
- 관련 없는 죽은 코드는 삭제하지 말고 필요하면 언급만 한다.
- 내가 만든 unused import, 변수, 함수는 정리한다.
- 모든 변경 라인은 사용자 요청과 직접 연결되어야 한다.

### 4. 목표 기반 실행

- 작업을 검증 가능한 목표로 바꾼다.
- 버그 수정은 재현 테스트 또는 확인 절차를 먼저 잡고 통과시킨다.
- 여러 단계 작업은 짧은 계획과 각 단계의 검증 방법을 둔다.
- 완료라고 말하기 전에 실제 명령/API/화면/로그로 확인한다.

## 문서를 만들거나 옮길 때

**[`DOCS_GUIDE.md`](DOCS_GUIDE.md) 를 따른다.** 문서의 디렉터리·파일명·인덱스 규칙은 전부 그 파일에 있다.
요약: `docs/` 최상위에 새 `.md` 를 만들지 않는다. 타입 디렉터리
(`design` / `plans` / `operations` / `qa` / `reviews` / `work-log` / `reference`) 중 하나에 `YYYY-MM-DD-주제-유형.md` 로 만든다.
`docs/ops/`, `docs/features/`, `docs/superpowers/` 는 폐지됐으므로 새로 만들지 않는다.
문서를 옮기면 그 문서를 가리키던 링크와 `docs/README.md` 인덱스를 같은 커밋에서 고친다.

## 용어 규칙

- 사용자에게 노출되는 화면·메뉴·버튼·안내 문구·운영 문서의 제품 명칭은 **`PBX`** 로 통일한다.
- 코드 식별자, API 경로, 파일 경로, env 이름처럼 **이미 계약된 구현명**은 `asterisk` / `Asterisk` 를 유지한다
  (`infra/asterisk/`, `AsteriskConfigModule`, `ASTERISK_CONF_DIR` 등). 단 UI 카피나 외부 설명에는 노출하지 않는다.
- 같은 규칙이 `AGENTS.md`(Codex 용), `REQUIREMENTS.md` 에도 있다. 세 파일은 같은 내용을 중복 보유하므로
  레이아웃·명령·아키텍처를 고칠 때 함께 갱신할지 확인한다.

## 저장소 레이아웃

모노레포 형태의 단일 트리지만 **workspace 툴이 없다**. 루트 `package.json` 의 `test` 는 실패하는 placeholder이며,
설치·빌드·테스트는 반드시 각 앱 디렉터리에서 실행한다.

```
apps/server/          NestJS 10 + Prisma 5 CTI 미들웨어 (백엔드)
apps/web/             Vite 7 + React 19 + Tailwind + Antd 5 상담원 앱
apps/admin/           Vite 5 + React 18 + Antd 5 관리자 대시보드 (supervisor/admin 전용)
apps/desktop/         Electron 33 + electron-vite 데스크톱 소프트폰 (sip.js, Windows 배포 타깃)
apps/capture-agent/    패킷 캡처 사이드카 (dumpcap. network_mode: host + NET_RAW 를 갖는 유일한 컨테이너)
infra/asterisk/       PBX PJSIP / Dialplan / Manager 설정 초안
deploy/sites/         사이트별 운영 배포 템플릿 (_template/ 만 커밋. compose.prod.yml + nginx)
scripts/              배포·검증 스크립트 (deploy-prod.sh, deploy-dev.sh, pbx-smoke-*, pbx-sip-security-prepare.sh)
tools/                pbx-loadgen (C++/CMake 부하생성기), vite-dev-server-security.mjs (dev 서버 접근 가드)
docs/                 설계 PDF + design/ operations/ qa/ features/ work-log/ + openapi.json
docker-compose.yml    로컬 개발 Postgres 16 + Redis 7
docker-compose.dev.yml 원격 개발/검증 서버 — server/web/admin 이미지 빌드 + nginx + coturn TURN
```

루트 문서: `README.md`(빠른 시작), `CODEBASE_MAP.md`(2026-05-09 기준 탐색 결과·hotspot·테스트 통계),
`REQUIREMENTS.md`(요구사항 원천 인덱스), `AGENTS.md`(Codex 용 사본).

## 주요 개발 명령

### 인프라 (Postgres + Redis)
```bash
docker compose up -d postgres redis
```
- DB: `kaster_cti` / user `kaster` / pw `kaster` / 5432, Redis 6379

### 원격 개발/검증 배포 (`docker-compose.dev.yml`)
```bash
docker compose -f docker-compose.dev.yml up -d --build
docker compose -f docker-compose.dev.yml logs -f server
```
- server 컨테이너 부팅 시 `prisma migrate deploy` 후 앱 시작
- 호스트 포트 충돌 회피: Postgres 5433, Redis 6380 (컨테이너 내부는 5432/6379)
- `coturn` (TURN/STUN) 포함 — 49160-49200/udp. `TURN_USERNAME` / `TURN_PASSWORD` / `TURN_EXTERNAL_IP` 필수
- 사이트별 운영 배포는 `deploy/sites/_template/` 을 복제해 `deploy/sites/<site>/` 를 만들고 루트 `scripts/deploy-prod.sh` 로 기동.
  이 스크립트가 필수 env 존재·placeholder 금지·Postgres 백업을 검사하고,
  `${ASTERISK_CONF_DIR}/.kaster-cti-config-owner` marker 값이 `SITE_CODE` 와 다르면 **배포를 중단**한다 (남의 PBX 덮어쓰기 방지)

### NestJS 서버 (`apps/server`)
```bash
cd apps/server
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate deploy
npx ts-node prisma/seed.ts          # 선택: tenant/queue/agent/진행중 세션 시드

npm run start:dev                   # nest start --watch
npm run build && npm run start      # 프로덕션 (dist/src/main.js)
npm run lint                        # eslint "src/**/*.ts"
npm test                            # jest — spec 전체
npm run prisma:sync                 # generate + migrate deploy 한 번에 (scripts/prisma-sync.js)
npm run openapi:export              # docs/openapi.json 갱신
```
- 테스트: Jest + ts-jest. `testRegex: .*\.spec\.ts$`, roots 는 `src/` 와 `test/`.
  - `src/**/*.spec.ts` — 단위 (renderer, 상태전이, sanitizer 등)
  - `test/*.spec.ts` — 통합 (`*.integration.spec.ts` 는 권한·auth handoff·transfer detector 등)
  - 단일 파일: `npx jest src/modules/calls/session-engine.service.spec.ts`
  - 단일 케이스: `npx jest -t "부분 문자열"`
- `tsconfig.json` 은 `strict: false`. 기존 코드가 강한 타입 가정을 하지 않는다 (예: `realtime.gateway.ts` 의 `server: any`,
  신규 Prisma 모델 접근 시 `(this.prisma as any).recordingFinalizeJobs` 패턴).

### Swagger / 엔드포인트 확인
- 글로벌 prefix `api/v1` (`src/main.ts`), Swagger UI `http://localhost:3000/docs`, WS namespace `/ws`.
- 커밋된 스펙 스냅샷은 `docs/openapi.json` — 엔드포인트를 추가하면 `npm run openapi:export` 로 갱신한다.

### 상담원 앱 (`apps/web`)
```bash
cd apps/web
cp .env.example .env   # VITE_API_BASE_URL / VITE_WS_URL / VITE_USE_MOCK
npm install
npm run dev            # vite dev server 5173
npm run build          # tsc -b && vite build
npm test               # vitest run
npx vitest run src/store/useCtiStore.test.ts   # 단일 파일
```
- Mock/Real 이중 모드. `VITE_USE_MOCK=true` 면 `src/api/mockApi.ts` + `src/mock/mockSocket.ts`,
  아니면 `src/api/realApi.ts` + `src/ws/realSocket.ts`. `src/api/index.ts` / `src/ws/index.ts` 가 디스패처.
- `src/api/apiClient.ts` — axios 인스턴스 + Bearer 자동 첨부 + 401 시 `/auth/refresh` 1회 회전 후 원요청 재시도
- `src/store/useAuthStore.ts` 가 token + agent 를 localStorage 에 영속 (`kaster.access_token`, `kaster.refresh_token`, `kaster.agent`)
- `src/store/useUiStore.ts` 가 Mini/Full 모드를 URL `?mode=mini` 또는 localStorage 로 영속
- 레이아웃: `layout/AppShell.tsx` 가 mode 디스패처 → `FullShell`(TopAppBar + SideNav | CallListPanel | 본문 | KpiPanel) / `MiniShell`(420px 카드)
- `pages/DesktopHandoffPage.tsx` + `utils/desktopBridge.ts` — 웹에서 `kastercti://` 로 데스크톱 소프트폰에 세션을 넘기는 경로

### 관리자 대시보드 (`apps/admin`)
```bash
cd apps/admin
cp .env.example .env   # VITE_API_BASE_URL / VITE_USE_MOCK / VITE_ACCESS_TOKEN_KEY
npm install
npm run dev -- --port 5174   # vite.config 기본 포트가 5173 이라 apps/web 과 충돌
npm test                     # vitest run
npm run help:build           # scripts/build-pbx-feature-help.ts (PDF → 기능 도움말 생성)
```

> **원격 배포용 정적 빌드는 `npm run build` 를 쓰지 않는다.** Vite 는 `VITE_*` 를 빌드 시점에
> 번들 안으로 박아 넣어서, 로컬 `.env`(`VITE_API_BASE_URL=http://localhost:3000`, `VITE_USE_MOCK=true`)
> 가 그대로 들어간다. 2026-08-24 에 그렇게 만든 admin 번들을 올려 관리자 화면이 통째로
> "Network Error" 가 됐다. 반드시 아래를 쓴다 — 값을 주입하고 만들어진 번들을 되읽어 검증하며,
> 검증에 실패하면 `dist` 를 지워 잘못된 산출물이 남지 않게 한다.
>
> ```bash
> ./scripts/build-frontend-dist.sh admin   # 또는 web
> ```

- **supervisor/admin 역할만** 접근. 일반 agent 는 `ForbiddenPage` (mock 모드는 역할 체크 우회).
- `store/useAuthStore.ts` 가 apps/web 과 **같은 localStorage 키**를 쓴다. apps/web 에서 supervisor 로 로그인해두면 자동 진입.
  분리하려면 `VITE_ACCESS_TOKEN_KEY` 로 다른 키를 지정.
- 화면은 `src/features/<도메인>/` 단위 (components + api + hooks). 라우트는 `src/app/router.tsx`,
  좌측 메뉴/권한은 `src/shared/permissions/menuConfig.tsx`.

### 데스크톱 소프트폰 (`apps/desktop`)
```bash
cd apps/desktop
npm install
npm run dev            # electron-vite dev (main + preload + renderer hot reload)
npm run build          # → out/
npm test               # vitest run
npm run dist:win       # electron-builder NSIS + portable x64
npm run dist:win:signed# 빌드 → 내부 서명(PowerShell) → 서명 검증
```
- `src/main/` — `index.ts` 가 단일 BrowserWindow + Tray 를 띄우고 `CtiRuntime`(서버 REST/WS 게이트),
  `RuntimeSupervisor`(재시작/헬스체크), `DesktopBridgeServer`(브라우저 연동 로컬 HTTP), `TokenVault`,
  `AttentionService`, `TrayService`, 각종 preferences store, `UpdateClient` 를 부팅
- `src/renderer/src/softphone/` — `sip-softphone-client.ts` + `softphone-runtime.ts` 가 등록/INVITE/미디어 협상.
  UI 는 `components/SoftphoneShell.tsx`, 상태는 `store/useDesktopStore.ts`
- **Window mode**: `compact | full | idle | ringing | talking | transferring | afterCall | settings` 8개.
  통화 단계에 따라 **메인 프로세스**가 창 크기/위치/투명도를 바꾼다 (`window-options.ts`). 창 모양의 단일 진실원은 메인 프로세스.
- **IPC 계약**: `src/shared/ipc.ts` 에 모든 채널 페이로드 타입이 모여 있다. 양방향 호출은 이 파일에 타입을 먼저 추가.
- **프로토콜 핸들러**: `kastercti://` 스킴. `protocol-payload.ts` 파싱, `ProtocolConnectInbox` 가 윈도우 부팅 전 도착 요청을 큐잉.
- main 모듈은 `*.test.ts` 가 짝으로 붙어 있다 (vitest + jsdom). 새 main 모듈 추가 시 같은 패턴으로 테스트를 함께 작성.

### PBX 설정 초안
- `infra/asterisk/` 의 `pjsip.conf`, `extensions*.conf`(inbound/queue/agent/transfer 분리), `queues.conf`, `manager.conf`.
- `manager.conf` 의 AMI 계정(`cti_middleware` / `STRONG_AMI_PASSWORD`)과 `.env` 의 `AMI_USERNAME` / `AMI_SECRET` 은 1:1. 한쪽만 바꾸지 않는다.
- `extensions_transfer.conf` 는 `CallsService.transfer` 가 AMI `Redirect` 로 점프시키는 `transfer-target` context 정의.

## 아키텍처 (빅픽처)

NestJS 미들웨어가 PBX AMI 원시 이벤트를 받아 `linkedid` 를 키로 세션 상태를 조립하고, 이를 DB와 WebSocket에 동시에 반영한다.
멀티노드로 띄워도 AMI 소비는 단일 노드만 하도록 Redis 리더 선출이 끼어 있다.

### 런타임 조립 순서 (`src/app.module.ts`)
```
ConfigModule → Monitoring → Redis → Events → Outbox → SessionRecovery → RecordingPipeline → SipSecurity
→ Ami → Realtime → Auth → Calls → Agents → Customers → Queues → Admin → Announcements → SmsTemplates
→ AsteriskConfig → AgentUpdates → OutboundRules → ShareRules → Integrations → Smdr → Health
```
의도된 의존성 방향이다. AmiModule 은 RealtimeGateway·EventBus 가 준비된 뒤 붙는다.
`OptOutModule` / `SmartArsModule` 은 AppModule 이 아니라 `AsteriskConfigModule` 이 import 한다.

### 이벤트 파이프라인 (AMI → UI)
1. **`AmiConnectionService`** (`modules/ami/`) — `OnModuleInit` 에서 `AMI_HOST:AMI_PORT` 로 TCP 소켓을 연다.
   **주의**: connect 직후 바로 Login 하지 않고 PBX 가 보내는 `Asterisk Call Manager/x.y.z` 배너를 먼저 받은 뒤 Login 을 보낸다.
   수신 버퍼를 `\r\n\r\n` 경계로 잘라 이벤트를 꺼낸다. `close` 시 `AMI_RECONNECT_MS` 주기로 재연결하며 `loggedIn` 플래그도 초기화.
2. **`AmiEventNormalizerService`** — 원시 key/value 를 `{ eventName, tenantId, linkedid, uniqueid, ani, dnis, queueName, agentId, eventTime, raw }`
   로 정규화. 현장마다 AMI 필드가 다르므로 **여기가 튜닝 포인트**다.
3. **`SessionEngineService`** (`modules/calls/session-engine.service.ts`) — 먼저 **중복 제거**:
   `computeFingerprint()` = sha256(`nodeId + eventName + linkedid + uniqueid + channel + destChannel + 1초 bucket`)
   → Redis `SET dedupe:ami:{fp} 1 EX 21600 NX` 선점 실패 시 즉시 skip → 성공하면 `rawAmiEvents` insert
   (unique `(tenantId, eventFingerprint)` 가 최종 방어선). 이후 `callSessions` 를 upsert. 상태 전이:
   - `QueueCallerJoin` → `QUEUED`, `AgentCalled` → `RINGING_AGENT`
   - `AgentConnect` / `BridgeEnter` → `TALKING` (`answeredAt`, `primaryAgentId`)
   - `AgentComplete` → `AFTER_CALL_WORK`, `Hangup` → `ENDED` (`talkSeconds` 계산)
   - `BlindTransfer` / `AttendedTransfer` → `TransferDetectorService` 위임

   세션 유일 키는 `(tenantId, linkedid)`. `linkedid` 없는 이벤트는 조용히 드롭.
   **역행 가드**: `SESSION_PRECEDENCE` 상수로 이미 진행된 상태(TALKING)가 늦게 도착한 `AgentCalled` 때문에 되돌아가지 않게 막는다.
   상태 전이는 `prisma.$transaction` 안에서 `callSessions` 갱신 + `eventOutbox` 적재를 함께 수행한다.
4. **`EventBusService`** (`modules/events/`) — **Redis Pub/Sub**. `publish()` 가 `kaster:cti:events` 채널에
   `{event, payload, sourceNode}` 를 발행하고, 전용 subscriber 클라이언트가 같은 채널을 구독해 `RealtimeGateway.broadcast()` 로 흘린다.
   멀티 WS 노드가 동일 스트림을 공유한다. Redis 장애 시 로컬 fallback broadcast.
5. **`TransferDetectorService`** — `attendedTransferCandidates` 에 phase 를 기록하고 `callTransfers.transferResult` 를 `COMPLETED` 로 마감.
   중간 phase(`CONSULT_RINGING`/`CONSULT_TALKING`/`REBRIDGING`) 추적은 후속 확장.
6. **`RealtimeGateway`** (`modules/realtime/`) — `/ws` namespace. CORS 는 `WS_CORS_ORIGIN`.

**아키텍처 제약**: `linkedid` 는 PBX 가 통화 전체(트렁크 → IVR → 큐 → 에이전트 → 전환) 동안 유지하는 식별자다.
세션을 이어 붙이려면 반드시 이 값을 쓴다. `uniqueid` 는 개별 channel leg 용이며 `callLegs` 에서 쓴다.

### 리더 선출과 멀티노드
`AmiLeaderElectionService` 가 Redis `SET kaster:ami:leader <nodeId> PX 10000 NX` 로 5초마다 리더십을 갱신한다.
`RedisModule` 은 `@Global()`. 리더 가드가 걸린 지점:
1. `AmiConnectionService` — TCP 연결은 모든 노드가 유지하되 리더가 아니면 `sessionEngine.processNormalizedEvent` 호출을 skip
   (리더 전환 시 재접속 지연 없이 takeover)
2. `OutboxPublisherService.flush` — 리더만 outbox 발행
3. `SessionRecoverySweeperService.sweep` — 리더만 stale 세션 복구
4. `RecordingFinalizerService.sweep` — 리더만 녹취 후처리 job 소비

**새로 주기 작업(`setInterval` sweep)을 추가할 때는 리더 가드를 함께 넣는다.** 빠뜨리면 노드 수만큼 중복 실행된다.

### Outbox 패턴과 세션 복구
- 상태 전이가 `prisma.$transaction` 안에서 `callSessions` 갱신 + `eventOutbox` 적재로 묶여 있어 **DB 커밋과 이벤트 발행 큐 적재가 원자적**이다.
- `OutboxPublisherService` — 3초 주기로 `publishedAt IS NULL` 행을 최대 100건 꺼내 `EventBusService.publish`.
- `SessionRecoverySweeperService` — 15초마다 `updatedAt` 이 10분 이상 오래된 비-ENDED 세션을 `resultCode: 'RECOVERY_TIMEOUT'` 으로 강제 종료.
  AMI 이벤트 누락 시 세션이 열린 채 남지 않게 하는 안전망.

### PBX 설정 렌더링 (`modules/asterisk-config/`)
DB 에 저장된 관리자 설정을 **conf 파일로 렌더링해서 `ASTERISK_CONF_DIR` 에 쓰고 AMI 로 reload** 하는 파이프라인이다.
운영 PBX 를 직접 건드리므로 이 프로젝트에서 가장 위험한 경로다.
- `renderers/` — `pjsip`, `dialplan`, `agent-dialplan`, `queues`, `rtp`, `musiconhold` 렌더러. 대부분 순수 함수라 spec 이 붙어 있다.
- `asterisk-config-validation.ts` — 렌더 결과 검증 + 기존 파일과 diff (`RENDERED_CONF_FILE_NAMES`)
- `asterisk-reload.service.ts` — 파일 쓰기 후 `module reload res_pjsip` / `dialplan reload` / `queue reload all` 등 `RELOAD_COMMANDS` 를 AMI 로 전송
- Asterisk `System()` 훅(opt-out, guarded digit AGI, Smart ARS)이 `KASTER_INTERNAL_SECRET` 을 들고 NestJS 로 콜백한다
- 렌더러를 고칠 때는 반드시 해당 `*.renderer.spec.ts` 를 함께 갱신한다. 실 PBX 반영은 로컬 테스트만으로 완료 처리하지 않는다.

### 녹취 파이프라인 (`modules/recording-pipeline/`)
- `RecordingFinalizerService` — 15초 sweep 으로 `recordingFinalizeJobs` (`PENDING`/`RETRY`) 를 소비. 리더 전용.
- `RecordingEncryptionService` — `RECORDING_ENCRYPTION_ENABLED=true` 면 AES-256-GCM 으로 암호화하고
  **암호문 뒤에 `iv(12) + tag(16)` 를 append** 한 뒤 원본을 삭제한다. 복호화도 이 레이아웃을 전제로 한다.
- `RecordingStorageService` / `RecordingRetentionService` / `RecordingReconcileService` — 저장 경로, 보존기간(기본 1095일), 대사.
- MixMonitor 스테레오 RAW 를 재생용 2채널 WAV 로 감쌀 때 `RECORDING_STEREO_RAW_*` env 를 쓴다.

### SMDR / CID TCP (`modules/smdr/`)
`SmdrTcpServerService` 가 부팅 시 **3개 TCP 포트를 항상 연다**. 타사 CID 프로그램이 접속해 Call Report 를 수신한다.

| 프로그램 | env | 기본 포트 |
|---|---|---|
| 로지 | `CID_LOGI_TCP_PORT` | 28002 |
| 아이콘 | `CID_ICON_TCP_PORT` | 28003 |
| 콜마너 | `CID_CALLMANOR_TCP_PORT` | 28004 |

프로그램별로 inbound/outbound 포함 여부·원 발신번호 노출 여부 규칙이 다르다 (`smdr-call-report.formatter.ts`).
포맷을 고칠 때는 **3개 프로그램 축을 모두 확인**한다. 한쪽만 고치면 야간에 다른 축이 조용히 멈춘다.

### SIP 보안 (`modules/sip-security/`)
AMI `SecurityEvent` 기반으로 반복 INVITE/REGISTER/OPTIONS 를 탐지해 번호/IP 단위로 차단한다.
임계값은 전부 env (`SIP_SECURITY_*`). 호스트 방화벽 준비는 `scripts/pbx-sip-security-prepare.sh`.

### 글로벌 미들웨어 (`src/main.ts`)
- `enableShutdownHooks()` — SIGTERM 시 Prisma/Redis/AMI/WS graceful close
- `enableCors()` — `REST_CORS_ORIGIN` (기본 `http://localhost:5173,http://localhost:5174`), `credentials: true`
- `ValidationPipe({ whitelist: true, transform: true })`
- `ResponseTransformInterceptor` — 반환값을 `{ success, data, error }` 로 래핑 (이미 envelope 이면 pass-through)
- `AllExceptionsFilter` — `HttpException` / `PrismaClientKnownRequestError` / 일반 Error 를 공통 envelope 으로. `P2002 → 409`, `P2025 → 404`

새 엔드포인트도 `{ success, data, error }` envelope 을 유지한다.

### 권한 모델
- `JwtAuthGuard` (passport-jwt) → `JwtStrategy.validate()` 가 payload 를 `request.user` 에 주입
- `RolesGuard` + `@Roles('supervisor','admin')` — JwtAuthGuard 뒤에 두면 OR 조건 역할 검사
- `AgentsController.changeStatus` 는 `user.sub !== agentId && !SUPERVISORY_ROLES.has(user.role)` 인라인 체크
- **메뉴 단위 RBAC**: `common/menu-permission.service.ts` 의 `MENU_KEYS` + `PermissionAction`
  (`view|create|update|delete|operate|export`) 이 서버 쪽 진실원이다.
  관리자 화면의 `apps/admin/src/shared/permissions/menuConfig.tsx` 와 **키가 1:1로 맞아야** 한다.

### API / 도메인 모듈
- `auth`
  - `POST /auth/login` — `loginId + extension` 으로 agent 조회 후 `bcrypt.compare`. 성공 시 **access(15분) + refresh(14일)** 발급.
    refresh 원본은 클라이언트만 보관하고 서버는 **SHA-256 해시만** `refreshTokens` 에 저장.
  - `POST /auth/refresh` — 해시 조회 후 **기존 토큰 revoke + 신규 쌍 발급** (재사용 공격 방지 회전)
  - `POST /auth/logout` (멱등) / `POST /auth/logout-all` (JWT 필요) / `GET /me/session`
  - JWT 비밀은 `JWT_SECRET` (기본 `change_me` — 운영 필수 변경)
- `calls`
  - `GET /calls/active`, `GET /calls/:callId`
  - `POST /calls/originate` → `AsteriskManagerService.originate()` → AMI `Originate`
  - `POST /calls/:callId/transfer` — `call_legs` 에서 **`legType === 'agent' && !endedAt`** 인 leg 를 골라
    (단순 "가장 최근" 휴리스틱이 아님) `transfer-target` context 로 `Redirect`. `attended` 면 `attendedTransfer()`, 아니면 `blindTransfer()`
  - `POST /calls/:callId/hangup` — 같은 leg 선택 규칙으로 `Hangup`
  - `POST /calls/:callId/memo` — `callMemos` 저장
  - **성공 판정**: AMI 제어 명령의 성공은 `OriginateResponse` 가 아니라 후속 `DialBegin/DialEnd/BridgeEnter/Newstate(Up)` 를
    SessionEngine 이 받아 판정한다. REST 는 `accepted:true` 즉시 반환.
  - Hold/Resume 은 표준 AMI 액션이 아니라 `ASTERISK_HOLD_FEATURE_CODE` / `ASTERISK_RESUME_FEATURE_CODE` 로만 opt-in. 비우면 UI/API 모두 비활성.
- 운영/관리 모듈: `admin`(설정·대시보드 핵심), `agents`, `queues`(분배 방식 `distribution-mode.ts`), `customers`, `opt-out`,
  `announcements`, `sms-templates`, `smart-ars`(동적 IVR 런타임), `asterisk-config`, `outbound-rules`(발신 규칙·발신번호),
  `share-rules`, `integrations`(외부 CTI 연동 자동화), `agent-updates`(데스크톱 자동 업데이트 매니페스트),
  `monitoring`(Prometheus `prom-client`), `recording-pipeline`, `smdr`, `sip-security`, `health`.

### DB 스키마 (`prisma/schema.prisma`)
- 멀티테넌시: 거의 모든 테이블이 `tenantId`(UUID) 를 파티션 키로 가진다. **새 쿼리에 `tenantId` 조건을 반드시 포함**한다.
- 유니크 제약: `callSessions (tenantId, linkedid)`, `callLegs (tenantId, uniqueid)`, `rawAmiEvents (tenantId, eventFingerprint)`.
- 마이그레이션은 `prisma/migrations/` 에 **52개가 누적**되어 있다 (`20260414_init` ~ `20260808_recording_playback_variant`).
  스키마를 고치면 새 migration 을 추가하고 `npm run prisma:sync` 로 generate + deploy 를 함께 검증한다.
  기존 migration 을 편집하지 않는다.
- 시드 (`prisma/seed.ts`) 는 고정 UUID 로 tenant + agent + supervisor + queue + 고객 + 전화번호 +
  **진행 중인 callSession**(callLegs 2, queueEvents 2, callTransfer 1) 을 만든다.
  `AmiEventNormalizerService` 가 `TenantId` 없는 이벤트를 `...0001` 로 폴백하는 이유도 이 시드와 맞물린다.
- 기본 계정: `agent1001 / Password123! / 1001`, `supervisor1 / Password123! / 2001` (`SEED_DEMO_PASSWORD` 로 override).

### 설정 / 시크릿
`apps/server/.env.example` 이 유일한 목록이며 40여 개로 늘어났다. 그룹:
`HTTP` / `DATABASE_URL` / `JWT` / `REDIS` / `AMI`(+`ASTERISK_NODE_ID`, `ASTERISK_OUTBOUND_CONTEXT`, `ASTERISK_ATXFER_COMPLETE_CODE`,
`PBX_TIME_AMI_*`) / `SIP_SECURITY_*` / `CORS`(`REST_CORS_ORIGIN`, `WS_CORS_ORIGIN`) / `SOFTPHONE_*` /
`ASTERISK_CONF_DIR` 계열 / `RECORDING_*` / `KASTER_INTERNAL_SECRET` / `SMART_ARS_SMS_WEBHOOK_*` / `CID_*_TCP_PORT`.

`ASTERISK_NODE_ID` 는 멀티 PBX 노드 구성 시 노드별로 고유해야 한다 — fingerprint dedupe 의 입력이다.

`.gitignore` 는 `.env`, `node_modules/`, `dist/`, `coverage/`, `*.wav`, `*.mp3`, `*.log` 를 무시한다.
녹취 샘플(`*.wav`/`*.mp3`)은 커밋하지 않는다.

## 변경 시 함께 봐야 하는 짝

이 레포는 같은 개념이 여러 축으로 복제돼 있다. 한쪽만 고치면 나머지가 조용히 깨진다.

| 바꾸는 것 | 같이 바꿔야 하는 것 |
|---|---|
| 관리자 메뉴 추가/변경 | `apps/admin/src/app/router.tsx` + `shared/permissions/menuConfig.tsx` + 서버 `common/menu-permission.service.ts` 의 `MENU_KEYS` |
| 데스크톱 IPC 채널 | `apps/desktop/src/shared/ipc.ts` → `main/index.ts` → `preload/index.ts` → renderer store |
| AMI 계정 | `infra/asterisk/manager.conf` + `apps/server/.env` |
| Prisma schema | 새 migration 추가 + `npm run prisma:sync` + 관련 spec |
| PBX conf 렌더러 | `renderers/*.ts` + 짝 `*.renderer.spec.ts` + `asterisk-config-validation.ts` |
| CID Call Report 포맷 | 로지 / 아이콘 / 콜마너 3개 프로그램 축 전부 |
| REST 엔드포인트 추가 | `{success,data,error}` envelope 유지 + `npm run openapi:export` |
| 주기 sweep 추가 | `AmiLeaderElectionService.isLeader()` 가드 |
| 인증 관련 localStorage 키 | `apps/web` 과 `apps/admin` 이 같은 키를 공유 |
| 패킷 캡처 입력 검증 규칙 | `apps/server/src/modules/packet-capture/capture-filter.util.ts` + `apps/capture-agent/index.mjs` (권한 있는 쪽이 독립 재검증) |

## 참고 문서

- `docs/reference/01_project_overview.pdf` / `02_practical_design.pdf` / `03_db_api_asterisk_spec.pdf` — 기획·설계 원본
- `docs/design/system-design.md`, `docs/plans/project-integrated-plan.md` — 현행 설계/계획
- `docs/design/cti-event-contract.md` — CTI 이벤트 계약
- `docs/design/operations-architecture.md` — 멀티노드·Redis·장애복구 운영 아키텍처 (`modules/redis`, `outbox`, `session-recovery` 의 설계 원전)
- `docs/design/sip-trunk-spec-template.md` — 통신사 SIP Trunk 요청 표준 포맷
- `docs/design/hotlink-vs-hybrid-proposal.md` — 대리운전 업계 핫링크 vs Hybrid 비교
- `docs/operations/`, `docs/qa/` — 배포 리허설·프리플라이트·QA 기록 (실 PBX 검증 절차의 근거)
- `docs/reference/chatgpt-sessions-analysis.md` + `docs/chatgpt-archive/` — 46개 ChatGPT 세션 원본. 현재 코드가 어느 대화에서 나왔는지 역추적용

API 형상이나 AMI 이벤트 처리 규칙이 모호하면 코드를 고치기 전에 위 PDF 와 `docs/design/` 을 먼저 확인한다.
