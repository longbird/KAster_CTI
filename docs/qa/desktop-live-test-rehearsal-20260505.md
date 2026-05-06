# 데스크톱 상담원 PC 실환경 검증 준비 결과

작성일: 2026-05-05 09:37 KST
대상: `apps/desktop` KAster Agent 0.1.0
기준 서버/커밋: `fb670de`
범위: 실 상담원 PC 투입 전 자동 baseline, 서버-데스크톱 계약 테스트, Windows 패키징 smoke

## 1. 환경

| 항목 | 값 |
| --- | --- |
| 검증 PC OS | Windows 10.0.19045 |
| CTI 리허설 API | `http://api.49.247.46.86.nip.io:5180/api/v1` |
| PBX 리허설 | `172.20.0.1:36070` 기준 queue/agent/WS smoke PASS |
| 데스크톱 앱 버전 | `0.1.0` |
| 패키지 산출물 | `apps/desktop/release/KAster Agent-0.1.0-x64.exe`, `apps/desktop/release/KAster Agent-0.1.0-portable.exe` |

## 2. 자동 baseline

| 구분 | 명령 | 결과 | 증적 |
| --- | --- | --- | --- |
| Desktop unit/component tests | `cd apps/desktop && npm test` | PASS | 30 files, 123 tests |
| Desktop production build | `cd apps/desktop && npm run build` | PASS | main/preload/renderer build 성공 |
| Desktop unpacked package | `cd apps/desktop && npm run pack:dir` | PASS | `release/win-unpacked/KAster Agent.exe` 생성 |
| Desktop process smoke | `release/win-unpacked/KAster Agent.exe` 8초 실행 | PASS | process `Responding=True` |
| Desktop installer/portable build | `cd apps/desktop && npm run dist:win` | PASS | NSIS installer, portable exe, blockmap 생성 |
| Server desktop integration tests | `cd apps/server && npm test -- --runTestsByPath ...desktop/update...` | PASS | 5 suites, 21 tests |
| Server build | `cd apps/server && npm run build` | PASS | Nest build 성공 |

## 3. 생성 산출물

| 파일 | 크기 | 생성 시각 |
| --- | ---: | --- |
| `apps/desktop/release/KAster Agent-0.1.0-x64.exe` | 85,361,505 bytes | 2026-05-05 09:37 |
| `apps/desktop/release/KAster Agent-0.1.0-portable.exe` | 84,858,794 bytes | 2026-05-05 09:37 |
| `apps/desktop/release/KAster Agent-0.1.0-x64.exe.blockmap` | 89,517 bytes | 2026-05-05 09:37 |
| `apps/desktop/release/win-unpacked/KAster Agent.exe` | 188,904,960 bytes | 2026-05-05 09:35 |

## 4. 서버/PBX 선행 상태

| 항목 | 결과 | 증적 |
| --- | --- | --- |
| PBX config apply gate | PASS | `docs/qa/pbx-smoke-report-rehearsal-20260501-config-apply-gate-20260505-081519.md` |
| queue + agent + WS gate | PASS | `linkedid=1777936527.71` |
| 리허설 health | PASS | `db: up`, `redis: up`, `ami: connected` |

## 5. 실제 상담원 PC 필요 항목

아래 항목은 현재 워크스테이션 자동화로는 완료 판정할 수 없다. 실제 Windows 상담원 PC, 헤드셋, 마이크, 스피커, 현장 네트워크, 실 SIP 단말 환경에서 `docs/qa/desktop-live-test-template.md`를 채워야 한다.

| 시나리오 | 현재 판정 | 필요한 증적 |
| --- | --- | --- |
| pairing / desktop session hydrate | READY | 실제 PC 화면, 앱 event log |
| SIP 등록 | NOT RUN | PBX 등록 로그, 앱 readiness 상태 |
| 인입 ringing / 수락 / 종료 | NOT RUN | DID 1건 인입, 앱 상태, `call.ended` |
| 발신 | NOT RUN | 발신 API/PBX 로그, 앱 call state |
| 양방향 음성 | NOT RUN | 마이크/스피커 송수신 확인 |
| 마이크/스피커/벨소리 장치 분리 | NOT RUN | 장치 선택 저장, preview, 재시작 유지 |
| 네트워크 단절 후 복구 | NOT RUN | 앱 reconnect, PBX 재등록 |
| CTI 서버 재시작 후 복구 | NOT RUN | runtime reconnect, 상태 복구 |
| 업데이트 설치 흐름 | READY | manifest/download/hash/install report 실환경 확인 |

## 6. 판정

데스크톱 앱은 실 상담원 PC 투입 전 자동 baseline과 패키징 기준을 통과했다.

다음 차단점은 코드/빌드가 아니라 실제 Windows 상담원 PC에서의 SIP 등록, 인입/발신, 오디오 장치, 장애 복구 증적 수집이다.
