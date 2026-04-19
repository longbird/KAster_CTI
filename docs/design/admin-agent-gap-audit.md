# Admin / Agent App Gap Audit

최종 점검일: 2026-04-19

## 목적

어드민 앱(`apps/admin`)과 에이전트 앱(`apps/web`)의 미구현·부분구현 항목을
실행 가능한 백로그로 정리한다. 이 문서는 화면 존재 여부가 아니라
"실서비스 기준으로 기능이 완결되었는가"를 기준으로 작성했다.

## 우선순위 기준

- `P0`: 실시간 운영 데이터가 틀리거나, 핵심 업무 흐름이 mock 수준에 머무는 항목
- `P1`: 기능은 있으나 범위가 1차 구현에 머물러 운영 제약이 큰 항목
- `P2`: 화면은 동작하지만 후속 drill-down, 고도화, 운영 편의가 남은 항목

## P0

### 1. 에이전트 앱 실시간 이벤트 발행 정합성

- 상태: 프런트는 `screenpop.customer`, `agent.status.changed`, `queue.summary.updated`
  를 구독하지만, 서버에서 실제 발행되는 이벤트는 `call.created`, `call.updated`,
  `call.ended` 위주로 확인된다.
- 영향:
  - 고객 screen pop이 실환경에서 누락될 수 있다.
  - 큐 요약이 실시간으로 갱신되지 않을 수 있다.
  - 상담원 상태가 다른 세션/다른 노드에서 바뀌어도 앱에 반영되지 않을 수 있다.
- 근거:
  - `apps/web/src/ws/realSocket.ts`
  - `apps/web/src/store/useCtiStore.ts`
  - `apps/web/src/mock/mockSocket.ts`
  - `apps/server/src/modules/calls/session-engine.service.ts`
- 완료 기준:
  - 서버가 위 3개 이벤트를 실제 publish 한다.
  - mock socket 없이도 에이전트 앱 이벤트 로그와 화면 데이터가 갱신된다.
  - 다중 노드에서도 동일 이벤트가 동일하게 반영된다.

### 2. 에이전트 앱 음소거 상태의 서버 동기화 부재

- 상태: 활성 콜 조회 시 `isMuted`를 항상 `false`로 초기화하고,
  버튼 클릭 이후에는 로컬 상태만 뒤집는다.
- 영향:
  - 새로고침 시 상태 유실
  - 멀티 세션 불일치
  - 실제 PBX 상태와 UI 표시가 어긋날 수 있음
- 근거:
  - `apps/web/src/api/realApi.ts`
  - `apps/web/src/store/useCtiStore.ts`
- 완료 기준:
  - 서버 응답 또는 이벤트에 mute 상태가 포함된다.
  - 앱은 낙관 업데이트가 아니라 서버 기준 상태를 표시한다.

### 3. 에이전트 오늘 통계 일부 미연동

- 상태: `todayAnswered`, `todayTalkSeconds`만 보강되고 `todayMissed`는 기본값 `0`이다.
- 영향:
  - 상담원 KPI 신뢰도 저하
  - 관리자/에이전트 간 수치 불일치
- 근거:
  - `apps/web/src/api/realApi.ts`
- 완료 기준:
  - `/me/session` 또는 별도 API에서 오늘 응답/미응답/통화시간이 함께 내려온다.
  - 에이전트 앱 KPI가 서버 수치와 일치한다.

## P1

### 4. 에이전트 Full 화면 작업면 미완결

- 상태: Full 화면 본문은 요약 중심이고, 실제 제어와 메모 저장은 플로팅 팝업에 집중돼 있다.
- 영향:
  - Full 모드의 정보 밀도 대비 작업성이 낮음
  - 원래 설계된 고정형 작업면과 차이
- 근거:
  - `apps/web/src/layout/FullShell.tsx`
- 완료 기준:
  - Full 모드에서 선택 통화 상세, 제어, ACW가 본문 작업면에서 직접 처리된다.
  - 플로팅 UI는 보조 수단으로만 남기거나 제거한다.

### 5. 어드민 착신전환은 1차 범위만 지원

- 상태: DID 기준 무조건 전환만 지원한다.
- 누락 범위:
  - 시간대별 전환
  - 조건부 전환
  - 복수 규칙 우선순위
- 근거:
  - `apps/admin/src/features/forwarding-settings/ForwardingSettingsPage.tsx`
- 완료 기준:
  - 시간대/조건식/우선순위를 포함한 규칙 모델과 UI가 추가된다.
  - Asterisk 렌더/리로드까지 연동된다.

### 6. 어드민 수신거부는 exact match만 지원

- 상태: 번호 exact match 차단만 구현돼 있다.
- 누락 범위:
  - prefix/pattern 차단
  - 차단 이력 집계
  - 차단 사유별 리포트
- 근거:
  - `apps/admin/src/features/blocklist/BlocklistPage.tsx`
- 완료 기준:
  - 패턴 기반 규칙을 저장하고 dialplan 반영이 가능하다.
  - 차단 로그 조회 또는 집계 화면이 제공된다.

### 7. 어드민 멘트 관리는 메타데이터만 관리

