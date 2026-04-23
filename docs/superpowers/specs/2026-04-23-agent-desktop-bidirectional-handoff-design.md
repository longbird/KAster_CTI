# Agent Desktop Bidirectional Handoff Design

## Goal

상담원 UX를 `웹 단독`, `웹 + 소프트폰`, `데스크톱 단독` 3경로로 정리한다.

- 웹에서 `소프트폰 사용`을 선택하면 데스크톱 앱이 설치/실행 가능한지 먼저 검증하고, 로그인 성공 후 데스크톱 앱이 자동으로 실행/연결되어야 한다.
- 웹에서 `SIP Phone 사용`을 선택하면 기존 웹 로그인만으로 업무 진입이 가능해야 한다.
- 데스크톱 앱에서 직접 로그인하면 웹과 무관하게 단독 사용 가능해야 하며, 필요 시 웹도 자동 로그인되어야 한다.
- `handoff token`은 사용자에게 노출되지 않는 내부 메커니즘으로만 유지한다.

## Context

현재 데스크톱 앱 초기 진입은 [D:\Work\AI_Projects\KAster_CTI\apps\desktop\src\renderer\src\components\PairingScreen.tsx](D:\Work\AI_Projects\KAster_CTI\apps\desktop\src\renderer\src\components\PairingScreen.tsx) 기반의 수동 pairing 화면이다. 웹 앱 로그인은 [D:\Work\AI_Projects\KAster_CTI\apps\web\src\pages\LoginPage.tsx](D:\Work\AI_Projects\KAster_CTI\apps\web\src\pages\LoginPage.tsx)에서 `loginId / extension / password`로 처리되고, 서버는 이미 `auth/handoff`, `auth/handoff/exchange`, `auth/desktop/session`를 제공한다.

현재 구조는 개발/운영자 관점에서는 usable하지만, 일반 상담원 UX로는 맞지 않는다. 운영용에서는 사용자가 handoff token을 직접 복사하거나 pairing 화면에서 서버 URL을 수동 입력하는 흐름을 제거해야 한다.

## Requirements

### Functional

1. 웹 로그인 화면은 `통화 방식`을 선택할 수 있어야 한다.
   - `소프트폰 사용`
   - `SIP Phone 사용`
2. `소프트폰 사용` 선택 시 웹은 로그인 전에 데스크톱 앱 설치/실행 가능 여부를 확인해야 한다.
3. 데스크톱 앱이 없거나 실행 불가이면 웹 로그인은 차단되고, 설치 또는 실행 안내를 보여야 한다.
4. `소프트폰 사용`으로 웹 로그인에 성공하면 데스크톱 앱은 자동 실행되고, 별도 사용자 입력 없이 자동 연결되어야 한다.
5. 데스크톱 앱은 웹과 별개로 `serverUrl / loginId / extension / password`로 직접 로그인할 수 있어야 한다.
6. 데스크톱 직접 로그인 성공 시 웹도 자동 로그인될 수 있어야 한다.
7. `handoff token`은 사용자 UI에 노출되면 안 된다.

### Non-Functional

1. desktop handoff와 web handoff는 모두 1회용, 짧은 수명, replay 차단이어야 한다.
2. 소프트폰 사용 시 로그인 성공 조건에는 `데스크톱 연결 가능`이 포함되어야 한다.
3. SIP Phone 사용자는 데스크톱 설치 여부와 무관하게 웹만으로 업무 진입 가능해야 한다.
4. 실패 메시지는 상담원 기준의 행동 문구로 보여야 한다.

## Recommended Approach

권장 구조는 `양방향 handoff + 로그인 모드 분기`이다.

- 웹은 `소프트폰 사용`일 때 데스크톱 앱 존재와 실행 가능 여부를 사전 검증한다.
- 검증 성공 후 웹 로그인과 desktop handoff 발급을 연속으로 수행하고, `kaster-agent://connect?...` 커스텀 프로토콜로 데스크톱을 깨운다.
- 데스크톱은 handoff를 받아 자동 로그인한다.
- 데스크톱 단독 로그인 화면을 추가하고, 로그인 성공 시 서버에서 `web handoff`를 발급받아 브라우저를 자동으로 연다.
- 기존 PairingScreen은 디버그/고급 기능으로 숨기고, 기본 진입점에서는 일반 로그인 UI를 사용한다.

이 접근이 가장 현실적인 이유는 기존 서버의 `auth/handoff` 기반 구조를 재사용하면서, 일반 사용자에게는 handoff를 숨기고 자동화만 노출할 수 있기 때문이다.

## Alternatives Considered

### 1. 웹 주도 자동 연동만 제공

웹 로그인에서만 데스크톱을 깨우고, 데스크톱 단독 로그인은 제공하지 않는다.

- 장점: 구현 범위가 작다.
- 단점: 사용자가 데스크톱만으로 업무를 시작할 수 없고, 요구사항을 충족하지 못한다.

