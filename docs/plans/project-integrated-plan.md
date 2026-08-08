# KAster CTI 통합 계획서

작성일: 2026-04-29

## 문서 기준

이 문서는 지금까지 진행된 KAster CTI 프로젝트의 계획, 사양, 개발 현황, 현재 상태, 잔여 과제를 하나의 기준 문서로 정리한다.

표현 기준은 다음과 같다.

- 통신 서버는 자체 PBX 서버 기준으로 작성한다.
- 특정 오픈소스 PBX 제품명은 운영 계획서의 기준 용어로 사용하지 않는다.
- 문서 범위는 PBX 서버, IVR, CTI 서버, 상담원/관리자/데스크톱 클라이언트, 테스트 앱으로 분리한다.
- 각 항목은 Plan, Spec, 개발, 현재상황, 남은 과제 순서로 정리한다.

## 1. 전체 프로젝트 방향

### Plan

KAster CTI는 콜센터 운영에 필요한 PBX 제어, IVR 분기, 상담원 상태, 통화 세션, 녹취, 고객 정보, 관리자 운영 설정, 데스크톱 상담원 앱, 자동 테스트 도구를 하나의 운영 체계로 묶는 것을 목표로 한다.

핵심 방향은 다음과 같다.

- PBX 서버는 통화 라우팅, 큐 분배, 상담원 단말 연결, 전환, 녹취, IVR 입력 처리를 담당한다.
- CTI 서버는 PBX 서버의 이벤트를 수집해 통화 세션 상태로 조립하고, REST API와 실시간 이벤트로 클라이언트에 제공한다.
- 관리자 앱은 지사, DID, 큐, 상담원, 권한, 착신전환, 멘트, 문자 템플릿, 수신거부, 블랙리스트, 리포트, 모니터링을 관리한다.
- 상담원 앱은 로그인, 상태 변경, 현재 통화, 고객 팝업, 호 제어, 후처리, 이벤트 로그를 제공한다.
- 데스크톱 앱은 Windows 상담원 환경에서 소프트폰, 서버 handoff 인증, 실시간 CTI 런타임, 업데이트 배포를 담당한다.
- 테스트 앱은 PBX 인입 부하, IVR 시나리오, CTI API 테스트 계획, 결과 리포트를 자동화한다.

### Spec

전체 시스템의 기본 구조는 다음과 같다.

- 멀티테넌트 구조: 거의 모든 주요 데이터는 `tenantId` 기준으로 분리한다.
- 통화 세션 기준: 통화 전체를 이어 붙이는 PBX 세션 식별자를 기준으로 세션을 조립한다.
- 이벤트 중복 방지: PBX 이벤트 fingerprint와 DB unique 제약을 함께 사용한다.
- 원자적 이벤트 발행: 통화 상태 변경과 이벤트 발행 대기열 저장을 하나의 트랜잭션으로 처리한다.
- 실시간 전달: 서버 내부 이벤트 버스와 WebSocket을 통해 클라이언트에 상태를 전달한다.
- 운영 권한: supervisor/admin 중심의 관리자 접근과 메뉴/액션 권한을 분리한다.
- 배포 기준: 개발형 배포와 운영형 배포를 분리하고, 운영은 site별 설정과 immutable image를 기준으로 한다.

### 개발

현재 저장소는 모노레포 형태이며 주요 앱은 다음과 같다.

- `apps/server`: NestJS + Prisma 기반 CTI 서버
- `apps/web`: Vite + React 기반 상담원 웹 앱
- `apps/admin`: Vite + React 기반 관리자 앱
- `apps/desktop`: Electron + React 기반 Windows 상담원 데스크톱 앱
- `tools/pbx-loadgen`: PBX 인입/부하/시나리오 테스트 도구
- `deploy/sites/_template`: 운영 사이트 배포 템플릿
- `docs/design`: 운영/배포/데스크톱/외부 연동 설계 문서

### 현재상황

핵심 서버, 관리자 앱, 상담원 앱, 데스크톱 앱, 테스트 앱의 골격과 상당수 기능은 구현되어 있다. 다만 실서비스 완성 기준으로 보면 일부 영역은 아직 1차 구현, 계약 정리, 실환경 검증, 운영 자동화가 남아 있다.

가장 중요한 현재 리스크는 다음과 같다.

- 상담원 앱이 기대하는 일부 실시간 이벤트와 서버 발행 이벤트 사이의 정합성 보강 필요
- 음소거/보류/재개 같은 통화 제어 상태의 서버 기준 동기화 필요
- 관리자 화면의 권한 UI와 서버 강제 정책의 완전 일치 필요
- PBX 설정 생성/반영/검증의 운영 자동화 완성 필요
- 데스크톱 앱의 실제 PBX 등록, 미디어, 업데이트 배포 end-to-end 검증 필요
- 테스트 앱 결과를 운영 품질 게이트로 연결하는 절차 필요

