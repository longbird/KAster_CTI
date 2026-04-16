# Admin Stage 2 실행 계획

작성일: 2026-04-16

## 목표

관리자 Stage 2 범위를 다음 6개 메뉴 기준으로 정리하고, 구현은 데이터 재사용형 기능부터 순차적으로 닫는다.

- `/reports/missed` 미연결 콜 내역
- `/reports/recordings` 녹취 내역 조회
- `/reports/logs` 호 로그 (raw AMI)
- `/settings/branches` 지사 설정
- `/settings/permissions` 권한 설정
- `/announcements` 공지사항

## 현재 상태 요약

- `missed`, `recordings`는 프론트와 백엔드 조회 경로가 이미 존재한다.
- `logs`는 원천 데이터(`rawAmiEvents`)는 있으나 조회 API와 화면이 없다.
- `announcements`는 프론트 localStorage 임시 구현만 있고 서버 저장소가 없다.
- `branches`, `permissions`는 현재 스키마와 API에 도메인 개념이 없어 설계 선행이 필요하다.

## 구현 원칙

1. 기존 스키마를 재사용할 수 있는 기능을 먼저 완료한다.
2. Stage 2 안에서도 신규 도메인 테이블이 필요한 기능은 별도 설계 후 구현한다.
3. 관리자 기능은 모두 `supervisor/admin` 권한 하에 동작하게 유지한다.
4. 응답 형식은 기존 `{ success, data, error }` envelope을 유지한다.

## 실행 순서

### Phase A: 빠르게 닫을 수 있는 기능

- [x] `/reports/missed`
- [x] `/reports/recordings`
- [x] `/reports/logs`
- [x] `/announcements`

설명:
- `missed`, `recordings`는 이미 구현되어 있으므로 QA와 정제만 남았다.
- 이번 tranche에서는 `logs`와 `announcements`를 실제 사용 가능한 수준으로 구현한다.

### Phase B: 신규 도메인 1차 구현

- [x] `/settings/permissions`
- [x] `/settings/branches`

설명:
- `permissions`는 1차 범위로 역할별 메뉴 접근 설정까지 구현했다.
- `branches`는 1차 범위로 branch CRUD까지 구현했다.
- branch-queue/agent 매핑과 런타임 권한 강제는 다음 tranche로 남긴다.

## 이번 tranche 구현 범위

### 1. AMI 로그 조회

백엔드:
- `GET /admin/reports/ami-logs`
- 필터: 기간, eventName, linkedid
- 페이지네이션: `page`, `pageSize`
- 응답: `rows`, `page`, `pageSize`, `total`

프론트:
- `/reports/logs` 전용 페이지 추가
- 필터 UI + 표 + payload 미리보기 drawer

### 2. 공지사항 서버 저장

백엔드:
- `announcements` 테이블 추가
- `GET /admin/announcements`
- `POST /admin/announcements`
- `DELETE /admin/announcements/:id`

프론트:
- 기존 localStorage 기반 공지사항 페이지를 API 기반으로 전환
- 등록/조회/삭제 동작 구현

## 다음 tranche 선행결정

### `/settings/permissions`

우선 결정할 항목:
- 역할 고정형(`agent/supervisor/admin`) 유지 여부
- 메뉴 단위 권한만 필요한지
- 액션 단위(CRUD) 권한까지 필요한지

현재 1차 구현:
- 역할별 메뉴 접근 설정
- 관리자 앱 메뉴 노출 및 페이지 접근 차단 연결
- `admin/*`, `asterisk-config/*` 주요 API 서버 권한 강제
- `calls/*`, `agents/*`, `queues/*`의 관리자/감독자용 조회 경로 서버 권한 강제

### `/settings/branches`

우선 결정할 항목:
- 지사와 tenant의 관계
- 지사별 DID/Queue/Agent 소속 모델
- 지사 관리자 권한 분리 여부

현재 1차 구현:
- branch CRUD
- branch별 상담원/큐 매핑

다음 단계 권장 범위:
- DID 매핑
- 지사 기반 필터/집계 반영

현재 추가 구현:
- DID 매핑
- 대시보드 지사 필터
- 통화내역/미연결/녹취/호 로그 지사 필터

## 현재 구현 상태

- Stage 2 대상 6개 메뉴는 모두 1차 구현 완료 상태다.
- 지사 설정은 CRUD + 상담원/큐/DID 매핑 + 주요 관리자 화면 지사 필터까지 반영됐다.
- 권한 설정은 관리자 프론트 메뉴/페이지 차단과 서버 API 권한 강제까지 확장됐다.

현재 서버 권한 강제 범위:
- `admin/*`
- `asterisk-config/*`
- `calls/active`, `calls/history`, `calls/recordings/list`
- `agents`의 감독자용 조회/변경 경로
- `queues/summary`, `queues`, `queues/:id`

남은 후속:
- 상담원 본인용 API와 감독자용 API의 경계 재점검
- 액션 단위 세분화 권한이 필요하면 메뉴 권한과 별도 모델로 확장
- 빌드/타입체크 및 실제 운영 시나리오 검증

## 완료 기준

- `/reports/logs`에서 최근 raw AMI 이벤트를 검색·열람할 수 있다.
- `/announcements`가 브라우저 localStorage가 아니라 서버 DB에 저장된다.
- 기존 `missed`, `recordings`는 Stage 2 완료 항목으로 간주하고 QA만 남긴다.
- `branches`, `permissions`는 별도 설계 결정을 위한 입력 항목이 문서화된다.