### 2. 웹/데스크톱 완전 독립 로그인

웹과 데스크톱을 각각 로그인시키고 자동 handoff를 두지 않는다.

- 장점: 구현이 단순하다.
- 단점: 중복 로그인 UX가 생기고, 웹 로그인 시 자동 연결 요구를 만족하지 못한다.

### 3. 공유 토큰 저장소 기반 자동 로그인

데스크톱이 웹 브라우저 storage를 직접 조작하거나 공유 저장소를 통해 로그인 상태를 동기화한다.

- 장점: 이론상 자동화는 가능하다.
- 단점: 브라우저별 차이, 보안 문제, 운영 복잡도가 커서 유지보수성이 나쁘다.

## Final Architecture

### 1. Web Login Gate

웹 로그인 화면에 `통화 방식` 선택을 추가한다.

- `SIP Phone 사용`
  - 기존 로그인과 동일
  - 로그인 성공 후 상담원 웹으로 진입
- `소프트폰 사용`
  - 로그인 전에 데스크톱 준비 상태를 검사
  - 검사 실패 시 로그인 차단 및 설치/실행 안내
  - 검사 성공 시 로그인 진행
  - 로그인 성공 직후 desktop handoff 발급 및 자동 연결

### 2. Desktop Presence Bridge

웹은 데스크톱 앱 존재 여부를 다음 2단계로 확인한다.

1. `kaster-agent://ping` 커스텀 프로토콜 호출
2. 로컬 헬스체크 엔드포인트 확인
   - 예: `http://127.0.0.1:<desktop-bridge-port>/health`

판정 규칙:

- 프로토콜 호출과 헬스체크가 모두 성공하면 `설치/실행 가능`
- 프로토콜이 실패하면 `미설치`로 간주
- 프로토콜은 성공하지만 헬스체크가 실패하면 `설치됨/실행 안 됨`으로 간주

이 브리지는 웹이 softphone 로그인 가능 여부를 결정하는 전제 조건이 된다.

### 3. Desktop Runtime Entry

데스크톱 앱 기본 진입 화면은 PairingScreen이 아니라 일반 로그인 화면이어야 한다.

필드:

- `콜센터 서버 URL`
- `로그인 ID`
- `내선 번호`
- `비밀번호`

보조 UI:

- `웹과 자동 연결됨` 상태 표시
- `고급 진단` 또는 `수동 handoff`는 숨김 디버그 기능으로만 유지

로그인 성공 후:

- access/refresh token 저장
- `auth/desktop/session`로 softphone/runtime 설정 hydrate
- runtime 연결
- softphone 등록
- web handoff가 허용된 환경이면 브라우저 자동 오픈

### 4. Server Auth Contracts

#### Existing Endpoints Reused

- `POST /auth/login`
- `POST /auth/handoff`
- `POST /auth/handoff/exchange`
- `GET /auth/desktop/session`

#### New Endpoints

- `POST /auth/web-handoff`
  - 데스크톱 로그인 세션에서 웹 자동 로그인용 단기 토큰 발급
- `POST /auth/web-handoff/exchange`
  - 웹이 web handoff token을 access/refresh 세션으로 교환

대안으로 `GET /auth/desktop-handoff?token=...` 같은 리다이렉트 엔드포인트도 가능하지만, 토큰 교환 후 웹 앱이 저장소 반영까지 명시적으로 제어하는 쪽이 테스트와 에러 처리에 유리하므로 `POST exchange`를 권장한다.

### 5. Two Handoff Modes

#### Web -> Desktop Handoff

흐름:

1. 웹에서 `소프트폰 사용` 선택
2. 데스크톱 presence check 성공
3. 웹 로그인 성공
4. 서버가 `desktop handoff token` 발급
5. 웹이 `kaster-agent://connect?...` 호출
6. 데스크톱이 token exchange
7. 데스크톱 runtime/softphone 자동 연결

#### Desktop -> Web Handoff

흐름:

1. 데스크톱 직접 로그인 성공
2. 서버가 `web handoff token` 발급
3. 데스크톱이 브라우저를 `https://.../auth/desktop-handoff?token=...` 또는 웹 앱의 handoff entry URL로 오픈
4. 웹이 token exchange
5. 웹 자동 로그인 완료

### 6. Mode Policy

- `소프트폰 사용`
  - 데스크톱 설치/실행 확인이 로그인 선행 조건
  - desktop handoff 성공이 실질적 로그인 완료 조건
- `SIP Phone 사용`
  - 웹 로그인만 수행
  - 데스크톱 presence check 생략
- `데스크톱 단독`
  - 웹 미연결 상태로도 사용 가능

## UX Rules

### Web Login