## 2. PBX 서버

### Plan

PBX 서버는 자체 통신 인프라의 중심으로 두고, CTI 서버와 분리된 운영 계층으로 관리한다. PBX 서버는 DID 인입, 지사별 라우팅, 큐 분배, 상담원 단말 연결, 착신전환, 통화 전환, 녹취, IVR 입력 처리, 수신거부/블랙리스트 반영을 담당한다.

운영 방향은 다음과 같다.

- PBX 서버와 CTI 앱 서버는 논리적으로 분리한다.
- 사이트별 DID, 트렁크, 큐, 상담원 내선, 멘트 파일, 라우팅 정책은 관리자 앱에서 관리 가능한 형태로 둔다.
- 설정 변경은 생성, 검토, 반영, 재로드, 검증 단계를 가진다.
- 운영 환경에서는 개발형 watch/bind mount 구조를 사용하지 않는다.
- 타 사이트 배포 시 PBX 서버 설정은 site별 템플릿과 환경값으로 분리한다.

### Spec

PBX 서버 연동의 주요 사양은 다음과 같다.

- DID 인입은 지사 및 운영 정책으로 매핑한다.
- 큐 분배는 상담원 멤버, 우선순위, 대기 시간, wrap-up, autopause, 최대 대기 시간 등을 기준으로 한다.
- 착신전환은 단순 전환뿐 아니라 큐 대기 시간 기반 전환, 즉시 전환, 스마트 전환, 동일 고객 sticky 전환을 고려한다.
- 수신거부는 고객별 수신거부, 080 opt-out, 블랙리스트를 구분한다.
- 블랙리스트는 exact match를 1차 지원하고, 추후 prefix/pattern 차단으로 확장한다.
- 멘트는 기본 멘트, 업무별 멘트, 080/IVR 멘트, 안내 멘트로 분리한다.
- PBX 이벤트는 CTI 서버에서 정규화된 통화 이벤트로 변환한다.
- PBX 제어 명령은 REST 요청 즉시 성공으로 확정하지 않고, 후속 PBX 이벤트로 최종 결과를 판단한다.

### 개발

구현된 범위는 다음과 같다.

- PBX 이벤트 수신, 정규화, 세션 엔진 연결 구조 구현
- 통화 세션, 통화 leg, 큐 이벤트, 전환, 녹취, 메모, raw 이벤트 저장 구조 구현
- 리더 선출 기반 이벤트 처리 구조 구현
- 이벤트 중복 제거와 outbox 발행 구조 구현
- 세션 복구 sweeper 구현
- 지사, DID, 큐, 상담원, 착신전환, 멘트, 문자 템플릿, 수신거부, 블랙리스트 관련 관리자 기능 구현
- 착신전환 규칙 확장: 큐 대기 기반, 스마트 전환, sticky repeat caller 전략 반영
- 블랙리스트 대량 가져오기 구현
- 녹취 재생/다운로드 API와 관리자 UI 구현
- 운영 배포 표준안과 site template 생성

### 현재상황

PBX 서버를 전제로 한 CTI 연동 구조는 상당 부분 준비되어 있다. 다만 현재 저장소에는 과거 구현 명칭이 일부 소스 경로와 모듈명에 남아 있으며, 운영 문서와 사용자-facing 문서에서는 자체 PBX 서버 기준 용어로 정리해야 한다.

현재 상태를 기능별로 보면 다음과 같다.

- 이벤트 수집/정규화/세션화: 구현됨
- 통화 제어 API: 구현됨, 최종 성공 판정은 후속 이벤트 기준
- 전환 감지: 1차 구현됨
- 녹취 목록/재생/다운로드: 구현됨
- 착신전환: 기본 및 확장 규칙 일부 구현됨
- 블랙리스트: exact match 및 가져오기 구현됨
- 멘트 관리: 메타데이터 관리는 구현됨, 실제 파일 업로드/배포 자동화는 남음
- PBX 설정 반영: 렌더링/관리 구조는 있으나 운영 자동 검증 절차가 더 필요함

### 남은 과제

1. PBX 설정 반영 파이프라인 정리

- 관리자 앱에서 변경된 설정을 PBX 서버 설정으로 생성한다.
- 생성된 설정의 diff/검토 화면을 제공한다.
- 반영 전 문법 검증과 dry-run을 수행한다.
- 반영 후 PBX 상태와 라우팅 결과를 자동 확인한다.

