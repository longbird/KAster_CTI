# Agent Desktop Internal Code Signing Runbook

- Date: 2026-04-23
- Scope: KAster Agent Windows desktop package signing for managed on-prem call center deployments
- Policy: unsigned packages are allowed for development and internal QA only. Internal CA based signing is required before formal production.

## Goal

운영사 Windows 빌드 서버에서 KAster Agent 배포 파일을 내부 CA 또는 AD CS 기반 인증서로 서명하고, 콜센터 서버에는 서명된 산출물만 배포한다.

## Applicability

- 관리형 Windows 상담원 PC
- 운영사 통제형 `운영사 -> 콜센터 서버 -> 상담원 앱` 배포 구조
- 공개 인터넷 배포가 아닌 on-prem CTI 환경

## Prerequisites

### Certificate

- 운영사 자체 CA 또는 고객사 AD CS 에서 `Code Signing` 용 인증서 발급
- RSA 기반 인증서 사용
- 운영사 빌드 서버의 현재 사용자 또는 로컬 머신 인증서 저장소에 개인키 포함 상태로 설치

권장 식별 방식:

- 1순위: 인증서 SHA1 thumbprint
- 2순위: 인증서 subject name

### Build Server

- Windows 빌드 서버
- Windows SDK 또는 Visual Studio Build Tools 설치
- `signtool.exe` 사용 가능
- Node.js / npm / 프로젝트 의존성 설치 완료

### Agent PCs

- 상담원 PC 에 운영사 또는 고객사 루트 CA / 중간 CA 인증서 배포
- 그룹 정책 또는 Intune 등으로 신뢰 저장소 반영

## Environment Variables

서명 스크립트는 아래 환경변수를 기준으로 동작한다.

- `KASTER_SIGN_CERT_SHA1`
  운영에 권장. 빌드 서버 인증서 저장소에 설치된 코드서명 인증서 thumbprint
- `KASTER_SIGN_CERT_SUBJECT`
  thumbprint 가 없을 때 대체 사용. 예: `KAster Operations`
- `KASTER_SIGN_TIMESTAMP_URL`
  RFC3161 타임스탬프 URL. 내부 타임스탬프 또는 사내 승인 외부 타임스탬프 사용

둘 중 하나는 반드시 필요하다.

- `KASTER_SIGN_CERT_SHA1`
- `KASTER_SIGN_CERT_SUBJECT`

## Desktop Commands

위치는 [package.json](/D:/Work/AI_Projects/KAster_CTI/apps/desktop/package.json) 기준이다.

### 1. Build unsigned release artifacts

```powershell
cd D:\Work\AI_Projects\KAster_CTI\apps\desktop
npm run dist:win
```

### 2. Sign release artifacts with internal CA certificate

```powershell
$env:KASTER_SIGN_CERT_SHA1="YOUR_CERT_SHA1"
$env:KASTER_SIGN_TIMESTAMP_URL="http://timestamp.example.local"
npm run sign:internal
```

### 3. Verify signatures

```powershell
npm run verify:signature
```

### 4. Full build-sign-verify sequence

```powershell
npm run dist:win:signed
```

## Signed File Scope

현재 스크립트는 `apps/desktop/release` 아래의 다음 파일을 대상으로 한다.

- `*.exe`
- `*.dll`

예상 포함 범위:

- NSIS installer exe
- portable exe
- `win-unpacked` 내부 app exe / dll

`resources\\elevate.exe` 는 제외한다.

## Operational Flow

1. 운영사 빌드 서버에서 desktop release 빌드
2. 내부 CA 인증서로 release 산출물 서명
3. `Get-AuthenticodeSignature` 와 `signtool verify` 로 검증
4. 서명된 설치본만 콜센터 서버 update hub 로 배포
5. 콜센터 서버 manifest 는 서명된 버전만 활성화

## Verification Criteria

정식 운영 전 배포본은 아래를 만족해야 한다.

- 주요 exe / dll 모두 `Get-AuthenticodeSignature.Status = Valid`
- `signtool verify /pa /all /tw` 통과
- update hub 에 업로드된 파일 해시와 manifest SHA256 일치

## Formal Production Gate

정식 운영 전 체크리스트:

- 내부 CA 기반 코드서명 인증서 발급 완료
- 운영사 빌드 서버 인증서 설치 완료
- 상담원 PC 루트/중간 인증서 배포 완료
- `npm run dist:win:signed` 결과 검증 완료
- 콜센터 서버에는 unsigned 설치본 업로드 금지

## Future Upgrade Path

외부 신뢰 또는 공개 배포 요구가 생기면 다음으로 확장한다.

- Microsoft Trusted Signing
- 공인 EV 기반 코드서명

현재 문서는 내부 배포용 최소 운영 기준만 다룬다.
