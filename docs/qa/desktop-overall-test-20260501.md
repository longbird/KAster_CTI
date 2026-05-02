# 데스크톱 앱 전체 테스트 결과

작성일: 2026-05-01
대상: `apps/desktop` KAster Agent 0.1.0
범위: 자동화 테스트, 프로덕션 빌드, Windows 패키징, 패키지 실행 smoke test

## 1. 자동화 검증 결과

| 구분 | 명령 | 결과 | 비고 |
| --- | --- | --- | --- |
| 단위/컴포넌트 테스트 | `npm test` | PASS | 29 files, 107 tests |
| 프로덕션 빌드 | `npm run build` | PASS | main/preload/renderer 빌드 성공 |
| 패키징 dry run | `npm run pack:dir` | PASS | `release/win-unpacked/KAster Agent.exe` 생성 |
| 설치/포터블 빌드 | `npm run dist:win` | PASS | NSIS installer, portable exe, blockmap 생성 |
| 패키지 실행 smoke | `release/win-unpacked/KAster Agent.exe` 실행 후 8초 확인 | PASS | 프로세스 유지, `Responding=True` |

## 2. 검증된 기능 범위

| 영역 | 자동화 확인 내용 |
| --- | --- |
| 메인 프로세스 | 런타임 감독, 트레이, 창 옵션, 설정 저장, 토큰 보관, 브리지 서버, 업데이트 클라이언트 |
| 인증/CTI | 로그인 토큰 처리, CTI 런타임 이벤트 처리, 프로토콜 payload 구성 |
| SIP/소프트폰 | SIP 클라이언트 제어, 통화 상태 저장소, 미디어 컨트롤러, readiness 판정 |
| 오디오 | 장치 선택 컨트롤러, 장치 preference 저장 |
| 렌더러 UI | 로그인 화면, 소프트폰 shell, 업데이트 배너, 스타일 계약 |
| 패키징 | Electron Builder 설정, app metadata, asar, icon/resource 포함, NSIS/portable 산출물 |

## 3. 이번 실행 산출물

| 파일 | 크기 | 생성 시각 |
| --- | ---: | --- |
| `apps/desktop/release/KAster Agent-0.1.0-x64.exe` | 85,358,385 bytes | 2026-05-01 23:54 |
| `apps/desktop/release/KAster Agent-0.1.0-portable.exe` | 84,855,704 bytes | 2026-05-01 23:54 |
| `apps/desktop/release/KAster Agent-0.1.0-x64.exe.blockmap` | 89,397 bytes | 2026-05-01 23:54 |
| `apps/desktop/release/win-unpacked/KAster Agent.exe` | 188,904,960 bytes | 2026-05-01 23:54 |

## 4. 운영 전 실환경 잔여 검증

자동화로는 데스크톱 앱의 운영 필수 경로 중 실제 PBX/SIP/오디오 물리 환경을 완전히 증명할 수 없다. 아래 항목은 상담원 PC, 헤드셋, PBX 서버, CTI 서버가 연결된 환경에서 별도 증적이 필요하다.

| 시나리오 | 현재 판정 | 필요한 증적 |
| --- | --- | --- |
| 실제 SIP 등록 | NOT RUN | PBX 등록 로그, 앱 상태 화면 |
| 인입 수신/벨 울림 | NOT RUN | DID 1건 인입, 벨소리 장치 출력 확인 |
| 통화 수락 후 양방향 음성 | NOT RUN | 상담원 PC 마이크/스피커 송수신 확인 |
| 발신 통화 | NOT RUN | PBX 발신 로그, 앱 call state |
| 통화 종료 후 CTI 이벤트 반영 | NOT RUN | 서버 `call.ended` 또는 active call 제거 확인 |
| 네트워크 단절 후 재등록 | NOT RUN | 앱 재연결 상태, PBX 등록 회복 로그 |
| 업데이트 manifest/download/install | NOT RUN | 운영 업데이트 서버 manifest, 다운로드 hash, 설치 결과 기록 |
| 코드서명 검증 | NOT RUN | 현재 빌드는 인증서 미설정으로 signing skipped |

## 5. 판정

데스크톱 앱은 로컬 자동화 기준으로 테스트, 빌드, 패키징, 실행 smoke test를 통과했다. 실제 운영 테스트 가능 수준의 설치 산출물은 생성된다.

운영 반영 전 최종 PASS 판정에는 실제 상담원 PC에서 SIP 등록, 인입/발신 통화, 오디오 장치 분리, 업데이트 설치 흐름의 실환경 증적이 추가로 필요하다.