2. 멘트 파일 운영 자동화

- 멘트 메타데이터와 실제 음성 파일 배포 상태를 분리해서 표시한다.
- 파일 업로드, 변환, 저장, PBX 서버 배포, 재로드 확인 절차를 만든다.
- 기본 멘트가 없는 지사/IVR 설정은 저장 또는 활성화를 제한한다.

3. 블랙리스트/수신거부 확장

- prefix/pattern 차단 규칙을 추가한다.
- 차단 이력과 사유별 리포트를 제공한다.
- 수신거부, 080 opt-out, 블랙리스트의 경계를 UI와 DB에서 명확히 유지한다.

4. 운영 배포 완성

- 운영용 deploy script를 site template 기준으로 추가한다.
- CI 이미지 빌드와 registry push를 자동화한다.
- PBX 서버, CTI 서버, DB, Redis의 운영 분리 배포 runbook을 확정한다.

## 3. IVR

### Plan

IVR은 고객 인입 후 업무 흐름을 자동 분기하는 계층으로 둔다. 목표는 단순 메뉴 안내가 아니라 지사/업무/수신거부/문자 발송/상담원 연결/착신전환을 하나의 정책으로 구성하는 것이다.

주요 방향은 다음과 같다.

- 지사별 기본 IVR 프로필을 둔다.
- DID별로 IVR 메뉴 또는 큐 직결을 선택할 수 있게 한다.
- 080 opt-out, ARS, 스마트 분기, 상담원 연결, 문자 발송, 멘트 재생을 조합할 수 있게 한다.
- DTMF 입력 규칙은 관리자 앱에서 직접 관리한다.
- IVR 입력 결과는 CTI 이벤트와 고객 이력에 연결한다.

### Spec

IVR 사양은 다음 기준으로 정리한다.

- DID 기준 진입점: 인입 번호별로 지사, 큐, IVR 메뉴, 수신거부 메뉴를 결정한다.
- 메뉴 유형: 상담원 연결, 착신전환, 문자 발송, 수신거부 등록, 멘트 재생, 하위 메뉴 이동
- 입력 처리: DTMF 입력값, 입력 timeout, 잘못된 입력 횟수, fallback 라우팅
- 문자 템플릿: 기본 문자 템플릿과 opt-out 문자 템플릿을 분리한다.
- 080 opt-out: 고객 번호, 입력 결과, 처리 결과를 저장하고 운영자가 조회할 수 있게 한다.
- 상태 기록: IVR 선택, 전환, 실패, timeout은 PBX 이벤트 또는 CTI 서버 이벤트로 추적한다.

### 개발

구현된 범위는 다음과 같다.

- 지사 설정 안에 운영 설정 프로필을 통합
- DID를 지사 등록의 핵심 정보로 반영
- DTMF 동작 규칙 UI 정리
- 문자 템플릿 CRUD 구현
- opt-out 메뉴와 문자 템플릿 연동
- 스마트 ARS 조합 테스트 코드 추가
- PBX 인입 테스트용 YAML 시나리오 작성
- 080 DTMF 시나리오별 테스트 report 파일 생성

### 현재상황

IVR은 관리자 설정과 PBX 인입 테스트 시나리오까지 일부 연결되어 있다. 다만 운영자가 IVR 전체 흐름을 시각적으로 확인하고, 변경 전후 경로를 검증하는 기능은 아직 부족하다.

현재 상태는 다음과 같다.

- DTMF 동작 규칙: 관리자 UI에 반영됨
- opt-out 문자 템플릿: 관리 및 연결 구현됨
- 스마트 ARS 조합: 테스트 코드와 일부 시나리오 존재
- IVR 시나리오 리포트: 테스트 앱 결과 파일로 일부 존재
- 시각적 IVR 플로우 관리: 미완성
- IVR 실행 이력/고객 이력 연결: 보강 필요

### 남은 과제

1. IVR 플로우 빌더 또는 요약 화면

- DID에서 시작해 메뉴, 입력, timeout, 상담원 연결, 전환, 문자 발송까지 한 화면에서 검토한다.
- 운영자가 저장 전 전체 경로를 확인할 수 있게 한다.

2. IVR 실행 이력

- 고객별 IVR 입력 이력을 통화 이력과 연결한다.
- timeout, 잘못된 입력, 수신거부 등록, 문자 발송 결과를 리포트로 제공한다.

3. IVR 테스트 자동화 강화

- YAML 시나리오를 관리자 설정과 연결한다.
- 각 IVR 메뉴별 smoke/regression 테스트를 만들고 결과를 저장한다.
- 수신거부/문자 발송/상담원 연결의 end-to-end 판정을 자동화한다.

