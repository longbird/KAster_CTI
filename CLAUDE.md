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

## 저장소 레이아웃

모노레포 형태의 단일 트리입니다. 3개 앱은 각각 독립 Vite / Nest 프로젝트이며
루트에는 workspace 툴이 없습니다 (`npm install` 을 각 앱 디렉터리에서 실행).

```
apps/server/          NestJS + Prisma CTI 미들웨어 (백엔드)
apps/web/             Vite + React + Tailwind + Antd 상담원 앱
apps/admin/           Vite + React + Antd 관리자 대시보드 (supervisor/admin 전용)
apps/desktop/         Electron + electron-vite 데스크톱 소프트폰 (sip.js 기반, Windows 배포 타깃)
infra/asterisk/       Asterisk PJSIP / Dialplan / Manager 설정 초안
deploy/sites/         사이트별 운영 배포 템플릿 (compose.prod.yml + nginx + .env.example)
docs/                 기획·설계 PDF + ChatGPT 세션 분석 + 보조 설계 문서
  docs/design/        보조 설계 MD (SIP Trunk, Hotlink, Ops 아키텍처)
  docs/chatgpt-archive/ 46 세션 transcript + preview + extractor
  docs/reference/     원본 PDF (합본, 제안서)
scripts/              운영 스크립트 (push_to_github 등)
docker-compose.yml    로컬 개발용 Postgres 16 + Redis 7
docker-compose.dev.yml 원격 개발/검증 서버용 — server/web/admin 이미지 빌드 + nginx + coturn TURN 포함
```

## 주요 개발 명령

### 인프라 (Postgres + Redis)
```bash
docker compose up -d postgres redis
```
- DB: `kaster_cti` / user `kaster` / pw `kaster` / 5432
- Redis: 6379

### 원격 개발/검증 배포 (`docker-compose.dev.yml`)
```bash
docker compose -f docker-compose.dev.yml up -d --build
docker compose -f docker-compose.dev.yml logs -f server
```
- server/web/admin 을 모두 이미지로 빌드. server 컨테이너 부팅 시 `prisma migrate deploy` 후 앱 시작
- 호스트 포트 충돌 회피: Postgres 5433, Redis 6380 (컨테이너 내부 통신은 5432/6379)
- `coturn` (TURN/STUN) 컨테이너 포함 — 49160-49200/udp 미디어 릴레이. `TURN_USERNAME` / `TURN_PASSWORD` / `TURN_EXTERNAL_IP` env 필수
- 사이트별 운영 배포는 `deploy/sites/_template/` 을 복제해 site code 디렉터리(`deploy/sites/<site>/`)에서 `compose.prod.yml` + `.env` + `scripts/deploy-prod.sh` 로 기동. PBX 설정 반영 전 `/etc/asterisk/.kaster-cti-config-owner` marker 와 site code 일치 여부를 반드시 확인 (불일치 시 reload 중단)

### NestJS 서버 (`apps/server`)
```bash
cd apps/server
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate deploy           # prisma/migrations/20260414_init/migration.sql 적용
npx ts-node prisma/seed.ts          # 선택: tenant/queue/agent 시드

npm run start:dev                   # nest start --watch (개발)
npm run build && npm run start      # 프로덕션 빌드/실행
npm run lint                        # eslint "src/**/*.ts"
npm run prisma:generate             # prisma generate 별칭
npm run prisma:migrate              # prisma migrate deploy 별칭
```
- 테스트 스크립트와 테스트 파일은 현재 없음 (`@nestjs/testing`만 devDep으로 존재). 테스트를 추가할 때는 Jest 설정이 없다는 점을 먼저 알리세요.
- `tsconfig.json`은 `strict: false`. 기존 코드가 강한 타입 가정을 하지 않습니다 (예: `realtime.gateway.ts`의 `server: any`).

### Swagger / 엔드포인트 확인
- 글로벌 prefix: `api/v1` (`src/main.ts`).
- Swagger UI: `http://localhost:3000/docs`.
- WebSocket namespace: `/ws` (`realtime.gateway.ts`, CORS `*`).

