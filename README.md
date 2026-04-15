# KAster_CTI

Asterisk 기반 콜센터 CTI 프로젝트 풀 패키지입니다.

## 포함 범위

- Asterisk 22 + PJSIP / Dialplan / AMI 설정 초안
- NestJS + Prisma 기반 CTI Middleware
- Vite + React + Tailwind + Ant Design 기반 상담원 웹 앱 골격
- Redis 리더 선출 + Pub/Sub 이벤트 버스
- AMI TCP 클라이언트 (배너 대기 핸드셰이크, 자동 재접속)
- linkedid 중심 Session Engine + fingerprint 중복 제거
- REST API + WebSocket 실시간 브로드캐스트
- DB Outbox publisher + Session recovery sweeper
- bcrypt 해시 로그인 + access/refresh token + logout 엔드포인트
- Attended/Blind Transfer Detector
- Prisma 스키마 + 초기 migration SQL + 운영 후속 migration
- Docker Compose (Postgres + Redis)

## 디렉터리

```
apps/server/       NestJS + Prisma 백엔드 (CTI Middleware)
apps/web/          Vite + React + Tailwind + Antd 상담원 웹 앱
infra/asterisk/    Asterisk 설정 초안
docs/              기획/설계 PDF + ChatGPT 세션 분석 + 보조 설계 문서
scripts/           운영 스크립트 (GitHub push 등)
docker-compose.yml Postgres 16 + Redis 7
```

## 빠른 시작 — 백엔드

```bash
cp apps/server/.env.example apps/server/.env
docker compose up -d postgres redis

cd apps/server
npm install
npx prisma generate
npx prisma migrate deploy
npx ts-node prisma/seed.ts     # 선택: 데모 데이터
npm run start:dev
```

- Swagger: http://localhost:3000/docs
- WebSocket: ws://localhost:3000/ws
- 기본 로그인: `agent1001 / Password123! / 1001` (seed 시)

## 빠른 시작 — 프론트엔드

```bash
cd apps/web
npm install
npm run dev
```

브라우저에서 http://localhost:5173 접속. 현재는 Mock REST / Mock WebSocket
기반이므로 백엔드 없이 바로 화면을 띄울 수 있습니다. 실제 연동 교체 포인트는
`apps/web/src/api/mockApi.ts` 와 `apps/web/src/mock/mockSocket.ts` 입니다.

## 서버 주요 엔드포인트

인증:
- `POST /api/v1/auth/login`  — bcrypt 검증, access(15m) + refresh(14d) 발급
- `POST /api/v1/auth/refresh` — refresh token 회전
- `POST /api/v1/auth/logout`  — refresh token revoke
- `POST /api/v1/auth/logout-all` — 해당 에이전트의 전 세션 종료
- `GET  /api/v1/me/session`

콜 제어 (JWT 필요):
- `GET  /api/v1/calls/active`
- `GET  /api/v1/calls/:callId`
- `POST /api/v1/calls/originate` — 실제 AMI Originate 전송
- `POST /api/v1/calls/:callId/transfer` — blind/attended 전환
- `POST /api/v1/calls/:callId/hangup`
- `POST /api/v1/calls/:callId/memo`

상담원 상태:
- `POST /api/v1/agents/:agentId/status`

큐/헬스:
- `GET /api/v1/queues/summary`
- `GET /api/v1/health`

## 운영 메모

- 실제 AMI 이벤트 필드는 통신사/버전/구성에 따라 다르므로 `AmiEventNormalizerService` 가 튜닝 포인트입니다.
- 멀티노드 배포 시 AMI 이벤트 소비·Outbox 발행·세션 복구는 Redis 리더 락을 잡은 노드에서만 실행됩니다.
- AMI 이벤트는 Redis dedupe key + DB unique index 이중 방어선으로 중복 처리가 차단됩니다.
- WebSocket 이벤트는 Redis Pub/Sub 을 거쳐 모든 WS 노드로 fan-out 됩니다.
- 자세한 아키텍처는 `docs/chatgpt-sessions-analysis.md` 와 `docs/design/operations-architecture.md` 참고.

## 핵심 설계 문서

- `docs/01_project_overview.pdf` — 프로젝트 개요
- `docs/02_practical_design.pdf` — 실전 개발용 상세 설계서
- `docs/03_db_api_asterisk_spec.pdf` — DB / API / Asterisk 스펙
- `docs/chatgpt-sessions-analysis.md` — 46개 ChatGPT 세션 통합 분석 리포트
- `docs/design/sip-trunk-spec-template.md` — 통신사 SIP Trunk 스펙 요청 표준 포맷
- `docs/design/hotlink-vs-hybrid-proposal.md` — 핫링크 vs Hybrid 구조 비교
- `docs/design/operations-architecture.md` — 멀티노드 운영 아키텍처 원전