## 4. CTI 서버

### Plan

CTI 서버는 PBX 서버와 클라이언트 사이의 중간 계층이다. PBX 이벤트를 안정적으로 수집하고, 통화 세션 상태로 조립하며, API/실시간 이벤트/운영 리포트/관리 설정을 제공한다.

핵심 목표는 다음과 같다.

- PBX 이벤트 기반으로 통화 상태를 정확히 조립한다.
- 중복 이벤트와 순서 역전을 방어한다.
- 멀티노드에서도 이벤트 중복 처리와 세션 복구가 안정적으로 동작한다.
- 관리자/상담원/데스크톱 앱이 같은 서버 계약을 사용한다.
- 모든 주요 응답은 `{ success, data, error }` envelope을 유지한다.
- 통화 제어 명령은 command ack와 후속 이벤트 판정을 분리한다.

### Spec

CTI 서버의 주요 사양은 다음과 같다.

- 인증: access token, refresh token, refresh token rotation, logout, logout-all
- 데스크톱 handoff: 브라우저에서 발급한 handoff token을 데스크톱 세션으로 교환
- 상담원 상태: 상태 변경, 상태 이력, 권한 기반 변경 허용
- 통화 조회: active call, 단건 call, history, 녹취, 메모
- 통화 제어: 발신, 내선 발신, pickup, blind transfer, attended transfer, mute, hold, resume, hangup
- 큐: queue summary, queue members, 분배 정책
- 고객: 고객 목록, 전화번호, 상세 drawer, inline edit
- 관리자: dashboard, live calls, KPI, monitoring, reports, 권한, 공지, 설정
- 데스크톱 업데이트: update session, manifest, download token, artifact stream, report
- 실시간 이벤트: 통화 상태, 상담원 상태, 큐 요약, 고객 screen pop
- 운영 안정성: Redis 리더 선출, outbox, recovery sweeper, health endpoint, OpenAPI export

### 개발

구현된 범위는 다음과 같다.

- NestJS 서버 모듈 구조 구현
- Prisma schema와 주요 모델 구현
- 인증, refresh rotation, logout-all 구현
- handoff 인증과 데스크톱 session 관련 테스트 추가
- 통화 세션 엔진 구현
- 통화 제어 command ack 메타데이터 구현
- 전환 감지 구현
- 고객 관리 API와 관리자 UI 연동
- 관리자 dashboard, live calls, KPI, reports, monitoring, permissions 구현
- 녹취 재생/다운로드 구현
- 데스크톱 업데이트 hub 구현
- 서버 테스트 추가: 권한, 인증 handoff, 데스크톱 세션, softphone config, 업데이트, 세션 엔진, 전환, 통화 서비스

### 현재상황

CTI 서버는 기능 범위가 넓어졌고 테스트도 추가되어 있다. 그러나 실서비스 운영 기준으로는 이벤트 계약과 일부 통화 제어 상태의 정합성 보강이 가장 우선이다.

현재 상태는 다음과 같다.

- 서버 빌드/테스트 스크립트: 존재
- 핵심 통화 세션 엔진: 구현됨
- 주요 API: 구현됨
- 관리자 기능 API: 다수 구현됨
- 데스크톱 계약: 서버 측 선행 조건 구현됨
- 실시간 이벤트: 일부 화면 기대 이벤트와 서버 발행 이벤트의 정합성 확인 필요
- 권한 enforcement: UI와 서버 정책의 전면 일치 필요
- 운영 DB migration: 개발/운영 환경 차이에 따른 절차 정리 필요

### 남은 과제

1. 실시간 이벤트 계약 정리

- 상담원 앱, 관리자 앱, 데스크톱 앱이 구독하는 이벤트 목록을 하나로 확정한다.
- 서버 발행 이벤트와 mock 이벤트 이름/페이로드를 맞춘다.
- screen pop, 상담원 상태 변경, 큐 요약 변경 이벤트를 실제 서버 흐름에 연결한다.

2. 통화 제어 상태 동기화

- mute, hold, resume 상태를 서버 세션 또는 별도 상태 모델에 반영한다.
- 새로고침, 다중 세션, 데스크톱/웹 동시 사용 시 같은 상태가 보이게 한다.
- 최종 성공 판정은 PBX 이벤트 기준으로 유지한다.

3. 권한 정책 전면 적용

- 관리자 메뉴 권한과 서버 API 권한을 같은 정책 기준으로 맞춘다.
- CRUD, operate, export 액션 단위 권한을 서버에서 강제한다.
- 권한 변경 후 클라이언트 메뉴와 버튼 노출이 즉시 반영되게 한다.