- 상태: prompt key, 파일명, 카테고리 등 메타데이터만 관리하며
  실제 음성 파일 업로드/배포는 운영 절차로 남아 있다.
- 영향:
  - 앱 안에서 멘트 등록이 완료되지 않음
  - 운영자 수작업 의존
- 근거:
  - `apps/admin/src/features/prompt-settings/PromptSettingsPage.tsx`
- 완료 기준:
  - 파일 업로드 또는 배포 파이프라인 연동 방식이 정의된다.
  - "메타데이터 등록"과 "실제 파일 배포"의 상태를 앱에서 확인할 수 있다.

### 8. 권한 설정은 화면 대비 서버 enforcement가 부분적

- 상태: 역할별 액션 권한 매트릭스 UI는 있으나,
  설명대로 서버 강제는 일부 관리 경로부터만 적용돼 있다.
- 영향:
  - UI에서 차단돼도 백엔드 일부 경로는 액션 단위 제어가 약할 수 있음
- 근거:
  - `apps/admin/src/features/permission-settings/PermissionSettingsPage.tsx`
  - `apps/server/src/modules/admin/admin.service.ts`
- 완료 기준:
  - 어드민 관련 CRUD/operate/export 전 경로에 동일 권한 모델이 적용된다.
  - 프런트 메뉴 노출과 백엔드 정책이 같은 소스 기준으로 맞춰진다.

### 9. 시스템 설정의 발신번호 정책 단순화

- 상태: 현재 1차 구현에서는 Click-to-Call과 직접 SIP 발신이 모두 같은 기본 발신번호를 사용한다.
- 영향:
  - 지사/업무 유형별 발신번호 정책 분리가 어렵다.
- 근거:
  - `apps/admin/src/features/system-settings/SystemSettingsPage.tsx`
- 완료 기준:
  - 발신 정책을 채널/기능/지사 기준으로 분리할 수 있다.
  - 에이전트 발신 UI가 정책 범위를 정확히 반영한다.

## P2

### 10. 어드민 큐 현황 drill-down 부재

- 상태: `/queues/summary` 폴링 테이블까지만 구현되어 있다.
- 누락 범위:
  - 큐 클릭 후 상세 이력
  - 상담원 멤버 drill-down
  - 대기 고객 상세
- 근거:
  - `apps/admin/src/pages/QueuesPage.tsx`
- 완료 기준:
  - 큐 단건 상세 화면 또는 drawer가 추가된다.
  - 큐별 active calls, members, SLA 경고를 상세 확인할 수 있다.

### 11. 어드민 실시간 화면의 WebSocket 미사용

- 상태: 라이브콜/헬스/큐 현황은 주로 3초~10초 폴링 기반이다.
- 영향:
  - 불필요한 요청 증가
  - 진짜 실시간 운영감 저하
- 근거:
  - `apps/admin/src/features/live-calls/LiveCallsPage.tsx`
  - `apps/admin/src/features/monitoring/hooks/useHealthData.ts`
  - `apps/admin/src/pages/QueuesPage.tsx`
- 완료 기준:
  - 주요 화면이 WS 이벤트 기반 갱신으로 전환된다.
  - 폴링은 fallback 또는 저빈도 보정용으로만 남긴다.

### 12. 어드민 공지사항은 에이전트 앱 소비 경로 없음

- 상태: 어드민에서 공지 CRUD는 가능하지만 에이전트 앱에서 공지를 조회/표시하는 코드는 없다.
- 영향:
  - 관리 기능이 현장 화면과 연결되지 않음
- 근거:
  - `apps/admin/src/features/announcements/AnnouncementsPage.tsx`
  - `apps/web/src` 내 공지 소비 코드 부재
- 완료 기준:
  - 에이전트 앱에 공지 노출 영역이 생긴다.
  - 고정 공지/신규 공지 여부를 확인할 수 있다.

## 권장 구현 순서

1. 에이전트 실시간 이벤트 발행 정합성 보완
2. 에이전트 KPI/음소거 상태 서버 동기화
3. Full 작업면 고정형 제어 완성
4. 어드민 권한 enforcement 전면 적용
5. 착신전환/수신거부/멘트관리의 1차 범위 확장
6. 큐/모니터링의 drill-down 및 WS 고도화
7. 공지사항의 에이전트 앱 연결

## 구현 묶음 제안

### 스프린트 A: 운영 데이터 정합성

- 에이전트 WS 이벤트 보강
- mute/KPI 서버 동기화
- 어드민 폴링 화면의 이벤트 기반 전환 준비

### 스프린트 B: 운영 제어 범위 확장

- 착신전환 조건식
- 패턴 수신거부
- 발신번호 정책 세분화

### 스프린트 C: 운영 UX 완성

- Full 작업면 완성
- 큐 drill-down
- 공지사항 에이전트 노출

## 확인 사항

- 문서상 "Mini/Full 모드 미적용"은 현재 코드 기준으로 해소된 것으로 본다.
- 이 문서는 점검 결과를 정리한 것이며, 각 항목 구현 전에는 서버 DTO와 실제 Asterisk 운용 규칙을 다시 대조해야 한다.
