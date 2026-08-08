# 관리자 앱 실시간 이벤트 소비 실행 계획

작성일: 2026-04-30

## 목표

관리자 대시보드가 CTI 서버의 `/ws` 실시간 이벤트를 소비해 통화, 상담원, 큐 상태 변화를 5초 폴링보다 빠르게 반영한다. 첫 단계는 기존 REST 조회 결과를 유지하면서 이벤트 수신 시 즉시 refresh를 수행하는 방식으로 구현한다.

## 범위

- admin 앱에 Socket.IO 클라이언트 의존성 추가
- `call.created`, `call.updated`, `call.ended`, `agent.status.changed`, `queue.summary.updated` 구독
- 대시보드 데이터 훅에 실시간 이벤트 기반 refresh 연결
- WebSocket 연결부 단위 테스트와 admin production build 검증

## 비범위

- 관리자 화면별 payload 직접 reducer 구현
- 큐/상담원/통화 상세 페이지의 별도 상태 모델 변경
- 실서버 브라우저 검증

## 구현 순서

1. WebSocket 연결 모듈 테스트 작성
2. `socket.io-client` 의존성 추가
3. `VITE_WS_URL` 또는 API base URL 기반 WS base URL 계산
4. 관리자 실시간 이벤트 구독 모듈 구현
5. 대시보드 훅에서 이벤트 수신 시 기존 `fetchDashboardData` 재호출
6. 단위 테스트와 build 검증

## 검증

- `apps/admin`: `npm test -- adminRealtime.test.ts`
- `apps/admin`: `npm run build`