4. 운영성 보강

- OpenAPI export를 최신화하고 테스트 앱의 test-plan 생성과 연결한다.
- health/monitoring에서 PBX 연결 상태, DB, Redis, outbox backlog, recovery count를 한 번에 볼 수 있게 한다.
- production migration runbook을 실제 운영 DB 기준으로 재검증한다.

## 5. 클라이언트

클라이언트 범위는 상담원 웹 앱, 관리자 앱, Windows 데스크톱 앱으로 나눈다.

## 5.1 상담원 웹 앱

### Plan

상담원 웹 앱은 브라우저 기반 CTI 작업 화면이다. 상담원이 로그인 후 상태를 전환하고, 현재 통화를 확인하며, 고객 screen pop, 호 제어, 메모, 후처리, 이벤트 로그를 수행하는 것이 목표다.

### Spec

주요 사양은 다음과 같다.

- Mock/Real 모드 분리
- supervisor/admin과 일반 agent 로그인 흐름 공유
- Full/Mini 모드 제공
- 현재 통화, 상담원 상태, 큐 요약, KPI, 이벤트 로그 표시
- 통화 제어: 발신, pickup, transfer, mute, hold, resume, hangup
- 데스크톱 handoff 페이지 제공
- access token 자동 첨부와 refresh token 회전

### 개발

구현된 범위는 다음과 같다.

- Vite + React + Tailwind + Ant Design 기반 앱 구현
- Mock/Real API dispatcher 구현
- WebSocket dispatcher 구현
- 인증 store와 token persistence 구현
- FullShell/MiniShell 구현
- 로그인, RequireAuth, ModeSwitch, Logout 구현
- 데스크톱 handoff 관련 유틸과 테스트 추가
- CTI store 테스트 추가

### 현재상황

상담원 앱은 기본 작업 화면이 존재하고, Mini/Full 모드도 코드 기준으로 반영되어 있다. 다만 실서버 이벤트와 화면 상태의 연결은 아직 보강 대상이다.

현재 상태는 다음과 같다.

- UI 골격: 구현됨
- Mock 모드: 구현됨
- Real API 연동: 구현됨
- 실시간 이벤트 정합성: 보강 필요
- mute/KPI 상태: 서버 기준 동기화 필요
- Full 작업면: 실제 운영 효율 관점에서 추가 정리 필요

### 남은 과제

- 서버 발행 이벤트와 구독 이벤트를 정합화한다.
- Full 모드에서 고정형 작업면을 완성한다.
- 현재 통화 상세, 제어, ACW, 메모를 본문에서 직접 처리하도록 개선한다.
- today missed, talk time, answered 등 KPI를 서버 기준으로 통일한다.
- 데스크톱 앱과 역할 중복을 정리한다.

## 5.2 관리자 앱

### Plan

관리자 앱은 supervisor/admin 전용 운영 대시보드다. 실시간 운영, 리포트, 운영 설정, 고객 관리, 권한 관리를 한 곳에서 처리하는 것이 목표다.

### Spec

주요 메뉴는 다음과 같다.

- 대시보드
- 실시간 운영: 통화 현황, 업무 현황, 큐 현황, 상담원 현황, 시스템 모니터링
- 보고서: 통화내역, 미연결 콜, 녹취 목록, 호 로그
- 운영 설정: 지사, 상담원, 호 분배룰, 착신전환, 멘트, 문자 템플릿, 권한, 공지사항, 연동 설정, 시스템 설정
- 고객 관리: 고객, 수신거부 고객, 블랙리스트

### 개발

구현된 범위는 다음과 같다.

- 관리자 라우터와 메뉴 권한 구조 구현
- dashboard, queue summary, live calls, KPI, monitoring 구현
- 지사 관리와 운영 설정 통합
- 상담원 설정, 큐 설정, 착신전환 설정 구현
- 멘트 메타데이터 관리 구현
- 문자 템플릿 관리 구현
- 권한 관리 구현
- 고객 목록, 상세 drawer, inline edit 구현
- 수신거부 고객, 블랙리스트, 블랙리스트 가져오기 구현
- 녹취 목록 재생/다운로드 구현
- 공지사항 관리 구현
- 화면 밀도와 테이블 overflow 관련 여러 차례 조정

### 현재상황

관리자 앱은 운영 화면의 폭이 가장 넓게 구현되어 있다. 최근 작업은 실제 운영 화면의 밀도, 드로어 inline edit, 블랙리스트 가져오기, 큐 요약 테이블, 녹취 재생/다운로드 중심으로 진행되었다.

현재 상태는 다음과 같다.

