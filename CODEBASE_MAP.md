# CODEBASE_MAP.md

탐색 기준일: 2026-05-09

스캔 범위: `apps/server`, `apps/admin`, `apps/web`, `apps/desktop`, `deploy`, `infra`, `tools`, `scripts`, `docs`
제외 범위: `node_modules`, `dist`, `out`, `coverage`, 대형 압축/배포 산출물
스캔 파일 수: `rg --files` 기준 약 783개

## 1. 프로젝트 개요

- 기술 스택:
  - 백엔드: NestJS 10, Prisma 5, PostgreSQL, Redis/ioredis, Socket.IO, Jest
  - 관리자 앱: Vite 5, React 18, Ant Design 5, Zustand, axios, Vitest
  - 상담원 웹 앱: Vite 7, React 19, Ant Design 5, Tailwind, Zustand, socket.io-client, Vitest
  - 데스크톱 앱: Electron 33, electron-vite, React 19, sip.js, Zustand, Vitest
  - 운영/인프라: Docker Compose, nginx, coturn, PBX 설정 초안, C++ PBX loadgen
- 진입점:
  - 서버: `apps/server/src/main.ts`, `apps/server/src/app.module.ts`
  - 관리자 앱: `apps/admin/src/main.tsx`, `apps/admin/src/app/router.tsx`
  - 상담원 웹 앱: `apps/web/src/main.tsx`, `apps/web/src/App.tsx`
  - 데스크톱 앱: `apps/desktop/src/main/index.ts`, `apps/desktop/src/renderer/src/main.tsx`
- 빌드/실행 명령:
  - 서버: `cd apps/server && npm run build`, `npm test`, `npm run start:dev`
  - 관리자 앱: `cd apps/admin && npm run build`, `npm test`, `npm run dev -- --port 5174`
  - 상담원 웹 앱: `cd apps/web && npm run build`, `npm test`, `npm run dev`
  - 데스크톱 앱: `cd apps/desktop && npm run build`, `npm test`, `npm run pack:dir`

## 2. 디렉토리 지도

| 경로 | 의미 | 비고 |
|---|---|---|
| `apps/server` | NestJS CTI 미들웨어 | API, AMI, Redis, Prisma, PBX 설정 렌더링, 운영 모듈 집중 |
| `apps/admin` | supervisor/admin 관리자 대시보드 | 메뉴/RBAC, 설정 CRUD, 리포트, 운영 화면 |
| `apps/web` | 상담원 웹 앱 | Mini/Full 셸, 통화/상태 UI, 실시간 WS, 데스크톱 handoff |
| `apps/desktop` | Windows 데스크톱 소프트폰 | Electron main/preload/renderer, SIP UA, 로컬 브리지, 업데이트 |
| `deploy/sites/_template` | 사이트별 운영 배포 템플릿 | `compose.prod.yml`, nginx, `.env.example`, 수동 배포 문서 |
| `infra/asterisk` | PBX 설정 초안 | 내부 경로/식별자는 기존 계약 유지, 외부 표기는 PBX 필요 |
| `tools/pbx-loadgen` | PBX 부하/시나리오 도구 | C++/CMake 기반 |
| `scripts` | 운영/검증 스크립트 | dev deploy, PBX smoke, Smart ARS prompt, push |
| `docs` | 설계/운영/QA 문서 | `docs/qa`, `docs/design`, `docs/operations`, work-log 포함 |

## 3. 도메인 핵심

