# IVR 실패 리포트 데이터 출처 분석

일시: 2026-05-05
대상: 기본 개발 서버 DB `kaster_cti`

## 확인 결과

Smart ARS/IVR 실패 리포트의 1차 데이터 출처는 `rawAmiEvents`다.

- 이벤트명: `UserEvent`
- 사용자 이벤트: `KasterSmartArs`
- 주요 payload 위치: `payload.raw`
- 통화 연결 키: `linkedid`
- tenant/branch/DID: `TenantId`, `BranchId`, `EntryDid`
- 고객 입력/결과: `Digit`, `Stage`, `Action`, `Result`, `Target`

원격 DB 확인:

- `UserEvent` 총 3,023건
- `Stage=selection`, `Result=timeout`: 2,206건
- `Stage=result`, `Result=failure`: 13건
- `Stage=selection`, `Result=selected`: 3건
- `Stage=result`, `Result=SUCCESS`: 1건

## 분류 기준

| 리포트 원인 | raw 조건 | 의미 |
| --- | --- | --- |
| 입력 없음 | `Stage=selection`, `Result=timeout` | 고객이 제한 시간 내 DTMF를 입력하지 않음 |
| 잘못된 입력 | `Stage=selection`, `Result=invalid` | 고객 DTMF가 설정된 action과 매칭되지 않음 |
| 실패 종료 | `Stage=result`, `Result=failure` | 재시도 초과 또는 실패 prompt 후 종료 |
| 문자 발송 실패 | `Stage=result`, `Action=SEND_SMS`, `Result`가 실패 값 | Smart ARS SMS webhook 실패 또는 미설정 |
| 수신거부 실패 | `Stage=result`, `Action=OPT_OUT`, `Result`가 실패 값 | 수신거부 등록 hook 실패 |

## 1차 API 구현 범위

- 경로: `GET /admin/reports/ivr-failures`
- 권한: `reports/logs` 또는 신규 `reports/ivr-failures` 중 선택 필요. 1차 구현은 기존 리포트 권한 체계와 맞춰 `reports/logs:view`가 안전하다.
- 필터: `from`, `to`, `branchId`, `entryDid`, `reason`
- 기본 범위: 최근 7일, 최대 500건
- 응답 필드:
  - `eventId`, `eventTime`, `linkedid`
  - `caller`, `entryDid`, `branchId`
  - `stage`, `action`, `digit`, `result`, `target`
  - `failureReason`
  - 연결된 `callId`, `sessionStatus`, `queueName`, `primaryAgentName`

## 구현/배포 검증

- 로컬 서버 테스트: `npm test -- --runTestsByPath test/admin-permissions.integration.spec.ts test/calls-service.integration.spec.ts test/announcements.controller.spec.ts test/auth-softphone-config.integration.spec.ts`
  - 결과: 4 suites, 34 tests PASS
- 로컬 서버 빌드: `npm run build`
  - 결과: PASS
- 원격 배포: `docker compose -f docker-compose.dev.yml up -d --build server`
  - 결과: `kaster-server` 재빌드 및 기동 완료
- 원격 API 확인: `GET /api/v1/admin/reports/ivr-failures?reason=INPUT_TIMEOUT&pageSize=3&from=2026-04-01T00:00:00.000Z&to=2026-05-05T23:59:59.999Z`
  - 결과: `success: true`, `total: 787`, `rows[0].failureReason: INPUT_TIMEOUT`, `callId/sessionStatus` 포함
- 원격 권한 확인: `GET /api/v1/admin/settings/permissions/current`
  - 결과: `reports/ivr-failures.canView: true`, `canExport: true`
- 원격 화면 확인: `GET http://49.247.46.86:5174/reports/ivr-failures`
  - 결과: HTTP 200, React root 포함
- PBX 설정 충돌 확인: `kaster-server` mount 목록 `[]`, owner `rehearsal-20260501`

## 남은 결정

- 관리자 화면 `/reports/ivr-failures`는 연결됐다.
- 메뉴 권한은 별도 `reports/ivr-failures`로 분리했다.
- Smart ARS가 아닌 일반 IVR 메뉴의 timeout/invalid는 현재 `UserEvent`가 없다. 일반 IVR까지 리포트 범위에 포함하려면 dialplan renderer에 `UserEvent` 기록을 추가해야 한다.
