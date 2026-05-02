# 데스크톱 앱 실행 테스트 결과

작성일: 2026-05-02
대상: `apps/desktop/release/win-unpacked/KAster Agent.exe`
실행 방식: 패키지 산출물 직접 실행 후 Electron 원격 디버깅 포트로 DOM 상태 확인

## 1. 실행 결과

| 항목 | 결과 | 증적 |
| --- | --- | --- |
| 프로세스 실행 | PASS | `KAster Agent.exe` 실행, `Responding=True` |
| 창 생성 | PASS | 제목 `KAster Agent Desktop`, 크기 520x760 |
| 서버 health | PASS | `http://49.247.46.86/api/v1/health` 200, `http://49.247.46.86:3000/api/v1/health` 200 |
| 저장 설정 로드 | PASS | `serverUrl=http://49.247.46.86`, `channel=stable`, `deviceId=prod-live-test-device` |
| 저장 세션 로드 | PASS | 상담원 `홍길동 (1001)` 콘솔 진입 |
| CTI 런타임 연결 | PASS | 진단 화면 `CTI Runtime / connected` |
| 업데이트 배너 표시 | PASS | `새 버전 0.1.0 이 준비되었습니다`, `설치 실행` 비활성 |
| 설정 패널 진입 | PASS | 오디오 장치/권한/라우팅/진단 UI 표시 |
| 진단 패널 진입 | PASS | readiness, runtime, softphone 상태 표시 |

## 2. 화면 증적

| 화면 | 파일 |
| --- | --- |
| 상담원 콘솔 | `docs/qa/desktop-app-running-20260502.png` |
| 설정 화면 | `docs/qa/desktop-app-settings-20260502.png` |
| 진단 화면 | `docs/qa/desktop-app-diagnostics-20260502.png` |

## 3. 실제 확인된 화면 상태

상담원 콘솔:

- 상담원: `홍길동 (1001)`
- 상태 selector: `AVAILABLE`
- 통화 상태: `진행 중인 통화 없음`
- 버튼 상태: `수신`, `종료`, `음소거`, `보류`, `발신`, `전환`은 현재 통화/입력 없음 상태에 맞게 비활성
- 업데이트: `업데이트 준비` 활성, `설치 실행` 비활성

설정/진단:

- 권한 상태: `unknown`
- 출력 장치 라우팅: `지원`
- 마이크/스피커/벨소리 출력: `기본 장치`
- Echo Cancellation / Noise Suppression: 체크됨
- 준비 상태: `blocked`
- CTI Runtime: `connected`
- Softphone 설정: `enabled`
- WSS Transport: `not-connected`
- SIP Registration: `idle`

## 4. 실행 중 확인한 세션/소프트폰 설정

```json
{
  "serverUrl": "http://49.247.46.86",
  "channel": "stable",
  "deviceId": "prod-live-test-device",
  "agent": {
    "agentName": "홍길동",
    "extension": "1001",
    "role": "agent"
  },
  "softphoneConfig": {
    "enabled": true,
    "sipUri": "sip:1001@49.247.46.86",
    "wsServer": "ws://49.247.46.86:8088/ws",
    "authorizationUsername": "1001",
    "authorizationPassword": null
  }
}
```

## 5. 보류한 동작

아래 동작은 서버 기록, 실제 통화 상태, 장치 권한, 업데이트 설치에 영향을 줄 수 있어 이번 자동 실행 테스트에서는 누르지 않았다.

| 동작 | 보류 사유 |
| --- | --- |
| 업데이트 준비/설치 실행 | 다운로드/리포트/설치 흐름이 서버 기록 또는 로컬 실행 파일에 영향 |
| 권한 요청 | 마이크 권한 요청 및 장치 접근 필요 |
| 장치 새로고침/스피커 테스트/벨소리 테스트 | 실제 오디오 장치 접근 및 출력 필요 |
| 상담원 상태 변경 | 운영 서버 상담원 상태 변경 가능 |
| 발신/전환/수신/종료 | 실제 통화 또는 CTI 제어 상태 변경 가능 |
| Softphone 등록/중지 | PBX SIP 등록 상태 변경 가능 |

## 6. 판정

데스크톱 앱은 패키지 실행 기준으로 정상 기동하고, 저장된 운영 서버 설정/세션을 읽어 상담원 콘솔까지 진입했다. CTI Runtime은 연결 상태로 확인되며, 설정/오디오/진단 화면도 정상 렌더링된다.

실제 통화 운영 테스트를 완료하려면 마이크 권한 승인, SIP 인증 비밀번호 제공, PBX WSS 연결, 실제 인입/발신 1건 검증이 추가로 필요하다.
