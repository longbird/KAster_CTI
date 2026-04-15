# CTI Agent Vite Skeleton

Asterisk 기반 CTI 상담원 앱용 실행 가능한 프론트엔드 골격입니다.

## 포함 내용

- Vite + React + TypeScript
- Tailwind CSS + Ant Design
- 상담원 CTI 기본 3열 레이아웃
- Mock REST API
- Mock WebSocket 이벤트
- Zustand 상태관리

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속.

## 빌드

```bash
npm run build
npm run preview
```

## 실제 연동 교체 포인트

- `src/api/mockApi.ts`
  - `/auth/login`
  - `/me/session`
  - `/agents/{agentId}/status`
  - `/calls/active`
  - `/calls/{callId}/memo`
  - `/calls/{callId}/transfer`
  - `/calls/{callId}/hangup`
  - `/queues/summary`

- `src/mock/mockSocket.ts`
  - `call.created`
  - `call.updated`
  - `call.ended`
  - `screenpop.customer`
  - `agent.status.changed`
  - `queue.summary.updated`

## 구조

```text
src/
  api/
  components/
  layout/
  mock/
  store/
  styles/
  types/
  utils/
```

## 화면 구성 기준

- 상단: 로그인 상담원, 상태, 내선, 오늘 통계
- 좌측: 상태 변경, 개인 큐/대기 현황
- 중앙: 현재 통화 카드, 고객 정보, 주문/이력 요약
- 우측: 메모 입력, 결과 코드, 전환/종료 제어
- 하단: 최근 통화 이력, 시스템 알림