- 로그인 화면에 `통화 방식` 선택을 명시적으로 추가한다.
- `소프트폰 사용`을 선택한 경우에만 데스크톱 준비 상태를 검사한다.
- 사용자는 handoff token을 보거나 입력하지 않는다.
- 로그인 실패 문구는 아래처럼 행동 기반으로 안내한다.
  - `데스크톱 앱이 설치되지 않았습니다. 설치 후 다시 시도해 주세요.`
  - `데스크톱 앱이 실행 중이 아닙니다. 앱을 실행한 뒤 다시 시도해 주세요.`
  - `데스크톱 연결에 실패했습니다. 다시 시도하거나 관리자에게 문의해 주세요.`

### Desktop Login

- 기본 화면은 일반 로그인이다.
- 로그인 성공 시 바로 softphone 등록을 시작한다.
- 웹 자동 로그인은 백그라운드 후속 동작으로 처리한다.
- 웹 자동 로그인 실패는 softphone 자체를 막지 않는다. 대신 상태 알림만 보여준다.

### Hidden/Advanced UX

- PairingScreen과 handoff token 수동 입력은 운영 UI에서 제거한다.
- 디버그 빌드 또는 숨김 진단 메뉴에서만 유지한다.

## Failure Handling

### Softphone Mode Failures

- `앱 미설치`
  - 웹 로그인 차단
  - 설치 안내와 설치 파일 링크 제공
- `앱 설치됨, 실행 안 됨`
  - 웹 로그인 차단
  - 실행 안내와 재시도 버튼 제공
- `웹 로그인 성공, desktop handoff 실패`
  - softphone 모드에서는 웹 업무 진입 차단
  - 상담원에게 연결 실패 상태를 명확히 안내
- `desktop softphone registration 실패`
  - 데스크톱에서 진단 코드와 해결 힌트 표시
  - 웹에는 `데스크톱 통화 엔진 연결 실패` 정도만 표시

### SIP Phone Mode Failures

- 데스크톱 관련 체크를 하지 않는다.
- 웹 로그인만 유지한다.

### Desktop-Only Failures

- 로그인 실패는 일반 인증 실패로 처리
- 웹 handoff 실패는 softphone 사용을 막지 않음

## Security Rules

1. desktop handoff와 web handoff는 분리된 토큰 타입이어야 한다.
2. 두 토큰 모두 1회용이어야 한다.
3. 짧은 TTL을 사용한다.
4. 교환 후 즉시 폐기한다.
5. 토큰에는 최소한 `agentId`, `tenantId`, `sid`, `purpose`, `issuedAt`, `expiresAt` 수준의 바인딩이 필요하다.
6. 로그아웃/로그아웃 전체 시 관련 handoff도 즉시 무효화할 수 있어야 한다.
7. 사용자 UI에는 handoff 토큰을 노출하지 않는다.

## Implementation Scope

### Phase 1

- 웹 로그인 화면에 통화 방식 추가
- 데스크톱 기본 화면을 일반 로그인으로 교체
- PairingScreen 기본 노출 제거

### Phase 2

- 데스크톱 presence check 추가
- softphone 선택 시 웹 로그인 게이트 추가
- 설치/실행 실패 UX 추가

### Phase 3

- web -> desktop 자동 handoff 추가
- 커스텀 프로토콜 deep link 추가
- 로컬 health bridge 추가

### Phase 4

- desktop -> web 자동 handoff 추가
- web handoff endpoint 추가
- 브라우저 자동 로그인 엔트리 추가

### Phase 5

- 진단 화면 정리
- 디버그 pairing UI 숨김 처리
- E2E 검증 및 운영 문서화

## Testing Strategy

### Automated

- 웹 로그인 화면 통화 방식 분기 테스트
- 소프트폰 모드 로그인 게이트 테스트
- desktop handoff / web handoff exchange 테스트
- 데스크톱 직접 로그인 테스트
- softphone 모드 실패 처리 테스트

### Manual / Live

- 데스크톱 미설치 상태에서 softphone 로그인 차단
- 데스크톱 설치 후 자동 실행/자동 연결
- SIP Phone 모드에서 웹 단독 로그인
- 데스크톱 직접 로그인 후 웹 자동 로그인
- softphone registration 실패 시 진단 문구 확인

## Open Questions Resolved

- `소프트폰 사용`은 데스크톱 설치/실행을 로그인 선행 조건으로 본다.
- `소프트폰 미사용`은 SIP Phone 실기기 사용으로 본다.
- 데스크톱 앱 직접 로그인도 웹과 독립적으로 허용한다.
- 웹과 데스크톱은 양방향 자동 handoff를 지원한다.

## Recommendation

다음 구현은 `PairingScreen 제거가 아니라 기본 UX에서 내리는 것`으로 시작해야 한다.

즉 첫 단계는:

1. 데스크톱 기본 화면을 일반 로그인으로 교체
2. 웹 로그인에 통화 방식 분기 추가
3. handoff는 사용자 노출 없이 내부 흐름으로만 이동

이 순서를 지키면 현재 서버 계약을 최대한 재사용하면서도, 일반 상담원 UX를 운영 수준으로 끌어올릴 수 있다.