- 메뉴 구조: 구현됨
- 주요 CRUD: 다수 구현됨
- 고객 관리: inline edit까지 구현됨
- 녹취: 인증 기반 playback/download 구현됨
- 권한 UI: 구현됨
- 서버 enforcement: 전면 정합화 필요
- 실시간 화면: 일부 polling 중심, WebSocket 전환 필요
- 큐 drill-down: 미완성
- 공지사항: 관리자 CRUD는 있으나 상담원 앱 소비 경로 필요

### 남은 과제

- 관리자 실시간 화면을 WebSocket 이벤트 기반으로 전환한다.
- 큐 단건 상세 drawer 또는 상세 화면을 추가한다.
- 권한 설정과 서버 정책을 전면 일치시킨다.
- 멘트 파일 실제 배포 상태를 화면에 표시한다.
- 공지사항을 상담원 앱에 연결한다.
- 리포트 export 권한과 조회 권한을 분리해서 유지한다.

## 5.3 Windows 데스크톱 앱

### Plan

데스크톱 앱은 상담원 PC에서 실행되는 Windows 전용 런타임이다. 브라우저 handoff로 로그인하고, 소프트폰, CTI 실시간 이벤트, 통화 제어, 업데이트 배포를 로컬 앱 안에서 제공한다.

핵심 방향은 다음과 같다.

- long-lived token은 main process에 보관한다.
- renderer는 typed preload IPC만 사용한다.
- CTI REST와 실시간 이벤트는 main process runtime이 관리한다.
- SIP 등록과 미디어 제어는 데스크톱 앱에서 처리한다.
- 업데이트는 콜센터 서버의 update hub를 통해 tenant/channel 기준으로 배포한다.

### Spec

주요 사양은 다음과 같다.

- center URL 정규화와 device ID 저장
- handoff token exchange
- token vault
- desktop session refresh
- CTI runtime connect
- active call, queue summary, agent status sync
- softphone registration
- incoming call accept/reject
- audio device selection
- ringtone/speaker/microphone 제어
- update session, manifest, download-init, artifact download, report
- tray, attention, runtime supervisor

### 개발

구현된 범위는 다음과 같다.

- Electron + React + TypeScript scaffold 구현
- main/preload/renderer 구조 구현
- config store, token vault, auth client 구현
- CTI runtime 구현
- update client와 download store 구현
- pairing screen, softphone shell, event timeline, update banner 구현
- SIP softphone client와 media controller 구현
- audio preferences store 구현
- tray service, attention service, runtime supervisor 구현
- 다수의 Vitest 테스트 추가
- Windows packaging, internal signing, signature verify 스크립트 구성

### 현재상황

데스크톱 앱은 초기 골격을 넘어 실제 런타임 구성 요소가 상당히 구현된 상태다. 서버 측 update hub와 handoff 계약도 준비되어 있다. 남은 핵심은 실제 PBX 서버와의 등록/미디어/호 제어 end-to-end 검증이다.

현재 상태는 다음과 같다.

- 앱 scaffold: 구현됨
- pairing/auth: 구현됨
- CTI runtime: 구현됨
- softphone runtime: 구현됨
- update client: 구현됨
- 테스트: 다수 존재
- 실환경 PBX 등록 검증: 필요
- 음성 장치/미디어 end-to-end 검증: 필요
- 운영 배포/업데이트 절차 검증: 필요

### 남은 과제

- 실제 상담원 PC 환경에서 SIP 등록, 수신, 발신, 종료를 검증한다.
- 마이크, 스피커, 벨소리 장치 선택과 저장을 실기기에서 확인한다.
- 통화 중 업데이트 설치 차단, 종료 후 설치 가능 상태를 검증한다.
- release artifact 등록, manifest 조회, tokenized download, hash 검증, report 저장을 end-to-end로 확인한다.
- 내부 코드서명과 배포 패키지 검증 절차를 운영 runbook으로 확정한다.

## 6. 테스트 앱

### Plan

테스트 앱은 자체 PBX 서버와 CTI 서버의 실제 동작을 자동 검증하기 위한 도구다. 단순 부하 발생기가 아니라 인입 시나리오, IVR 입력, 큐 대기, 상담원 연결, CTI API 상태 확인, 결과 리포트까지 포함하는 검증 앱으로 확장한다.

### Spec

테스트 앱의 주요 사양은 다음과 같다.

- YAML 기반 inbound scenario 정의
- SIP 인입 부하 생성
- 초당 인입량, 동시 콜 수, DID pool, duration 설정
- IVR DTMF 입력 시나리오
- 결과 CSV/JSON 리포트 생성
- OpenAPI 기반 CTI feature inventory 생성
- CTI test plan generate/validate/dry-run/report/feedback
- Windows native CLI 패키징

