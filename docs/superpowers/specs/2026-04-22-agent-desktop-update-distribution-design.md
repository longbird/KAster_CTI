# Agent Desktop Update Distribution Design

- Date: 2026-04-22
- Status: Proposed
- Scope: 운영사 책임형 on-prem CTI 환경에서 콜센터 서버를 통한 상담원 데스크톱 앱 배포/업데이트 구조

## Background

상담원 데스크톱 앱은 운영사가 개발과 유지보수를 책임지지만, CTI 서버는 개별 콜센터에 설치되는 구조다. 각 콜센터는 자체 서버를 보유하고 있으며, 재택 근무 상담원 접속과 PBX 운영을 위해 외부에서 접근 가능한 공인 IP 또는 공인 IP를 가진 네트워크 장비를 사용한다.

이 구조에서는 상담원 앱이 운영사 퍼블릭 서버에서 직접 업데이트를 받는 모델보다, 각 콜센터 서버를 통해 업데이트를 제공하는 모델이 더 적합하다. 또한 외부 노출 환경이므로 업데이트 파일 자체를 공개 경로로 두면 안 되며, 상담원 로그인 이후 별도 단기 업데이트 토큰을 통해서만 접근 가능해야 한다.

## Problem Statement

상담원 데스크톱 앱 배포는 아래 조건을 동시에 만족해야 한다.

- 운영사가 빌드, 코드서명, 버전 승인, 배포 책임을 가진다.
- 실제 설치 파일과 업데이트 응답은 각 콜센터 서버가 제공한다.
- 상담원 앱은 반드시 해당 콜센터 서버를 통해 업데이트를 수행한다.
- 외부 재택 근무 환경에서도 인증되지 않은 제3자가 업데이트 파일을 내려받을 수 없어야 한다.
- 콜센터별 승인 버전, 점진 배포, 롤백이 가능해야 한다.
- CTI 서버 버전과 상담원 앱 버전의 호환성을 같이 통제해야 한다.

## Goals

- `운영사 -> 콜센터 서버 -> 상담원 앱` 2단계 배포 모델을 정의한다.
- 콜센터 서버가 HTTPS 기반 업데이트 허브 역할을 수행하는 구조를 정의한다.
- 상담원 로그인 세션과 분리된 단기 업데이트 토큰 모델을 정의한다.
- 업데이트 적용 시점, 강제 업데이트, 감사 로그 규칙을 명확히 한다.

## Non-Goals

- 이번 문서에서 Electron 빌드 도구나 auto-update 라이브러리의 세부 구현을 확정하지 않는다.
- 이번 문서에서 Windows 설치 파일 포맷(Squirrel/MSIX) 중 하나를 최종 선택하지 않는다.
- 이번 문서에서 운영사 중앙 배포 시스템의 내부 운영 툴 UI를 설계하지 않는다.

## Options Considered

### Option A: Operator Central Server Direct Update

상담원 앱이 운영사 중앙 업데이트 서버를 직접 조회하고 파일도 중앙에서 직접 내려받는다.

장점:

- 운영사 입장에서 중앙 통제가 쉽다.
- 콜센터 서버에 업데이트 호스팅 기능을 추가하지 않아도 된다.

단점:

- 현장 방화벽 정책과 외부 접속 정책에 민감하다.
- 콜센터별 버전 독립성과 장애 분리가 약하다.
- on-prem CTI 운영 모델과 어울리지 않는다.

평가:

현재 운영 전제와 맞지 않는다.

### Option B: Operator to Call Center Server to Agent App

운영사가 서명된 앱 파일과 manifest를 각 콜센터 서버에 배포하고, 상담원 앱은 자기 콜센터 서버에서만 업데이트를 받는다.

장점:

- on-prem CTI 구조와 잘 맞는다.
- 콜센터별 버전 승인, 점진 배포, 롤백이 쉽다.
- 상담원 앱이 외부 임의 서버를 직접 보지 않는다.
- 운영사 책임과 콜센터 현장 운영 경계를 명확히 할 수 있다.

단점:

- 콜센터 서버가 HTTPS 업데이트 허브 기능을 가져야 한다.
- 운영사가 각 콜센터 서버로 배포하는 절차와 도구가 필요하다.

평가:

현재 구조에 가장 적합한 권장안이다.