### 상담원 앱 (`apps/web`)
```bash
cd apps/web
cp .env.example .env   # VITE_API_BASE_URL / VITE_WS_URL / VITE_USE_MOCK
npm install
npm run dev            # vite dev server on 5173
npm run build          # tsc -b && vite build
```
- 스택: Vite 7 + React 19 + TypeScript + Tailwind CSS + Ant Design 5 + Zustand + axios + socket.io-client
- Mock/Real 이중 모드. `VITE_USE_MOCK=true` 면 `src/api/mockApi.ts` + `src/mock/mockSocket.ts`, 아니면 `src/api/realApi.ts` + `src/ws/realSocket.ts` 를 사용. `src/api/index.ts` / `src/ws/index.ts` 가 디스패처.
- `src/api/apiClient.ts` 는 axios 인스턴스 + `getAccessToken()` 으로 Bearer 자동 첨부 + 401 발생 시 `/auth/refresh` 로 1회 토큰 회전 후 원래 요청 재시도
- `src/store/useAuthStore.ts` 가 access/refresh token + agent 정보를 localStorage 에 영속 (`kaster.access_token`, `kaster.refresh_token`, `kaster.agent`)
- `src/store/useUiStore.ts` 가 Mini/Full 모드를 URL `?mode=mini` 또는 localStorage 로 영속
- 로그인 플로우: `pages/RequireAuth.tsx` 가 Mock 모드에선 bypass, Real 모드에선 미인증 시 `pages/LoginPage.tsx` 렌더
- 레이아웃 (`feat/agent-portal-redesign` 기준 Dark Pro 테마):
  - `layout/AppShell.tsx` — mode 디스패처 (MiniShell | FullShell)
  - `layout/FullShell.tsx` — TopAppBar(46px) + 4열 본문:
    - SideNav(56px 아이콘 레일) | CallListPanel(240px 통화 목록) | 메인 컨텐츠 | KpiPanel(170px 세로 KPI 스트립)
  - `layout/MiniShell.tsx` — 420px Dark Pro 카드 (TopAppBar + 요약 패널)
  - 컴포넌트: `SideNav`, `TopAppBar`, `CallListPanel`, `CurrentCallPanel` (Hero 카드), `ControlPanel`, `KpiPanel`, `AgentStatusTag` (CSS-var 인라인 스타일), `statusMeta` (한국어 레이블 + CSS-var 컬러맵)
- 실제 백엔드 교체 지점은 `src/api/realApi.ts`
  - WebSocket: `src/mock/mockSocket.ts` → 실제 `/ws` namespace 연결

### 관리자 대시보드 (`apps/admin`)
```bash
cd apps/admin
cp .env.example .env   # VITE_API_BASE_URL / VITE_USE_MOCK / VITE_ACCESS_TOKEN_KEY
npm install
npm run dev -- --port 5174   # 기본 5173 은 apps/web 이 쓰므로 다른 포트
```
- 스택: Vite 5 + React 18 + Antd 5 + react-router-dom + axios
- **supervisor/admin 역할만** 접근 가능. 일반 agent 는 `ForbiddenPage` 로 차단됨 (mock 모드에선 역할 체크 우회)
- `pages/RequireAuth.tsx` 가 `useAuthStore.isAuthenticated && isSupervisor` 검사 후 `RouterProvider` 렌더
- `store/useAuthStore.ts` 는 apps/web 과 **같은 localStorage 키**를 사용. 먼저 apps/web 에서 supervisor 로 로그인해두면 admin 으로 자동 진입. 완전히 분리하려면 `VITE_ACCESS_TOKEN_KEY` 로 다른 키 지정.
- 라우트:
  - `/dashboard` — `AdminDashboardPage` (KPI / Queue / Team / ActiveCall / Alert). `/admin/dashboard` + `/calls/active` 호출
  - `/queues` — `QueuesPage` (5초 폴링으로 `/queues/summary` 테이블)
  - `/agents` — `AgentsPage` (5초 폴링으로 `/agents` 테이블)
- `src/features/` 아래에 admin 화면이 기능 단위로 정리되어 있습니다 (`announcements`, `asterisk-config`, `blocklist`, `branch-settings`, `customers`, `forwarding-settings`, `live-calls`, `monitoring`, `opt-out-customers`, `permission-settings`, `prompt-settings`, `queue-settings`, `reports`, `sms-templates`, `system-settings` 등). 페이지를 추가할 때는 이 디렉터리 단위 분리(컴포넌트 + api + 훅)를 따르세요. 좌측 메뉴 등록은 `shared/permissions/menuConfig.tsx` 에서 권한과 함께 정의합니다.
- `features/dashboard/api/dashboardApi.ts` 는 mock/real 이중 경로. 실 모드에서 오류 시 mock 폴백 (화면 항상 렌더).
- 백엔드 `AdminController.dashboard` 는 `@Roles('supervisor','admin')` 가드로 보호됨 (아래 RolesGuard 참고).

