# Admin Sidebar Restructure Design

## Summary

관리자 앱의 왼쪽 사이드 메뉴를 기능 중심으로 재분류한다. 현재는 `공지사항`, `블랙리스트 관리`, `큐 현황`, `상담원 현황`, `시스템 모니터링`, `연동 설정` 등이 대분류 밖에 노출되어 있어 탐색 비용이 높다.

이번 변경은 **라우트 경로와 권한 키는 유지**하고, **사이드 메뉴 트리만 재구성**하는 범위로 제한한다.

## Problem

현재 관리자 메뉴는 일부 기능이 그룹형 대분류 아래에 있고, 일부 기능은 루트 레벨에 흩어져 있다. 이 구조는 다음 문제를 만든다.

- 비슷한 성격의 화면이 서로 다른 계층에 흩어진다.
- 운영자가 메뉴를 찾을 때 예측 가능성이 낮다.
- 신규 기능이 추가될수록 루트 레벨 메뉴가 계속 늘어난다.
- 권한 체계는 메뉴 단위인데, 메뉴 구조는 역할별 작업 흐름을 충분히 반영하지 못한다.

특히 아래 항목의 위치가 불안정하다.

- `공지사항`
- `블랙리스트 관리`
- `큐 현황`
- `상담원 현황`
- `시스템 모니터링`
- `연동 설정`

## Goals

- 왼쪽 메뉴를 사용 목적 기준으로 재배열한다.
- 루트 레벨 메뉴 수를 줄이고 대분류 중심으로 정리한다.
- 기존 경로와 권한 키는 바꾸지 않아 회귀 범위를 줄인다.
- 현재 화면 구현과 서버 권한 모델에 최소 영향으로 반영한다.

## Non-Goals

- 라우트 경로 변경
- 권한 키 이름 변경
- 페이지 제목/본문 전체 리디자인
- 신규 기능 추가
- 메뉴 노출 정책 변경

## Design Principles

- `실시간 확인`, `이력 조회`, `설정`, `고객 관리`의 4축으로 묶는다.
- 루트에는 자주 진입하는 큰 범주만 남긴다.
- 대분류명은 현재 화면 용도와 바로 연결되는 평이한 표현을 쓴다.
- 동일 도메인 기능은 가능한 한 같은 그룹 안에 둔다.
- 기능 재배치는 하되, 내부 구현의 책임 경계는 유지한다.

## Final Information Architecture

- `대시보드`
- `실시간 운영`
  - `통화 현황 조회`
  - `업무 현황 조회`
  - `큐 현황`
  - `상담원 현황`
  - `시스템 모니터링`
- `보고서`
  - `통화내역 (CDR)`
  - `미연결 콜`
  - `녹취 목록`
  - `호 로그`
- `운영 설정`
  - `지사 관리`
  - `상담원 설정`
  - `호 분배룰 설정`
  - `착신전환 설정`
  - `멘트 관리`
  - `문자 템플릿 관리`
  - `권한 관리`
  - `공지사항`
  - `연동 설정`
  - `시스템 설정`
- `고객 관리`
  - `고객 관리`
  - `블랙리스트 관리`

## Old-to-New Mapping

### Root level items that stay at root

- `/dashboard` → `대시보드`

### Items moved into `실시간 운영`

- `/live-calls`
- `/kpi`
- `/queues`
- `/agents`
- `/monitoring`

### Items staying in `보고서`

- `/reports/calls`
- `/reports/missed`
- `/reports/recordings`
- `/reports/logs`

### Items staying or moving into `운영 설정`

- `/settings/branches`
- `/settings/agents`
- `/settings/queues`
- `/settings/forwarding`
- `/settings/prompts`
- `/settings/sms-templates`
- `/settings/permissions`
- `/announcements`
- `/asterisk`
- `/system`

### Items moved into `고객 관리`

- `/customers`
- `/blocklist`

## Behavioral Impact

### What changes

- 왼쪽 메뉴에서 항목의 표시 위치와 그룹만 달라진다.
- 모바일 오버레이 메뉴에서도 동일한 그룹 구조가 적용된다.
- 권한 필터링 후 빈 그룹은 숨겨진다.

### What does not change

- 각 메뉴를 눌렀을 때 이동하는 경로
- 각 페이지의 데이터 로딩 방식
- 서버 권한 체크 로직
- 브라우저 직접 접근 시 각 페이지의 URL

## Implementation Scope

### Primary file changes

- `apps/admin/src/shared/permissions/menuConfig.tsx`
  - 최종 메뉴 트리 재구성
  - 그룹 이동만 수행, leaf key는 유지

### Expected untouched files unless needed by rendering

- `apps/admin/src/app/router.tsx`
- `apps/admin/src/store/usePermissionStore.ts`
- 서버 권한 관련 코드 전반

라우트와 권한 키를 그대로 유지하므로, 원칙적으로 메뉴 정의 파일만 수정하면 된다. 다만 렌더링 테스트나 그룹 선택 상태 처리에서 예상치 못한 coupling이 있으면 그 범위에서만 보조 수정한다.

## Compatibility With Permissions

현재 권한 필터는 `allowedPaths` 집합으로 leaf menu key를 비교한 뒤, child가 하나도 없는 그룹을 숨기는 방식이다. 이 구조에서는 leaf path가 유지되면 서버와의 계약을 깨지 않는다.

따라서 이번 변경의 호환 조건은 다음 한 가지다.

- 각 leaf item의 `key` 문자열을 변경하지 않는다.

## Risks

### UX risk

- 기존 위치에 익숙한 운영자는 처음에 메뉴 위치 변화를 낯설게 느낄 수 있다.

Mitigation:

- 대분류명이 직관적이라 적응 비용은 낮다.
- 라우트 경로는 그대로이므로 북마크/직접 접근은 깨지지 않는다.

### Technical risk

- 메뉴 트리 변경 후 모바일 collapsed 상태나 selected key 계산이 어긋날 수 있다.

Mitigation:

- 관리자 앱 실제 메뉴 진입 테스트를 다시 수행한다.
- 권한 필터 적용 후 빈 그룹이 의도대로 사라지는지 확인한다.

## Verification Plan

### Functional verification

- 관리자 앱 전체 메뉴 렌더링 확인
- 각 그룹 expand/collapse 확인
- 각 leaf 메뉴 클릭 시 기존 페이지로 이동 확인
- 모바일 폭에서 overlay menu 동작 확인

### Permission verification

- `supervisor` 계정에서 전체 구조 확인
- 제한 권한 계정이 있을 경우 leaf가 일부 빠졌을 때 빈 그룹 자동 제거 확인

### Regression focus

- `/announcements`가 `운영 설정` 아래에 보이는지
- `/blocklist`가 `고객 관리` 아래에 보이는지
- `/queues`, `/agents`, `/monitoring`이 `실시간 운영` 아래에 보이는지
- `/asterisk`, `/system`이 `운영 설정` 아래에 보이는지

## Rollout

1. 메뉴 트리만 수정한다.
2. 관리자 앱 빌드를 수행한다.
3. 운영/테스트 환경에서 실제 메뉴 구조를 확인한다.
4. 필요 시 사용자 안내 문구 없이 바로 반영한다.

이번 변경은 라우트와 권한 계약을 바꾸지 않으므로, 메뉴 구조 정리 작업으로서 비교적 안전한 배포 대상이다.
