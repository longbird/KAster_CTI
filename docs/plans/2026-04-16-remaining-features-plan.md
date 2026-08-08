# KAster CTI 미구현 기능 실행 계획

작성일: 2026-04-16

## 목적

현재 저장소 기준으로 "1차 구현은 들어갔지만 아직 닫히지 않은 기능"과 "아예 stub 상태인 기능"을 분리해서, 이후 구현 순서를 현실적인 tranche로 정리한다.

## 현재 기준 판단

### 이미 1차 구현이 닫힌 영역

- 관리자 Stage 2 핵심 6개 메뉴
  - `reports/missed`
  - `reports/recordings`
  - `reports/logs`
  - `settings/branches`
  - `settings/permissions`
  - `announcements`
- 상담원/큐 CRUD
- Asterisk 설정 UI
- 지사 필터, DID 매핑, 서버 권한 강제 1차
- 기본 빌드/테스트/운영 배포 경로

### 실제 미구현 또는 미완료 영역

#### 1. 관리자 stub 페이지

현재 라우터 기준으로 아래 메뉴는 아직 placeholder 상태다.

- `/system`

근거:
- [router.tsx](D:/Work/AI_Projects/KAster_CTI/apps/admin/src/app/router.tsx)

#### 2. 상담원 앱 실사용 마감 미완료

상담원 앱은 기본 로그인/상태변경/메모/전환/종료는 붙어 있지만, 일부는 여전히 임시 구현이다.

- 통화 이력 조회가 아직 비어 있음
- 일부 화면은 mock 전제에서 설계된 흔적이 남아 있음
- 실시간 이벤트 기준 UI 상태 전이 검증이 더 필요함

근거:
- [realApi.ts](D:/Work/AI_Projects/KAster_CTI/apps/web/src/api/realApi.ts)
  - `getCallHistory()`가 현재 빈 배열 임시 구현

#### 3. 전환(Transfer) 고도화 미완료

현재는 `BlindTransfer`, `AttendedTransfer` 완료 판정 중심의 최소 구현이고, 실제 현장에서 필요한 중간 상태 추적과 실패 판정은 아직 없다.

- `CONSULT_RINGING`
- `CONSULT_TALKING`
- `REBRIDGING`
- consult 실패 판정
- transfer timeout sweep 정교화

근거:
- [transfer-detector.service.ts](D:/Work/AI_Projects/KAster_CTI/apps/server/src/modules/calls/transfer-detector.service.ts)

#### 4. 권한 모델 2차 고도화 미완료

현재는 메뉴 단위 접근 제어와 주요 서버 API 차단까지는 들어갔지만, 액션 단위 RBAC는 아직 없다.

- 조회/생성/수정/삭제 세분화
- 지사 관리자 전용 권한 집합
- 상담원 본인용 API와 감독자용 API 경계 재정리

#### 5. 운영 자동화/검증 미완료

- 실제 Asterisk conf write 결과를 운영 점검 절차로 정형화하지 않음
- 큐/트렁크/DID 변경 후 검증용 자동 스모크 스크립트 없음
- 배포 스크립트의 Windows 호환성 미흡

#### 6. 테스트 커버리지 미완료

현재 서버 테스트는 핵심 경로를 꽤 커버하지만, 아직 아래가 비어 있다.

- 지사 mappings CRUD/service 테스트
- Asterisk reload/file write 테스트
- 인증 refresh/logout-all 회전 테스트
- 관리자 stub 기능이 구현되면 그 API/service 테스트

## 우선순위

### P1: 바로 업무에 영향 주는 항목

1. 상담원 앱 통화 이력/API 마감
2. 관리자 stub 4개 중 운영 핵심 기능 구현
3. 운영 스모크 자동화

### P2: 운영 안정화 항목

1. 액션 단위 권한 모델
2. Transfer 상태/실패 판정 확장
3. Asterisk 변경 검증 절차 자동화

### P3: 확장 항목

1. 시스템 설정 화면
2. 고급 보고서/통계
3. 지사 관리자 전용 운영 모드

## 권장 구현 순서

## Phase 1. 관리자 stub 제거

대상:

- `/settings/forwarding`
- `/settings/prompts`
- `/blocklist`
- `/system`

권장 순서:

1. `시스템 설정`

이유:

- 앞의 3개는 운영자가 바로 체감하는 기능이고, 도메인 범위도 비교적 명확하다.
- `시스템 설정`은 범위가 쉽게 커지므로 가장 뒤에 두는 편이 안전하다.

