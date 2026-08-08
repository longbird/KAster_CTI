# Customer Detail Drawer Inline Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고객 목록에서 대표전화번호/성명을 바로 눌러 상세를 열고, 같은 드로어 안에서 즉시 수정까지 끝낼 수 있게 만든다.

**Architecture:** 고객 수정 폼 로직을 공유 컴포넌트/헬퍼로 분리해 신규 등록 모달과 상세 드로어가 같은 필드 정의를 재사용한다. 고객 목록은 텍스트 링크로 상세를 열고, 상세 드로어는 읽기 모드와 편집 모드를 내부 전환하면서 저장 후 상세/목록 데이터를 다시 불러온다.

**Tech Stack:** React 18, Ant Design 5, Vitest, Vite

---

### Task 1: 공유 고객 폼 로직 추출

**Files:**
- Create: `apps/admin/src/features/customers/CustomerFormFields.tsx`
- Modify: `apps/admin/src/features/customers/CustomerFormModal.tsx`
- Test: `apps/admin/src/features/customers/CustomersPage.test.tsx`

- [ ] 고객 폼 초기값/저장값 변환 헬퍼를 정의한다.
- [ ] 신규 등록/수정 모달이 공유 필드 컴포넌트를 사용하도록 바꾼다.
- [ ] 변환 헬퍼 테스트를 추가한다.

### Task 2: 상세 드로어 내 수정 모드 추가

**Files:**
- Modify: `apps/admin/src/features/customers/CustomerDetailDrawer.tsx`
- Modify: `apps/admin/src/features/customers/CustomerFormFields.tsx`
- Test: `apps/admin/src/features/customers/CustomersPage.test.tsx`

- [ ] 상세 드로어에 읽기/편집 모드를 추가한다.
- [ ] 수정 저장 시 같은 드로어에서 상세 데이터를 다시 불러오고 편집 모드를 종료한다.
- [ ] 저장 성공 시 부모 목록 새로고침 콜백을 호출하도록 연결한다.

### Task 3: 고객 목록 진입 동선 단축

**Files:**
- Modify: `apps/admin/src/features/customers/CustomersPage.tsx`
- Modify: `apps/admin/src/styles.css`
- Test: `apps/admin/src/features/customers/CustomersPage.test.tsx`

- [ ] 대표전화번호/성명 컬럼을 클릭형 텍스트로 바꿔 상세 드로어를 연다.
- [ ] 액션 컬럼에서 별도 `상세` 버튼을 제거하고 폭을 줄인다.
- [ ] 목록 표시 회귀 테스트를 갱신한다.

### Task 4: 검증과 운영 반영

**Files:**
- Verify only

- [ ] `apps/admin` 고객 관련 Vitest를 실행한다.
- [ ] `apps/admin` 전체 테스트와 빌드를 실행한다.
- [ ] 운영 관리자 앱을 재배포한다.
- [ ] 운영 화면에서 목록 클릭 진입과 드로어 내 수정 동선을 확인한다.