| 모듈/파일 | 역할 | 복잡도 | 의존 |
|---|---|---|---|
| `apps/server/src/modules/calls/session-engine.service.ts` | AMI 정규화 이벤트를 통화 세션 상태로 반영 | 높음 | Prisma, Redis dedupe, outbox, transfer detector |
| `apps/server/src/modules/ami/ami-connection.service.ts` | AMI TCP 연결, 배너 수신 후 로그인, 이벤트 수신 | 높음 | net.Socket, leader election, session engine |
| `apps/server/src/modules/events/event-bus.service.ts` | Redis Pub/Sub 기반 WS fanout | 중간 | Redis, RealtimeGateway |
| `apps/server/src/modules/outbox/outbox-publisher.service.ts` | DB outbox 발행 | 중간 | Prisma, EventBus, leader election |
| `apps/server/src/modules/asterisk-config/*` | DB 기반 PBX 설정 렌더링/반영 | 높음 | Prisma, filesystem, reload guard |
| `apps/server/src/modules/admin/admin.service.ts` | 관리자 설정/운영 API 핵심 서비스 | 높음 | Prisma, 권한/테넌트 검증 |
| `apps/admin/src/app/router.tsx` | 관리자 라우트 정의 | 중간 | AppLayout, 권한 메뉴와 동기화 필요 |
| `apps/admin/src/shared/permissions/menuConfig.tsx` | 관리자 메뉴/권한 surface | 중간 | 서버 `MenuPermissionService`와 동기화 필요 |
| `apps/desktop/src/shared/ipc.ts` | Electron IPC 계약 | 높음 | main/preload/renderer 전체 |
| `apps/desktop/src/main/index.ts` | Electron main orchestration | 높음 | BrowserWindow, Tray, IPC, bridge, runtime |
| `apps/desktop/src/renderer/src/store/useDesktopStore.ts` | 데스크톱 렌더러 단일 상태 저장소 | 높음 | IPC, softphone runtime, UI components |
| `apps/web/src/store/useCtiStore.ts` | 상담원 웹 CTI 상태/명령 | 중간 | API, WS, UI shell |

## 4. 외부 경계 (I/O)

- DB:
  - Prisma datasource는 `apps/server/prisma/schema.prisma`.
  - 핵심 모델은 `callSessions`, `callLegs`, `rawAmiEvents`, `eventOutbox`, `refreshTokens`, `agents`, `queues`, `customers`, PBX 설정 계열 모델.
  - 멀티테넌시 쿼리는 `tenantId` 조건이 핵심 제약.
- HTTP:
  - 서버 글로벌 prefix는 `api/v1`.
  - 관리자/웹/데스크톱 모두 axios 기반 REST 클라이언트를 사용.
  - 데스크톱 업데이트는 `/agent-updates/manifest`, download-init 계열 API를 사용.
- 파일/OS:
  - PBX 설정 렌더링/반영, marker guard, Electron 설정 저장소, 토큰 vault, 서명/패키징 스크립트가 파일/OS 경계.
- 메시지:
  - Redis leader election, AMI dedupe, Pub/Sub `kaster:cti:events`.
  - Socket.IO namespace `/ws`.
  - AMI TCP는 PBX 배너 수신 후 Login 전송.
  - Electron IPC는 `apps/desktop/src/shared/ipc.ts`를 계약 원천으로 사용.

## 5. Hotspot (Git)

최근 6개월 변경 빈도/라인 변경 기준 주요 hotspot입니다.

| 파일 | 최근 6M 수정 | 테스트 유무 | 메모 |
|---|---:|---|---|
| `apps/admin/src/components/AppLayout.tsx` | 높음 | 간접 | 관리자 전체 레이아웃/권한/라우팅 영향 |
| `apps/desktop/src/renderer/src/styles.css` | 높음 | 일부 | 데스크톱 UX 회귀 가능 |
| `apps/server/src/modules/admin/admin.service.ts` | 높음 | 있음 | 관리자 설정/테넌트 검증 핵심 |
| `apps/server/src/modules/calls/calls.service.ts` | 높음 | 있음 | AMI 제어/통화 API 핵심 |
| `apps/server/prisma/schema.prisma` | 높음 | 간접 | migration/generate 필요 |
| `apps/server/src/modules/asterisk-config/asterisk-reload.service.ts` | 높음 | 있음 | PBX 반영/운영 guard |
| `apps/admin/src/app/router.tsx` | 높음 | 일부 | 메뉴 권한과 1:1 동기화 필요 |
| `apps/admin/src/shared/permissions/menuConfig.tsx` | 높음 | 있음 | 서버 권한 기본값과 동기화 필요 |
| `apps/desktop/src/shared/ipc.ts` | 높음 | 간접 | main/preload/renderer 동시 변경 필요 |
| `apps/desktop/src/main/index.ts` | 높음 | 있음 | Electron lifecycle/IPC/창 제어 |

주의: tracked 임시/도구 산출물(`.tmp*`, `.codex`, `.lazyweb` 일부)이 검색과 hotspot 통계를 오염시킬 수 있습니다.