세부 범위:

### 완료된 1차 구현

- `착신전환 설정`
- `멘트 관리`
- `080 수신거부`

### 1-1. 시스템 설정

1차 목표:

- tenant 단위 운영 옵션 저장
- 화면에서는 최소 설정만 노출

선행 설계:

- 녹취 기본 on/off
- 최대 대기시간 기본값
- 공통 타임존/날짜 포맷

## Phase 2. 상담원 앱 실사용 마감

대상:

- [realApi.ts](D:/Work/AI_Projects/KAster_CTI/apps/web/src/api/realApi.ts)
- 상담원 화면 최근 통화/이력 패널
- 실시간 이벤트 반영 경계

작업:

1. `getCallHistory()`를 실제 API에 연결
2. 상담원 본인 기준 recent calls endpoint 추가 또는 기존 history endpoint 재사용
3. 전환/종료/메모 후 UI 상태 전이 점검
4. Mini 모드 기준 수동 시나리오 QA

완료 기준:

- 상담원이 최근 통화내역을 실제 데이터로 볼 수 있다
- 메모 저장 후 후처리 흐름이 끊기지 않는다
- blind transfer / hangup / 상태변경이 실시간 피드와 충돌하지 않는다

## Phase 3. 권한 모델 2차

대상:

- 메뉴 권한 → 액션 권한 확장

작업:

1. `rolePermissions`와 별도 `actionPermissions` 모델 도입 여부 결정
2. 최소 액션 집합 정의
   - view
   - create
   - update
   - delete
   - operate
3. 관리자 프론트 버튼 레벨 차단
4. 서버 엔드포인트 액션별 강제

완료 기준:

- 메뉴 접근만이 아니라 버튼/엔드포인트 액션도 역할별로 분리된다
- supervisor/admin/지사관리자/agent 경계가 명확해진다

## Phase 4. Transfer 고도화

대상:

- [transfer-detector.service.ts](D:/Work/AI_Projects/KAster_CTI/apps/server/src/modules/calls/transfer-detector.service.ts)

작업:

1. consult ringing/talking 상태 추적
2. consult dial 실패 시 `FAILED` 판정
3. rebridge 판정
4. candidate sweep 기준 정교화
5. 운영 로그/리포트에 transfer 상태 노출

완료 기준:

- blind/attended transfer가 단순 완료 로그가 아니라 상태 머신으로 보인다
- 실패/성공/만료가 데이터상 구분된다

## Phase 5. 운영 자동화

대상:

- 배포
- 스모크 테스트
- Asterisk 반영 확인

작업:

1. Windows에서도 깨지지 않는 배포 스크립트 보강
2. 배포 후 자동 헬스체크 스크립트
3. 임시 큐 생성/삭제 + preview/API + health 검사 자동화
4. Asterisk conf 변경 확인 스크립트
5. 운영 runbook에 결과 기록 포맷 추가

완료 기준:

- 배포 후 반복하는 점검을 수동 명령 나열이 아니라 스크립트로 돌릴 수 있다
- Asterisk 연동 이상이 생기면 원인 파악 경로가 문서화된다

## 주차별 권장 일정

### 1주차

- 착신전환 설정 설계 및 1차 구현
- 상담원 앱 `getCallHistory` 실제 연결

### 2주차

- 멘트 관리
- 상담원 앱 실사용 QA

### 3주차

- 권한 모델 2차
- supervisor/admin 액션 권한 적용

### 4주차

- transfer detector 고도화
- 운영 스모크 자동화

### 5주차

- 시스템 설정 1차
- 서비스/운영 테스트 보강

## 구현 우선순위 결론

가장 먼저 들어갈 tranche는 아래가 적절하다.

1. `상담원 앱 통화 이력 실데이터화`
2. `시스템 설정`

이 두 개가 끝나면, 관리자 앱의 stub 메뉴는 사실상 제거되고 이후 일정은 운영 고도화 중심으로 전환된다.

## 메모

현재 코드는 "핵심 뼈대 + 관리자 1차 운영 기능"까지는 충분히 올라와 있다. 이후 일정은 기능 수보다 운영 리스크 순서로 잡는 것이 맞다. 따라서 남은 기능은 화면 개수 기준이 아니라 아래 순서로 진행한다.

- 현업 사용 흐름을 닫는 기능
- 운영자가 매일 쓰는 기능
- 장애/권한/자동화
- 그 다음 확장 기능