### 개발

구현된 범위는 다음과 같다.

- `pbx-loadgen` native CLI 구현
- validate, dry-run, run, report 명령 구현
- test-plan inventory/generate/validate/dry-run/report/feedback 명령 구현
- Windows용 실행 파일 생성
- inbound smoke와 30cps/300concurrent 시나리오 작성
- IVR/080/스마트 ARS 관련 report 시나리오 일부 작성
- 라이브 PBX 인입 테스트를 위한 DID pool과 allowlist 운영 검증 경험 축적

### 현재상황

테스트 앱은 도구 자체와 일부 시나리오가 준비되어 있다. 다만 현재는 개발/검증자가 직접 실행하는 성격이 강하고, CTI 서버/관리자 설정/운영 배포 파이프라인과 품질 게이트로 완전히 연결되지는 않았다.

현재 상태는 다음과 같다.

- native CLI: 구현됨
- Windows package: 존재
- inbound load scenario: 존재
- IVR/080 scenario: 일부 존재
- OpenAPI 기반 test plan 기능: 구현됨
- 운영 regression gate: 미완성
- 관리자 설정과 테스트 시나리오 자동 연결: 미완성

### 남은 과제

1. 테스트 시나리오 표준화

- 인입 smoke, IVR smoke, 큐 분배 smoke, 상담원 연결 smoke, 착신전환 smoke, 수신거부 smoke를 표준 세트로 정의한다.
- 운영 반영 전후에 같은 테스트 세트를 실행할 수 있게 한다.

2. CTI API 검증 연결

- OpenAPI export를 최신화한다.
- feature inventory와 test plan을 운영 기능 단위로 정리한다.
- API 응답뿐 아니라 서버 DB 상태와 WebSocket 이벤트까지 확인한다.

3. 결과 리포트 운영화

- CSV/JSON 결과를 사람이 읽는 요약 보고서로 변환한다.
- 실패 원인을 PBX 서버, CTI 서버, 클라이언트, 테스트 앱 중 어느 계층인지 분류한다.
- 배포 전 필수 통과 기준을 정의한다.

## 7. 앞으로의 진행 계획

## 7.1 1단계: 문서와 용어 정리

### 목표

운영 문서, 계획서, README, 관리자 화면 문구에서 자체 PBX 서버 기준 용어를 통일한다.

### 작업

- 통합 계획서 확정
- README와 운영 문서의 용어 정리
- 사용자-facing 문서에서 특정 PBX 제품명 제거
- 내부 코드 경로/모듈명은 별도 리팩터링 계획으로 분리
- 운영자용 시스템 구성도 작성

### 완료 기준

- 외부 공유 가능한 계획서가 준비된다.
- PBX 서버, IVR, CTI, 클라이언트, 테스트 앱 기준으로 설명이 분리된다.
- 운영자가 읽었을 때 특정 오픈소스 제품 의존 문서처럼 보이지 않는다.

## 7.2 2단계: CTI 이벤트 계약 정합화

### 목표

상담원 웹 앱, 관리자 앱, 데스크톱 앱이 같은 실시간 이벤트 계약을 사용하게 한다.

### 작업

- 클라이언트별 구독 이벤트 목록 수집
- 서버 발행 이벤트 목록 정리
- mock event와 real event 이름/페이로드 일치
- screen pop, agent status, queue summary 이벤트 보강
- 이벤트 계약 문서와 테스트 추가

### 완료 기준

- mock 없이 실제 서버 이벤트로 상담원 화면이 갱신된다.
- 다중 클라이언트에서 같은 통화 상태가 보인다.
- 이벤트 계약 변경 시 테스트가 실패한다.

## 7.3 3단계: 통화 제어 상태 서버 동기화

### 목표

mute, hold, resume, transfer, hangup 등 통화 제어 상태를 서버 기준으로 일치시킨다.

### 작업

- 통화 제어 command ack와 최종 이벤트 판정 흐름 정리
- mute/hold/resume 상태 모델 추가 또는 기존 세션 모델 확장
- 상담원 웹/데스크톱 앱 상태 표시 정리
- 새로고침/동시 접속/재연결 시나리오 테스트

### 완료 기준

- UI 토글 상태와 PBX 서버 실제 상태가 불일치하지 않는다.
- 데스크톱과 웹을 동시에 열어도 같은 상태를 표시한다.

## 7.4 4단계: 관리자 운영 설정 완성

### 목표

관리자 앱에서 PBX 서버 운영 설정을 생성, 검토, 반영, 검증하는 흐름을 완성한다.

