# admin-dashboard-vite

Vite + React + TypeScript + Ant Design 기준의 CTI 관리자 대시보드 파일셋입니다.

## 실행

```bash
npm install
npm run dev
```

## 빌드

```bash
npm run build
npm run preview
```

## 현재 포함 내용

- 관리자 대시보드 1페이지
- KPI 카드
- 시간대별 유입량 차트형 카드
- Queue 요약 테이블
- 팀별 상담원 현황
- 실시간 활성 콜 테이블
- 시스템 경보 패널
- 5초 주기 mock 데이터 갱신

## 실제 API로 바꾸는 위치

- `src/features/dashboard/api/dashboardApi.ts`

현재는 mock 데이터를 반환합니다. 나중에 실제 백엔드가 붙으면 이 파일에서 `/admin/dashboard` 호출로 교체하면 됩니다.

## 추천 다음 단계

- Axios 인스턴스 추가
- 로그인/권한 라우팅 추가
- Socket.IO 또는 WebSocket 연결 추가
- Queue 상세 페이지 추가
- 상담원 상세 drawer 추가