### Option C: Manual File Distribution Through Center File Shares

운영사가 설치 파일만 전달하고, 콜센터가 파일 공유 또는 수동 설치 방식으로 상담원 앱을 업데이트한다.

장점:

- 초기 구현이 가장 단순하다.
- HTTP 업데이트 API 없이도 시작할 수 있다.

단점:

- 자동 업데이트, 강제 업데이트, 버전 수렴, 롤백 관리가 약하다.
- 재택 근무자 환경을 안정적으로 지원하기 어렵다.
- 운영 감사와 보안 통제가 부족하다.

평가:

임시 대응으로는 가능하지만 장기 구조로는 부적합하다.

## Recommendation

권장안은 Option B다.

즉, 운영사는 빌드와 코드서명을 담당하고, 각 콜센터 서버는 센터 전용 업데이트 허브 역할을 맡는다. 상담원 앱은 자신의 콜센터 서버에만 접근해서 manifest를 조회하고, 승인된 버전만 다운로드한다. 업데이트 파일 접근은 업무 로그인 토큰과 분리된 업데이트 전용 단기 토큰으로 제어한다.

## Target Architecture

### Actors

1. Operator Build and Release System

- 상담원 앱 빌드
- 코드서명
- 버전 승인
- 센터별 배포 패키지 생성

2. Call Center Server

- CTI 서버 역할 수행
- 상담원 앱 업데이트 HTTPS 엔드포인트 제공
- 센터별 승인 버전 정책 제공
- 설치 파일 및 업데이트 manifest 보관

3. Agent Desktop App

- 센터 서버에서만 업데이트 조회
- 로그인 후 업데이트 전용 세션 발급
- 백그라운드 다운로드
- 안전 상태에서만 설치 적용

### Core Principle

- 운영사는 앱 산출물의 최종 신뢰 원천이다.
- 콜센터 서버는 현장 배포 허브이자 정책 제공자다.
- 상담원 앱은 로그인 후 인증된 상태에서만 업데이트 정보와 파일에 접근한다.

## Distribution Flow

### Release Flow

1. 운영사가 새 버전의 상담원 앱을 빌드한다.
2. 운영사가 Windows 코드서명 인증서로 패키지에 서명한다.
3. 운영사가 릴리스 저장소에 버전별 산출물을 저장한다.
4. 운영사가 각 콜센터 서버에 해당 버전 파일과 manifest를 배포한다.
5. 콜센터별 승인 시점이 되면 해당 서버의 manifest 또는 활성 버전 포인터를 변경한다.

### Client Update Flow

1. 상담원 앱이 CTI 로그인에 성공한다.
2. 앱이 콜센터 서버에 업데이트 세션 발급을 요청한다.
3. 서버가 짧은 수명의 `update session token`을 발급한다.
4. 앱이 해당 토큰으로 manifest를 조회한다.
5. 승인된 새 버전이 있으면 앱이 `download-init`을 호출한다.
6. 서버가 특정 버전/파일에 묶인 짧은 수명 또는 1회성 `download token`을 발급한다.
7. 앱이 해당 토큰으로 파일을 다운로드한다.
8. 앱이 해시와 코드서명을 검증한다.
9. 통화 상태와 상담원 상태가 안전 조건을 만족하면 설치를 적용한다.
10. 앱이 설치 결과를 서버에 보고한다.

## Call Center Server Update Hub

콜센터 서버는 단순 정적 파일 저장소가 아니라, 다음 책임을 가진 업데이트 허브여야 한다.

- 승인된 버전 정책 반환
- 상담원 인증 기반 업데이트 토큰 발급
- 센터별 패키지 호스팅
- 다운로드와 설치 결과 감사 로그 기록
- 롤백을 위한 이전 버전 유지

### Recommended URL Structure

- `/agent-updates/manifest`
- `/agent-updates/session`
- `/agent-updates/download-init`
- `/agent-updates/artifacts/:artifactId`
- `/agent-updates/report`

실제 패키지 파일은 내부적으로 버전 디렉터리에 저장할 수 있지만, 외부에 노출되는 접근점은 위 API 집합을 기준으로 통제하는 것이 좋다.

## Update Authentication Model

업데이트 접근은 업무 로그인 토큰을 직접 재사용하지 않고, 전용 단기 토큰을 사용한다.