### 데스크톱 소프트폰 (`apps/desktop`)
```bash
cd apps/desktop
npm install
npm run dev                          # electron-vite dev (main + preload + renderer hot reload)
npm run build                        # electron-vite build → out/
npm test                             # vitest run (main/renderer 단위 테스트)
npm run dist:win                     # electron-builder NSIS + portable x64
npm run dist:win:signed              # 빌드 → 내부 서명 (PowerShell) → 서명 검증
```
- 스택: Electron 33 + electron-vite + React 19 + sip.js 0.21 + zustand + socket.io-client + electron-log
- `src/main/` 메인 프로세스: `index.ts` 가 단일 BrowserWindow + Tray 를 띄우고 다음 서비스를 부팅합니다 — `CtiRuntime` (서버 REST/WS 게이트), `RuntimeSupervisor` (재시작/헬스체크), `DesktopBridgeServer` (브라우저 연동용 로컬 HTTP), `TokenVault` (자격증명 보관), `AttentionService` (윈도우 깜빡임/알림), `TrayService`, `AudioPreferencesStore`, `DesktopConfigStore`, `UpdateClient` (자동 업데이트)
- `src/renderer/src/softphone/` 가 SIP UA. `sip-softphone-client.ts` + `softphone-runtime.ts` 가 등록/INVITE/미디어 협상을 담당. UI 는 `components/SoftphoneShell.tsx` 가 메인 셸이며 `useDesktopStore.ts` (zustand) 로 상태 관리
- **Window mode 컨텍스트 전환**: `DesktopWindowMode` 는 `compact | full | idle | ringing | talking | transferring | afterCall | settings` 8 개. 통화 단계에 따라 메인 프로세스가 창 크기/위치/투명도를 바꿉니다 (`window-options.ts`). 통화 상태와 창 모양은 메인 프로세스가 단일 진실원
- **IPC 계약**: `src/shared/ipc.ts` 에 모든 채널의 페이로드 타입이 한곳에 모여 있음. 메인 ↔ 렌더러 양방향 호출은 반드시 이 파일에 타입을 먼저 추가
- **프로토콜 핸들러**: `kastercti://` URL 스킴으로 외부 앱(예: 웹)에서 데스크톱을 열어 즉시 발신/연결할 수 있음. `protocol-payload.ts` 가 페이로드 파싱, `ProtocolConnectInbox` 가 메인 윈도우 부팅 전에 도착한 요청을 큐잉
- 테스트는 main 프로세스 모듈 단위로 `*.test.ts` (vitest + jsdom). 렌더러는 `@testing-library/react`. 새 main 모듈을 추가할 땐 동일 패턴의 테스트를 함께 작성

### Asterisk 설정
- `infra/asterisk/` 의 `pjsip.conf`, `extensions*.conf` (inbound/queue/agent/transfer 분리), `queues.conf`, `manager.conf`가 초안입니다.
- `manager.conf`의 AMI 계정(`cti_middleware` / `STRONG_AMI_PASSWORD`)과 `apps/server/.env.example`의 `AMI_USERNAME` / `AMI_SECRET`이 1:1 매칭됩니다. 한쪽만 바꾸지 마세요.
- `extensions_transfer.conf` 는 `CallsService.transfer` 가 AMI `Redirect` 로 점프시키는 `transfer-target` context 를 정의.

## 아키텍처 (빅픽처)

NestJS 미들웨어가 Asterisk AMI의 원시 이벤트를 받아 `linkedid`를 키로 세션 상태를 조립하고, 이를 DB와 WebSocket에 동시에 반영하는 구조입니다. 여러 노드에서 동시에 띄우더라도 AMI는 단일 노드만 처리하도록 Redis 리더 선출이 끼어있습니다.

