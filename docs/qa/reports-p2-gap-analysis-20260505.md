# P2-2 리포트 고도화 기준/gap 분석

일시: 2026-05-05
대상: 통화내역, 미연결 콜, 리포트 API/UI

## 현재 API 기준

엔드포인트: `GET /api/v1/calls/history`

현재 필터:

- `from`, `to`: `startedAt` 기준 날짜 범위. 기본 최근 7일.
- `agentId`: `primaryAgentId` 기준.
- `branchId`: 지사 scope 기준.
- `status`: `ENDED`, `QUEUED`, `TALKING`, `AFTER_CALL_WORK`, `RINGING_AGENT`.
- `mode=missed`: `sessionStatus=ENDED` + `answeredAt=null`.

현재 반환 주요 필드:

- 통화 식별: `callId`, `linkedid`
- 번호/분배: `ani`, `dnis`, `didNumber`, `representativeNumber`, `queueName`, `queueDisplayName`
- 상태/시간: `sessionStatus`, `direction`, `startedAt`, `answeredAt`, `endedAt`, `waitSeconds`, `talkSeconds`
- 결과: `resultCode`, 최종 memo `resultCode`, `abandonFlag`, `recordingFlag`
- 부가: `primaryAgent.agentName`, `latestTransfer`

## 현재 관리자 화면 기준

통화내역:

- 경로: `/reports/calls`
- 필터: 날짜, 지사, 전체/미연결
- export: 권한 있을 때 CSV
- 표시: 시작, 발신번호, 대표번호/DID, 분배룰, 상담원, 상태, 전환, 대기, 통화, 포기, 녹취

미연결 콜:

- 경로: `/reports/missed`
- 필터: 날짜, 지사
- export: 권한 있을 때 CSV
- 표시: 시작, 발신번호, 대표번호/DID, 분배룰, 호출 상담원, 대기

## Gap

| 영역 | 현재 | 필요한 기준 |
| --- | --- | --- |
| 미연결 정의 | `ENDED` + `answeredAt=null` 단일 조건 | 고객 포기, 큐 timeout, 상담원 미응답, IVR 실패, 복구 종료 구분 |
| 결과 필터 | `status`, `mode` 중심 | `resultCode`, `abandonFlag`, 최종 상담 메모 결과, IVR 결과를 분리 |
| 미연결 화면 | 원인 컬럼 없음 | 미연결 원인, 종료 사유, 최종 라우팅 단계 표시 |
| 통화내역 화면 | 전체/미연결 토글만 있음 | 상태, 상담원, 결과코드 필터 추가 필요 |
| export | 화면 row 그대로 export | 운영 분석용 원인/결과 컬럼 포함 필요 |
| IVR 실패 | 별도 조회 기준 없음 | DTMF timeout/invalid/fallback/문자 발송 실패 저장 지점 확인 필요 |
| 감사/보관 | 녹취 목록은 별도, 다운로드 감사 기준 미정 | 다운로드 이력 저장 여부와 개인정보 마스킹 기준 확정 필요 |

## 우선 구현 범위 제안

1. `GET /calls/history`에 `resultCode`, `abandon`, `recording`, `queueName` 필터를 추가한다. 완료: 2026-05-05
2. 미연결 콜 응답에 `missedReason` 계산 필드를 추가한다. 완료: 2026-05-05
3. 관리자 미연결 콜 화면에 `미연결 원인`, `결과코드`, `포기` 컬럼을 추가한다. 완료: 2026-05-05
4. 관리자 통화내역 화면에 상태/결과/큐/포기/녹취 필터를 추가한다. 완료: 2026-05-05
5. IVR 실패 리포트는 이벤트 저장 구조 확인 후 별도 하위 작업으로 분리한다.

## 구현/배포 검증

- 로컬 서버 테스트: `npm test -- --runTestsByPath test/calls-service.integration.spec.ts test/announcements.controller.spec.ts test/auth-softphone-config.integration.spec.ts`
  - 결과: 3 suites, 24 tests PASS
- 로컬 서버 빌드: `npm run build`
  - 결과: PASS
- 로컬 관리자 빌드: `npm run build`
  - 결과: PASS
- 원격 배포: `docker compose -f docker-compose.dev.yml up -d --build server admin`
  - 결과: `kaster-server`, `kaster-admin` 재빌드 및 기동 완료
- 원격 API 확인: `GET /api/v1/calls/history?mode=missed&abandon=false&recording=false`
  - 결과: `success: true`, `missedReason` 포함
- PBX 설정 충돌 확인: `kaster-server` mount 목록 `[]`, owner `rehearsal-20260501`

## 다음 확인 필요

- 운영자가 미연결 콜에서 가장 먼저 볼 분류는 `고객 포기`, `상담원 미응답`, `큐 timeout`, `시스템 복구 종료` 네 가지로 시작하는 것이 적절하다.
- IVR 실패는 현재 `callSessions`만으로는 충분히 분류하기 어렵다. `rawAmiEvents`, Smart ARS 이벤트, 문자 발송 이력 중 어느 테이블을 기준으로 삼을지 별도 확인이 필요하다.