### Why Separate Tokens

- 업무 API 권한과 업데이트 파일 권한을 분리할 수 있다.
- 파일 다운로드 권한 범위를 더 좁게 제한할 수 있다.
- 토큰 유출 시 피해 범위를 줄일 수 있다.

### Token Types

1. Update Session Token

- 발급 시점: 상담원 로그인 후 또는 앱 시작 직후
- 수명: 5~10분 권장
- 사용처: manifest 조회, download-init 호출
- scope 예시: `update:read`

2. Download Token

- 발급 시점: 특정 버전 다운로드 승인 후
- 수명: 1~3분 또는 1회성 권장
- 사용처: 특정 artifact 다운로드
- scope 예시: `update:download`

### Required Claims

- `agentId`
- `tenantId`
- `centerId`
- `deviceId`
- `version` 또는 `artifactId`
- `scope`
- `expiresAt`

다운로드 토큰은 가능하면 특정 `artifactId`와 `version`에 묶여야 하며, 재사용을 막기 위한 서버 측 소모 처리 또는 매우 짧은 만료 정책을 가져야 한다.

## Update APIs

### `POST /agent-updates/session`

목적:

- 업무 로그인 세션을 기반으로 업데이트 전용 세션을 연다.

입력:

- 현재 로그인 access token
- 선택적 `deviceId`
- 선택적 현재 앱 버전

출력:

- `updateSessionToken`
- `expiresIn`

### `GET /agent-updates/manifest`

목적:

- 현재 상담원과 센터에 허용된 버전 정책을 조회한다.

권한:

- 유효한 `update session token` 필요

권장 응답:

```json
{
  "success": true,
  "data": {
    "centerId": "center-a",
    "channel": "stable",
    "currentVersion": "1.3.2",
    "latestVersion": "1.4.0",
    "mandatory": false,
    "minimumRequiredVersion": "1.2.8",
    "serverCompatibility": {
      "minimumServerVersion": "0.9.0",
      "maximumServerVersion": "0.9.x"
    },
    "artifacts": [
      {
        "artifactId": "agent-win-x64-1.4.0",
        "version": "1.4.0",
        "fileName": "KAsterAgent-1.4.0-Setup.exe",
        "size": 85423104,
        "sha256": "..."
      }
    ],
    "notes": "음소거/보류 안정성 개선"
  },
  "error": null
}
```

### `POST /agent-updates/download-init`

목적:

- 특정 버전에 대한 다운로드 권한을 부여한다.

입력:

- `artifactId`
- 현재 앱 버전
- `update session token`

출력:

```json
{
  "success": true,
  "data": {
    "artifactId": "agent-win-x64-1.4.0",
    "version": "1.4.0",
    "downloadUrl": "/agent-updates/artifacts/agent-win-x64-1.4.0",
    "downloadToken": "one-time-or-short-lived-token",
    "expiresIn": 120,
    "sha256": "..."
  },
  "error": null
}
```

### `GET /agent-updates/artifacts/:artifactId`

목적:

- 실제 설치 파일을 다운로드한다.

권한:

- `download token` 필요

규칙:

- 토큰이 가리키는 `artifactId`와 요청 `artifactId`가 일치해야 한다.
- 센터 범위를 벗어난 파일 접근은 차단한다.
- 토큰 없는 접근은 무조건 거절한다.

### `POST /agent-updates/report`

목적:

- 다운로드 및 설치 결과를 서버에 보고한다.

이벤트 예시:

- `download_started`
- `download_completed`
- `install_scheduled`
- `install_completed`
- `install_failed`
- `rollback_completed`

## Version Policy and Compatibility

콜센터 서버는 단순 최신 버전 안내가 아니라, 센터 정책을 반영한 승인 버전을 내려줘야 한다.

### Required Policy Fields

- `channel`
- `latestVersion`
- `mandatory`
- `minimumRequiredVersion`
- `minimumServerVersion`
- `maximumServerVersion`

### Why Compatibility Rules Matter

이 프로젝트는 콜센터별 on-prem CTI 서버와 상담원 앱이 함께 동작한다. 따라서 앱과 서버 사이의 프로토콜, API, 실시간 이벤트 계약이 달라질 수 있다. 앱은 새 버전을 받기 전에 자신이 연결된 CTI 서버 버전과 호환되는지 확인해야 한다.