## 6. 테스트 상태

- 총 테스트 수:
  - 현재 실행 결과: 서버 207개, 관리자 58개, 웹 11개, 데스크톱 182개, 총 458개 통과.
  - 테스트 파일 분포: 서버 33개, 관리자 19개, 웹 5개, 데스크톱 37개, tools/pbx-loadgen 7개 확인.
- 프레임워크:
  - 서버: Jest
  - 관리자/웹/데스크톱: Vitest
  - tools/pbx-loadgen: CMake/Catch2 계열
- 커버리지 추정:
  - 서버: 핵심 상태 전이, 권한, PBX 렌더링, auth/desktop handoff까지 폭이 넓어 보통 이상.
  - 관리자: 메뉴/대시보드/고객/브랜치/일부 API 테스트는 있으나 전체 화면 E2E는 제한적.
  - 웹: 핵심 handoff/login/store 위주로 범위가 좁음.
  - 데스크톱: main/renderer/store/softphone 단위 테스트가 상대적으로 촘촘함.
- 신뢰도 + 근거:
  - 로컬 단위/통합 테스트 신뢰도는 보통 이상.
  - 실제 PBX, 운영 DB migration, 운영 배포, 다중 노드/Redis 장애, Electron packaged runtime은 별도 실환경 검증이 필요.

## 7. 안전 영역 vs 주의 영역

- 안전:
  - 순수 포맷터, 상태 표시 helper, PBX renderer 순수 함수, DTO/validation 단위 변경.
  - 단, Prisma schema 변경이 없는 범위에 한정.
- 주의:
  - `admin.service.ts`, `calls.service.ts`, `session-engine.service.ts`, `asterisk-config/*`, `asterisk-reload.service.ts`.
  - 관리자 메뉴/권한은 `apps/admin/src/shared/permissions/menuConfig.tsx`와 `apps/server/src/common/menu-permission.service.ts`를 같이 봐야 합니다.
  - 데스크톱 IPC는 `shared/ipc.ts`, `preload/index.ts`, `main/index.ts`, renderer store를 함께 변경해야 합니다.
  - softphone/DTMF/창 포커스/미디어 readiness는 회귀 테스트가 이미 존재할 정도로 민감합니다.
- 금지 (unsafe to touch without deeper study):
  - 운영 PBX reload/marker guard, AMI session state machine, Redis leader/outbox/fanout, Prisma migration, Electron update/signing 경로.

## 8. 미해결/불확실

- CC5W 프로젝트 산출물은 불완전합니다. `.claude/commands`, `CODEBASE_MAP.md`, `REQUIREMENTS.md`가 없었고, 이 파일이 최초 `CODEBASE_MAP.md`입니다.
- 루트 `package.json`의 `test`는 placeholder 실패 명령입니다. 실제 검증은 각 앱 디렉터리에서 수행해야 합니다.
- `docker-compose.dev.yml`은 이름과 달리 운영형 원격 배포 요소가 많습니다. 운영/개발 명명 정리가 필요합니다.
- `apps/server/prisma/migrations`는 37개 migration으로 누적되어 있습니다. 운영 전 `migrate deploy`, 백업, rollback 절차 검증 우선순위가 높습니다.
- 실제 PBX AMI 필드 변형, Redis 리더 전환, 운영 DB 상태, 다중 WS 노드 fanout은 정적 분석만으로 확정할 수 없습니다.
- 현재 작업트리는 `main...origin/main`이며 미추적 파일 `docs/plans/business-30-concurrent-call-development-plan-20260509.md`가 있습니다.

## 9. 이번 탐색의 실제 검증 결과

실행한 명령:

```bash
cd apps/server && npm test -- --runInBand
cd apps/admin && npm test -- --runInBand
cd apps/web && npm test -- --runInBand
cd apps/desktop && npm test -- --runInBand
```

결과:

| 앱 | 결과 |
|---|---|
| `apps/server` | 33 suites, 207 tests passed |
| `apps/admin` | 19 files, 58 tests passed |
| `apps/web` | 5 files, 11 tests passed |
| `apps/desktop` | 37 files, 182 tests passed |

빌드, 패키징, 실제 운영 서버, 실제 PBX 연동, 브라우저 화면 검증은 이번 탐색 범위에서 실행하지 않았습니다.
