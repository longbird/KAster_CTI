# 공지사항 상담원 웹 연결 검증

일시: 2026-05-05
대상: 기본 개발 서버 `blueadm@49.247.46.86:/home/blueadm/kaster_cti`

## 변경 범위

- 상담원 인증 토큰으로 조회 가능한 `GET /api/v1/announcements` API 추가
- 상담원 웹 앱 Full/Mini 화면에 공지 패널 연결
- 고정 공지 우선 정렬, 빈 목록 숨김 처리
- mock/real API와 CTI store 초기 조회 흐름에 공지 목록 추가

## 로컬 검증

- `apps/server`: `npm test -- --runTestsByPath test/announcements.controller.spec.ts test/auth-softphone-config.integration.spec.ts`
  - 결과: 2 suites, 3 tests PASS
- `apps/server`: `npm run build`
  - 결과: PASS
- `apps/web`: `npm test -- AnnouncementsPanel.test.tsx useCtiStore.test.ts`
  - 결과: 2 files, 6 tests PASS
- `apps/web`: `npm run build`
  - 결과: PASS

## 원격 배포 검증

- 실행: `docker compose -f docker-compose.dev.yml up -d --build server web`
- 결과: `kaster-server`, `kaster-web` 재빌드 및 기동 완료
- 서버 health: `GET http://127.0.0.1:3000/api/v1/health`
  - 결과: `success: true`, `db: up`, `redis: up`, `ami: connected`
- 상담원 공지 API: `GET http://49.247.46.86:3000/api/v1/announcements`
  - 인증: `agent1001 / 1001`
  - 결과: `success: true`, 기존 QA 공지 1건 응답
- 웹 앱: `GET http://49.247.46.86:5173/`
  - 결과: HTTP 200, React root 포함

## PBX 설정 충돌 확인

- `kaster-server` mount 목록: `[]`
- `/etc/asterisk/.kaster-cti-config-owner`: `rehearsal-20260501`
- 서버 로그: disabled conf dir 경고 후 AMI reload skip

기본 개발 서버는 API/WS/AMI 확인용으로 기동하며, 실제 PBX 설정 파일 쓰기는 rehearsal site가 계속 소유한다.