### 작업

- 지사/DID/큐/상담원/착신전환/멘트/수신거부 설정의 상호 검증
- 설정 생성 preview와 diff 제공
- 설정 반영 전 dry-run
- 반영 후 PBX 서버 상태 확인
- 멘트 파일 업로드/배포 상태 추적
- 권한 enforcement 전면 적용

### 완료 기준

- 운영자가 관리자 앱만으로 설정 변경의 영향 범위를 확인할 수 있다.
- 잘못된 설정은 반영 전에 차단된다.
- 반영 후 테스트 앱 또는 health check로 결과가 확인된다.

## 7.5 5단계: 클라이언트 실환경 검증

### 목표

상담원 웹 앱과 Windows 데스크톱 앱이 실제 상담원 업무 흐름을 끝까지 처리하게 한다.

### 작업

- 상담원 로그인, 상태 변경, 인입, 통화, 후처리 검증
- 데스크톱 pairing, SIP 등록, 수신/발신/종료 검증
- 오디오 장치 선택, 벨소리, 통화음 분리 검증
- 업데이트 hub end-to-end 검증
- 장애 복구와 재연결 시나리오 검증

### 완료 기준

- 실제 상담원 PC에서 기본 업무 시나리오가 통과한다.
- 통화 중 앱 재시작, 네트워크 끊김, 서버 재시작 시나리오의 동작이 문서화된다.

## 7.6 6단계: 테스트 앱을 품질 게이트로 연결

### 목표

PBX 인입, IVR, CTI API, WebSocket, DB 상태 검증을 배포 전 필수 확인 절차로 만든다.

### 작업

- 표준 smoke scenario 작성
- OpenAPI 기반 test plan 최신화
- 배포 전/후 자동 실행 스크립트 작성
- 리포트 요약과 실패 분류 자동화
- 운영 서버 검증 결과 저장 위치 표준화

### 완료 기준

- 배포 전후 테스트 결과를 동일한 형식으로 비교할 수 있다.
- 실패 시 어느 계층 문제인지 빠르게 판단할 수 있다.

## 7.7 7단계: 운영 배포 자동화

### 목표

개발 서버와 운영 서버의 배포 방식을 분리하고, 타 사이트 재배포 가능한 운영 표준을 완성한다.

### 작업

- site별 compose.prod.yml 확정
- deploy-prod script 작성
- DB 백업/복구 runbook 작성
- CI 이미지 빌드와 registry push 구성
- frontend runtime config 도입 검토
- 운영 모니터링과 알림 기준 정리

### 완료 기준

- 새 사이트 배포 시 코드 수정 없이 site 설정만으로 배포할 수 있다.
- 운영 반영 절차가 문서와 스크립트로 재현 가능하다.

## 8. 우선순위 요약

### P0

- 실시간 이벤트 계약 정합화
- 통화 제어 상태 서버 동기화
- PBX 설정 반영 검증 파이프라인
- 데스크톱 실환경 SIP/미디어 검증
- 운영 배포 절차와 DB migration 기준 확정

### P1

- 관리자 권한 enforcement 전면 적용
- IVR 플로우 시각화와 실행 이력
- 멘트 파일 업로드/배포 자동화
- 큐 상세 drill-down
- 테스트 앱 smoke/regression 표준화

### P2

- 공지사항 상담원 앱 노출
- 리포트 고도화
- 프론트 runtime config
- site별 배포 자동화 고도화
- 운영 알림과 대시보드 확장

## 9. 산출물 계획

앞으로 문서는 다음 순서로 정리한다.

1. 통합 계획서: 본 문서
2. PBX 서버 운영 설계서
3. IVR 플로우 설계서
4. CTI 서버 API/이벤트 계약서
5. 관리자 앱 운영 설정 명세서
6. 상담원 웹 앱 업무 시나리오
7. Windows 데스크톱 앱 실환경 검증서
8. 테스트 앱 시나리오/리포트 표준
9. 운영 배포 runbook

## 10. 결론

현재 KAster CTI는 단순 PoC 수준을 넘어 서버, 관리자, 상담원, 데스크톱, 테스트 도구까지 확장된 상태다. 다음 단계의 핵심은 새 기능을 계속 늘리는 것보다, 자체 PBX 서버 기준의 운영 문서와 실제 이벤트/상태/배포/검증 체계를 하나로 맞추는 것이다.

따라서 우선순위는 문서 정리, 이벤트 계약 정합화, 통화 제어 상태 동기화, PBX 설정 검증, 데스크톱 실환경 검증, 테스트 앱 품질 게이트화 순서로 진행하는 것이 적절하다.