### 런타임 조립 순서 (`src/app.module.ts`)
`ConfigModule → RedisModule → EventsModule → OutboxModule → SessionRecoveryModule → AmiModule → RealtimeModule → AuthModule → CallsModule → AgentsModule → HealthModule`. 이 순서는 의도된 의존성 방향이며, AmiModule은 RealtimeGateway와 EventBus가 먼저 준비된 뒤에 붙도록 되어있습니다.

### 이벤트 파이프라인 (AMI → UI)
1. **`AmiConnectionService`** (`modules/ami/ami-connection.service.ts`) — `OnModuleInit`에서 AMI TCP 소켓(`net.Socket`)을 `AMI_HOST:AMI_PORT`로 엽니다. **주의**: TCP `connect` 직후 바로 Login 을 쏘지 않고, Asterisk 가 송신하는 `Asterisk Call Manager/x.y.z` 배너를 먼저 수신한 뒤에 Login 을 전송합니다 (그렇지 않으면 타이밍 충돌 위험). 수신 버퍼를 `\r\n\r\n` 경계로 잘라 한 이벤트씩 꺼냅니다. 소켓 `close` 시 `AMI_RECONNECT_MS` 주기로 자동 재연결하며 `loggedIn` 플래그도 초기화합니다.
2. **`AmiEventNormalizerService`** — 원시 key/value 라인들을 `{ eventName, tenantId, linkedid, uniqueid, ani, dnis, queueName, agentId, eventTime, raw }` 형태로 정규화합니다. 운영 현장에 따라 AMI 필드가 달라지므로 **이 서비스가 튜닝 포인트**입니다 (README의 "운영 메모"도 이 점을 명시).
3. **`SessionEngineService`** (`modules/calls/session-engine.service.ts`) — 모든 정규화 이벤트에 대해 먼저 **중복 제거**를 수행합니다: `computeFingerprint()`가 `nodeId + eventName + linkedid + uniqueid + channel + destChannel + 1초 bucket`의 sha256 을 계산 → Redis `SET dedupe:ami:{fp} 1 EX 21600 NX` 로 선점 실패 시 즉시 skip → 성공하면 `rawAmiEvents` 에 insert (unique `(tenantId, eventFingerprint)` 가 최종 방어선). 이후 `eventName` 에 따라 `callSessions`를 upsert합니다. 상태 전이:
   - `QueueCallerJoin` → `QUEUED` (`queuedAt`)
   - `AgentCalled` → `RINGING_AGENT` (`ringingAt`)
   - `AgentConnect` / `BridgeEnter` → `TALKING` (`answeredAt`, `primaryAgentId`)
   - `AgentComplete` → `AFTER_CALL_WORK`
   - `Hangup` → `ENDED` (`endedAt`, `talkSeconds` 계산)
   - `BlindTransfer` / `AttendedTransfer` → `TransferDetectorService` 위임
   세션의 유일 키는 `(tenantId, linkedid)` 조합이며, `linkedid`가 없는 이벤트는 조용히 드롭됩니다. **역행 가드**: `SESSION_PRECEDENCE` 테이블(상단 상수)로 이미 더 진행된 상태(예: TALKING)가 뒤늦게 도착한 `AgentCalled`에 의해 `RINGING_AGENT`로 돌아가지 않도록 보호합니다. 상태 전이는 `prisma.$transaction` 안에서 `callSessions` 업데이트와 `eventOutbox` 적재를 같이 수행하므로, 외부로 나가는 이벤트는 DB 커밋과 원자적입니다.
4. **`EventBusService`** (`modules/events/event-bus.service.ts`) — **Redis Pub/Sub 기반**입니다. `publish()` 는 `kaster:cti:events` 채널에 `{event, payload, sourceNode}` JSON 을 발행하고, `onModuleInit` 에서 `createSubscriberClient()` 로 전용 sub 클라이언트를 열어 같은 채널을 구독합니다. 수신 시 `RealtimeGateway.broadcast()` 로 로컬 WS 클라이언트에 전달합니다. 이 구조로 멀티 WS 노드가 동일한 이벤트 스트림을 공유합니다. Redis 장애 시에는 로컬 fallback 으로 직접 broadcast.
5. **`TransferDetectorService`** (`modules/calls/transfer-detector.service.ts`) — `BlindTransfer`/`AttendedTransfer` 이벤트를 받아 `attendedTransferCandidates` 테이블에 phase 를 기록하고, 연결된 `callTransfers` row 의 `transferResult`를 `COMPLETED` 로 마감합니다. 중간 phase (`CONSULT_RINGING`/`CONSULT_TALKING`/`REBRIDGING`) 추적은 후속 확장.
6. **`RealtimeGateway`** (`modules/realtime/realtime.gateway.ts`) — `/ws` namespace, CORS `*`. `server` 필드가 `any`로 선언되어 있어 타입 가정 없이 `.emit`을 호출합니다.

