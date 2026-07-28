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
- 실 API 기반 데이터 갱신

## API 설정

- `VITE_API_BASE_URL`에 NestJS global prefix 포함 URL을 지정합니다.
- 대시보드는 `/admin/dashboard`와 `/calls/active`를 호출합니다.

## 추천 다음 단계

- Socket.IO 또는 WebSocket 연결 추가
- Queue 상세 페이지 추가
- 상담원 상세 drawer 추가