## Rollout and Rollback

운영사는 각 콜센터 서버에 새 버전 파일을 먼저 배포한 뒤, 승인 시점에 manifest를 전환하는 방식으로 운영하는 것이 좋다.

### Rollout Strategy

- 센터별로 승인 버전을 독립적으로 유지한다.
- 새 버전 파일은 먼저 업로드하고, 승인 포인터는 나중에 전환한다.
- pilot 센터를 먼저 선택해 점진 배포할 수 있다.

### Rollback Strategy

- 콜센터 서버는 최근 2~3개 버전 파일을 유지한다.
- manifest를 이전 버전으로 되돌려 즉시 롤백한다.
- 앱은 설치 실패 또는 호환성 실패를 `/agent-updates/report`로 보고한다.

## Update Application Rules

CTI 상담원 앱은 통화 중 즉시 재시작하면 안 된다.

### Download Rules

- 백그라운드 다운로드는 허용 가능
- 단, 네트워크 부하 정책은 센터별로 조정 가능

### Install Rules

설치 적용은 아래 조건을 만족할 때만 허용한다.

- 활성 콜 없음
- 상담원 상태가 `AVAILABLE`, `BREAK`, `MANUAL_PAUSED` 같은 안전 상태
- 세션 상태가 `RINGING_AGENT`, `QUEUED`, `TALKING`, `TRANSFERRING`, `HOLD`가 아님

### Mandatory Update Rules

- `mandatory=false`면 상담원이 유예 가능
- `mandatory=true`면 유휴 상태 또는 다음 로그인 시 적용 강제
- `minimumRequiredVersion`보다 낮은 앱은 로그인 또는 주요 기능 사용을 차단할 수 있음

## Security Requirements

### Transport Security

- 모든 업데이트 엔드포인트는 HTTPS 사용
- 가능하면 공인 인증서 사용
- 상담원 앱은 콜센터 서버 인증서 검증을 우회하지 않아야 함

### Package Trust

- 모든 Windows 설치 패키지는 운영사 코드서명 필수
- 앱은 다운로드 후 해시를 검증해야 함
- 운영체제 수준 코드서명 검증 실패 시 설치를 중단해야 함

### Access Control

- manifest도 인증 없이 접근 불가
- 실제 artifact는 `download token` 없이는 접근 불가
- 토큰은 센터, 상담원, 장치, 버전 범위에 묶어야 함

## Audit Logging

외부 접근이 가능한 환경이므로 업데이트 접근은 감사 대상으로 남겨야 한다.

### Minimum Audit Fields

- `agentId`
- `tenantId`
- `centerId`
- `deviceId`
- `clientIp`
- `currentAppVersion`
- `targetVersion`
- `manifestViewedAt`
- `downloadInitAt`
- `downloadStartedAt`
- `downloadCompletedAt`
- `installReportedAt`
- `installResult`
- `rollbackReportedAt`

이 정보가 있어야 운영사는 센터별 배포 상태, 외부 접속 이력, 장애 버전의 영향 범위를 추적할 수 있다.

## Operational Responsibilities

### Operator Responsibilities

- 빌드
- 코드서명
- 버전 승인
- 센터별 배포 패키지 제공
- 배포/롤백 정책 결정

### Call Center Responsibilities

- 센터 서버의 HTTPS 업데이트 엔드포인트 운영
- 운영사에서 받은 승인 버전 파일 보관
- 센터 정책에 맞는 manifest 제공

### Agent App Responsibilities

- 인증된 업데이트 세션 생성
- manifest 확인
- 안전한 다운로드와 검증
- 통화 안전 상태에서만 설치 적용
- 결과 보고

## Final Decision

상담원 데스크톱 앱 배포는 `운영사 -> 콜센터 서버 -> 상담원 앱` 구조로 진행한다.

콜센터 서버는 CTI 서버와 함께 업데이트 허브 역할을 수행하며, 상담원 앱은 로그인 후 발급되는 업데이트 전용 단기 토큰을 통해서만 manifest와 설치 파일에 접근한다. 이 구조는 on-prem CTI 운영 모델, 외부 재택 근무 환경, 운영사 책임형 배포 정책을 동시에 만족한다.