**중요한 아키텍처 제약**: `linkedid`는 Asterisk가 통화 전체(트렁크 → IVR → 큐 → 에이전트 → 전환) 동안 유지하는 식별자이므로, 세션을 이어 붙이려면 반드시 이 값을 쓰세요. `uniqueid`는 개별 channel leg용이며 `callLegs` 테이블에서 사용됩니다.

### 리더 선출과 멀티노드
- `AmiLeaderElectionService` (`modules/redis/ami-leader-election.service.ts`)는 Redis `SET kaster:ami:leader <nodeId> PX 10000 NX`로 5초마다 리더십을 갱신합니다. `RedisModule`은 `@Global()`이라 어디서든 DI 가능합니다.
- **가드 적용 지점**: (1) `AmiConnectionService` — TCP 연결 자체는 모든 노드에서 유지하되 리더가 아닐 때 `sessionEngine.processNormalizedEvent` 호출을 건너뜁니다. 이유: 리더십 전환 시 재접속 지연을 없애고 takeover 속도를 확보하기 위함. (2) `OutboxPublisherService.flush` — 리더만 outbox를 DB에서 꺼내 발행. (3) `SessionRecoverySweeperService.sweep` — 리더만 stale 세션을 복구. 따라서 멀티노드 배포 시 동일 이벤트가 N번 DB에 기록되거나 동일 세션이 N번 종료되는 일은 없습니다.

### Outbox 패턴과 세션 복구
- `SessionEngineService`는 상태 전이를 `prisma.$transaction` 안에서 `callSessions` 갱신 + `eventOutbox` row 적재 쌍으로 수행합니다. 따라서 **DB 커밋과 이벤트 발행 큐 적재가 원자적**입니다.
- `OutboxPublisherService` (`modules/outbox/`)는 3초 주기로 `eventOutbox`에서 `publishedAt IS NULL` 행을 최대 100건 꺼내 `EventBusService.publish` 로 흘립니다. 리더 노드에서만 동작.
- `SessionRecoverySweeperService` (`modules/session-recovery/finalizer/`)는 15초마다 `updatedAt`이 10분 이상 오래된 비-ENDED 세션을 찾아 `resultCode: 'RECOVERY_TIMEOUT'`으로 강제 종료합니다. AMI 이벤트 누락 시 세션이 열린 채로 남지 않게 하는 안전망. 리더 전용.
- **후속 개선 여지**: 현재 `EventBusService.publish` 는 직접 `RealtimeGateway.broadcast` 를 호출합니다. WS 서버가 여러 대일 때는 각 노드 클라이언트만 받게 되므로, 이 레이어를 Redis Pub/Sub 로 교체하는 것이 conv 44 설계의 남은 작업입니다.

### 글로벌 미들웨어 (`src/main.ts`)
- `enableShutdownHooks()` — SIGTERM 시 `onModuleDestroy` 체인이 Prisma/Redis/AMI/WS 를 graceful close
- `enableCors()` — `REST_CORS_ORIGIN` env (기본 `http://localhost:5173,http://localhost:5174`). `credentials: true`
- `ValidationPipe({ whitelist: true, transform: true })` — DTO 미정의 필드 자동 제거 + 타입 변환
- `ResponseTransformInterceptor` — 컨트롤러 반환값을 `{ success, data, error }` 로 자동 래핑 (이미 envelope 형태면 pass-through)
- `AllExceptionsFilter` — `HttpException` / `Prisma.PrismaClientKnownRequestError` / 일반 Error 를 공통 envelope 으로 변환. `P2002 -> 409 CONFLICT`, `P2025 -> 404 NOT_FOUND` 매핑

### 권한 모델
- `JwtAuthGuard` — `@nestjs/passport` + `passport-jwt` 기반. `JwtStrategy.validate()` 가 payload 를 그대로 `request.user` 에 주입
- `RolesGuard` + `@Roles(...)` 데코레이터 — `JwtAuthGuard` 뒤에 쓰면 역할 검사. `@Roles('supervisor','admin')` 처럼 OR 조건
- `AdminController.dashboard` 는 `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('supervisor','admin')`
- `AgentsController.changeStatus` 는 `user.sub !== agentId && !SUPERVISORY_ROLES.has(user.role)` 인라인 체크 (본인 또는 감독 역할만 허용)
- 본격 RBAC 확장 시 `@Roles` 패턴을 다른 컨트롤러에도 적용 가능

### API / 도메인 모듈
- `auth`:
  - `POST /auth/login` — `loginId + extension` 으로 `agents` 조회 후 `bcrypt.compare(dto.password, agent.loginPasswordHash)` 검증. 성공 시 **access token (15분) + refresh token (14일)** 쌍 발급. refresh token 원본은 클라이언트만 보관하고, 서버는 **SHA-256 해시만** `refreshTokens` 테이블에 저장.
  - `POST /auth/refresh` — refresh 원본 → sha256 → DB 조회. 유효하면 **기존 토큰 revoke + 새 access/refresh 발급** (재사용 공격 방지 토큰 회전).
  - `POST /auth/logout` — refresh 원본 → sha256 → `revokedAt` 설정. 토큰 없어도 멱등 성공.
  - `POST /auth/logout-all` (JWT 필요) — 해당 agent 의 모든 활성 refresh token revoke.
  - `GET /me/session` — 현재 JWT 기반 상담원 조회.
  - JWT 비밀은 `JWT_SECRET` 환경변수 (기본값 `change_me` — 운영 필수 변경).
- `calls`:
  - `GET /calls/active`, `GET /calls/:callId` — 조회
  - `POST /calls/originate` → `AsteriskManagerService.originate()` → `AmiConnectionService.sendAction({Action:'Originate', ...})`
  - `POST /calls/:callId/transfer` — `call_legs` 에서 **`legType === 'agent' && !endedAt`** 인 leg 를 찾아 (단순 "가장 최근" 휴리스틱이 아님) `Redirect` 를 `transfer-target` context 로 점프 (`infra/asterisk/extensions_transfer.conf`). `transferType === 'attended'` 면 `AsteriskManagerService.attendedTransfer()`, 아니면 `blindTransfer()`.
  - `POST /calls/:callId/hangup` — 같은 leg 선택 규칙으로 `Action:Hangup` 전송.
  - `POST /calls/:callId/memo` — `callMemos` 저장.
  - **성공 판정**(conv 40): 모든 AMI 제어 명령의 성공은 `OriginateResponse` 가 아니라 후속 `DialBegin/DialEnd/BridgeEnter/Newstate(Up)` 이벤트를 SessionEngine 이 받아 판정합니다. REST 는 `accepted:true` 즉시 반환.
  - `BlindTransfer` / `AttendedTransfer` AMI 이벤트는 `TransferDetectorService` 가 `attendedTransferCandidates` 에 기록하고 `callTransfers.transferResult` 를 `COMPLETED` 로 확정합니다.
- `agents`, `health`는 얇은 컨트롤러입니다.
- **확장 모듈** (admin 화면 기능 단위):
  - `customers` — 고객/번호 마스터 (CRUD + 검색)
  - `opt-out` — 수신거부 / 발신 차단 목록
  - `announcements` — 공지/안내 메시지
  - `sms-templates` — 발신 SMS 템플릿
  - `smart-ars` — 동적 IVR/ARS 시나리오
  - `asterisk-config` — Asterisk pjsip/dialplan/queue/IVR 설정을 DB → conf 파일 렌더링. `renderers/` 아래에 단위 테스트 (`agent-dialplan.renderer.spec.ts`) 포함. 변경 시 marker guard 후 reload
  - `monitoring` — 운영 헬스 / Prometheus 노출
  - `agent-updates` — 데스크톱 앱 자동 업데이트 매니페스트 (`UpdateClient` 가 폴링)
- 모든 응답은 `{ success, data, error }` 형태를 따릅니다. 새 엔드포인트를 추가할 때 이 envelope 을 유지하세요.
- **모듈 의존성**: `CallsModule` ↔ `AmiModule` 은 `forwardRef` 로 순환을 해결합니다 (CallsService → AsteriskManagerService → AmiConnectionService, AmiConnectionService → SessionEngineService). 재배치 시 주의.

### DB 스키마 (`prisma/schema.prisma`)
- 멀티테넌시: 거의 모든 테이블이 `tenantId`(UUID)를 파티션 키로 가집니다. 새 쿼리를 작성할 때 `tenantId` 조건을 반드시 포함하세요. `callSessions`의 유니크 제약은 `(tenantId, linkedid)`, `callLegs`는 `(tenantId, uniqueid)`, `rawAmiEvents`는 `(tenantId, eventFingerprint)` (dedupe) 입니다.
- 핵심 테이블: `tenants`, `agents`, `queues`, `queueAgentMembers`, `customers`, `customerPhones`, `agentStatusHistory`, `callSessions`, `callLegs`, `queueEvents`, `callRecordings`, `callMemos`, `callTransfers`, `rawAmiEvents`, `eventOutbox`, `attendedTransferCandidates`, `refreshTokens`.
- 마이그레이션 2개:
  - `prisma/migrations/20260414_init/` — 초기 전체 스키마 (conv 45 기준).
  - `prisma/migrations/20260414_ops_followup/` — `eventFingerprint` 컬럼 + unique index, `attendedTransferCandidates` 테이블, `refreshTokens` 테이블 (share 69de045b 후속 4건 반영).
- 시드 (`prisma/seed.ts`)는 고정 UUID 로 tenant + 일반 에이전트 + supervisor + queue + 고객 + 전화번호 + **진행 중인 callSession** (callLegs 2개, queueEvents 2개, callTransfer 1개 포함) 을 만듭니다. 데모/QA 에서 화면이 "뭔가 들어찬" 상태를 보여주기 위함. `AmiEventNormalizerService`가 이벤트에 `TenantId`가 없으면 `...0001`로 폴백하는 이유도 이 시드와 맞물려 있습니다.
- 기본 로그인 계정: `agent1001 / Password123! / 1001`, `supervisor1 / Password123! / 2001`. 비밀번호는 `SEED_DEMO_PASSWORD` 환경변수로 override 가능.

### 설정 / 시크릿
- 서버 환경변수는 모두 `apps/server/.env.example`에 나열되어 있습니다: `PORT`, `DATABASE_URL`, `JWT_SECRET`, `REDIS_HOST/PORT`, `AMI_HOST/PORT/USERNAME/SECRET/RECONNECT_MS`.
- `.gitignore`는 `.env`, `node_modules/`, `dist/`, `coverage/`, `*.wav`, `*.mp3`, `*.log`를 무시합니다. 녹취 파일(`*.wav`, `*.mp3`)이 제외 목록에 있다는 점을 기억하세요 — 테스트용 샘플을 커밋하지 마세요.

## 참고 문서

### 기획·설계 원본 PDF
- `docs/01_project_overview.pdf` — 프로젝트 개요
- `docs/02_practical_design.pdf` — 실전 개발용 상세 설계서
- `docs/03_db_api_asterisk_spec.pdf` — DB / API / Asterisk 스펙

### 보조 설계 문서 (ChatGPT 세션 추출)
- `docs/design/sip-trunk-spec-template.md` — 통신사에 보낼 SIP Trunk 요청 표준 포맷 + Asterisk 매핑 가이드
- `docs/design/hotlink-vs-hybrid-proposal.md` — 대리운전 업계의 핫링크 방식 vs Hybrid 방식 비교·권장
- `docs/design/operations-architecture.md` — 멀티노드·Redis·장애복구 운영 아키텍처 (현재 `modules/redis`, `modules/outbox`, `modules/session-recovery` 의 설계 원전)

### 소스 아카이브
- `docs/chatgpt-sessions-analysis.md` — 45개 ChatGPT 대화 통합 분석 리포트. 현재 레포의 어느 부분이 어느 대화에서 나왔는지 역추적할 때 사용
- `docs/chatgpt-archive/conversations.json` — 대화 전체 본문 (1.1MB)
- `docs/chatgpt-archive/preview.md` — 대화 압축 프리뷰
- `docs/chatgpt-archive/extract.py` — ChatGPT share 페이지 디코더 (재수집용)

API 엔드포인트 형상이나 AMI 이벤트 처리 규칙에 대해 모호한 점이 있으면 코드를 고치기 전에 이 PDF들과 `docs/design/` 문서를 먼저 참고하세요.
