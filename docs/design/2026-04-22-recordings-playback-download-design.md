# 녹취 목록 재생/다운로드 설계

작성일: 2026-04-22  
범위: 관리자 녹취 목록에서 녹취 즉시 재생, 인증된 파일 다운로드, 서버 파일 접근 API 추가  
비범위: 외부 스토리지 서명 URL, 파형 시각화, 재생 위치 저장, 일괄 다운로드

## 1. 목표

현재 관리자 앱의 [`녹취 목록`](D:/Work/AI_Projects/KAster_CTI/apps/admin/src/features/reports/RecordingsPage.tsx) 은 메타데이터 조회와 CSV 내보내기만 지원한다.  
운영자는 목록에서 녹취 존재 여부를 확인할 수 있지만, 실제 파일을 바로 듣거나 개별 파일을 내려받을 수 없다.

이번 변경의 목표는 다음 두 가지다.

- 조회 권한이 있는 사용자가 녹취 목록에서 즉시 재생할 수 있다.
- `canExport` 권한이 있는 사용자만 개별 녹취 파일을 다운로드할 수 있다.

핵심 제약은 프런트가 실제 파일 경로나 저장소 URL을 직접 알지 못하게 하는 것이다.  
파일 접근은 모두 백엔드의 인증된 엔드포인트를 통해서만 수행한다.

## 2. 브레인스토밍 결정사항

| 항목 | 결정 |
|---|---|
| 재생 UX | **녹취 목록 테이블에서 여는 인라인/모달 플레이어** |
| 다운로드 권한 | **CSV 내보내기와 동일하게 `canExport` 사용자만 가능** |
| 재생 권한 | **조회 권한이 있으면 가능** |
| 파일 접근 방식 | **백엔드가 인증된 재생/다운로드 API 제공** |

## 3. 현재 구조와 제약

- 서버 DB에는 [`callRecordings.filePath`](D:/Work/AI_Projects/KAster_CTI/apps/server/prisma/schema.prisma:295), `fileName`, `fileFormat`, `storageProvider` 가 이미 존재한다.
- 현재 목록 API [`GET /calls/recordings/list`](D:/Work/AI_Projects/KAster_CTI/apps/server/src/modules/calls/calls.controller.ts:56) 는 재생/다운로드용 URL을 내려주지 않는다.
- 관리자 앱의 녹취 목록은 `reports/recordings` 조회 권한을 기준으로 접근 제어를 받는다.
- 현재 저장 기본값은 `storageProvider = local` 이므로 1차 구현은 로컬 파일 스트리밍을 기준으로 설계한다.

즉, 필요한 것은 새 데이터 모델이 아니라 파일 접근 계층과 관리자 액션 UI다.

## 4. API 설계

목록 API는 유지하고, 녹취 파일 접근을 위한 단건 API 2개를 추가한다.

### 4.1 재생 스트림

- `GET /calls/recordings/:recordingId/stream`
- 인증: JWT 필수
- 권한: `reports/recordings:view`
- 목적: 브라우저 `audio` 플레이어에서 직접 재생 가능한 스트리밍 응답 제공

동작:

1. `tenantId + recordingId` 로 녹취 메타를 조회한다.
2. 녹취가 존재하지 않으면 `404` 를 반환한다.
3. `storageProvider !== 'local'` 이면 `400` 또는 `501` 성격의 명확한 예외를 반환한다.
4. `filePath` 의 실제 파일 존재 여부를 검사한다.
5. `Range` 요청 헤더가 있으면 부분 응답(`206`)을 반환하고, 없으면 전체 스트림(`200`)을 반환한다.

필수 응답 헤더:

- `Content-Type`: 파일 포맷 기반 (`audio/wav`, `audio/mpeg` 등)
- `Accept-Ranges: bytes`
- `Content-Length`
- `Content-Range` (부분 응답 시)
- `Cache-Control: private, no-store`

### 4.2 다운로드

- `GET /calls/recordings/:recordingId/download`
- 인증: JWT 필수
- 권한: `reports/recordings:export` 와 동등한 서버 측 검사
- 목적: 개별 녹취 파일을 브라우저 저장 대상으로 제공

동작:

1. 재생 API와 동일하게 `tenantId + recordingId` 로 메타와 파일을 검증한다.
2. 검증 통과 시 `attachment` 응답으로 파일을 내려준다.

필수 응답 헤더:

- `Content-Type`
- `Content-Length`
- `Content-Disposition: attachment; filename="<원본파일명>"`
- `Cache-Control: private, no-store`

### 4.3 파일 메타 조회 책임

[`CallsService`](D:/Work/AI_Projects/KAster_CTI/apps/server/src/modules/calls/calls.service.ts) 는 녹취 메타 조회와 tenant 범위 검증을 담당하고, 실제 스트림/다운로드 응답 헤더 구성은 컨트롤러가 맡는다.

이 분리를 택하는 이유:

- 서비스는 DB/도메인 검증에 집중한다.
- 컨트롤러는 Express/Nest 응답 객체를 이용한 파일 전송에 집중한다.
- 나중에 `storageProvider` 가 `s3` 등으로 늘어나도 서비스 메서드 하나를 확장하면 된다.

## 5. 권한 규칙

권한은 UI 노출과 서버 강제를 모두 맞춘다.

### 5.1 재생

- UI 노출: `reports/recordings` 조회 권한 사용자
- 서버 검사: `view`

즉, 녹취 목록을 볼 수 있는 사용자는 재생도 가능하다.

### 5.2 다운로드

- UI 노출: `reportPermission?.canExport === true`
- 서버 검사: `export`

즉, 다운로드 버튼을 숨기는 것만으로 끝내지 않고 서버도 동일 기준으로 차단한다.

## 6. 관리자 화면 설계

대상 파일은 [`RecordingsPage`](D:/Work/AI_Projects/KAster_CTI/apps/admin/src/features/reports/RecordingsPage.tsx) 다.

### 6.1 테이블 액션 컬럼

기존 컬럼 끝에 `액션` 컬럼을 추가한다.

- `재생` 버튼: 조회 권한 사용자에게 노출
- `다운로드` 버튼: `canExport` 사용자에게만 노출

버튼은 텍스트 버튼 또는 아이콘+텍스트 버튼으로 두되, 목록 정보 밀도를 해치지 않게 폭을 제한한다.

### 6.2 재생 모달

재생은 행 내부 확장 패널이 아니라 페이지 공용 모달 하나를 재사용한다.

모달 구성:

- 제목: `녹취 재생`
- 보조 정보: 파일명, 발신번호, 상담원, 시작 시각
- 본문: HTML `<audio controls>` 플레이어
- 플레이어 소스: `/calls/recordings/:recordingId/stream`

상태 규칙:

- 모달을 열 때 선택한 녹취의 메타를 상태에 저장한다.
- 모달을 닫을 때 선택 상태를 비우고 재생을 중단한다.
- 동시에 하나의 녹취만 재생한다.

### 6.3 다운로드 동작

다운로드 버튼 클릭 시 `/calls/recordings/:recordingId/download` 를 바이너리로 받아 파일 저장을 트리거한다.

처리 규칙:

- 서버 응답 파일명을 우선 사용한다.
- 프런트는 파일명 추론 실패 시 목록의 `fileName` 을 fallback 으로 사용한다.
- 다운로드 중에는 해당 행 버튼에 로딩 상태를 준다.

## 7. 오류 처리

### 7.1 서버

- 녹취 없음: `404 Not Found`
- 권한 없음: `403 Forbidden`
- 파일 없음 또는 경로 손상: `404 Not Found`
- 미지원 저장소: `400 Bad Request` 또는 `501 Not Implemented` 성격의 예외

오류 메시지는 운영자가 원인을 구분할 수 있을 정도로 명확하게 유지한다.

예:

- `녹취 파일을 찾을 수 없습니다.`
- `현재 저장소 유형은 스트리밍을 지원하지 않습니다.`

### 7.2 관리자 앱

- 재생 실패: 모달 안에 오류 상태 메시지 표시, 플레이어 숨김
- 다운로드 실패: `message.error` 또는 현재 앱 패턴의 알림으로 실패 표시
- 권한 없는 다운로드 버튼은 아예 렌더하지 않음

## 8. 보안 및 경로 검증

파일 접근 API는 다음 원칙을 따른다.

- 클라이언트는 `recordingId` 만 전달하고 실제 `filePath` 는 절대 받지 않는다.
- 파일 조회는 반드시 `tenantId + recordingId` 조합으로 제한한다.
- 파일 응답 전 `filePath` 가 실제 파일인지 확인한다.
- 응답은 인증된 요청에만 제공하고, 공용 정적 URL을 만들지 않는다.

1차 구현은 DB에 저장된 `filePath` 를 직접 읽되, 운영자가 등록한 로컬 녹취 저장 경로를 신뢰하는 현재 구조를 유지한다.  
추후 외부 저장소를 붙일 때도 프런트 계약은 변경하지 않는다.

## 9. 테스트 전략

### 9.1 서버

기존 [`calls-service.integration.spec.ts`](D:/Work/AI_Projects/KAster_CTI/apps/server/test/calls-service.integration.spec.ts) 패턴을 유지한다.

추가할 핵심 검증:

- `tenantId + recordingId` 로 녹취 메타를 정확히 조회하는지
- 다른 tenant 녹취는 조회되지 않는지
- `storageProvider` 가 `local` 이 아닐 때 적절히 차단하는지
- 다운로드/재생 엔드포인트가 권한 검사 후 서비스 메서드를 호출하는지

스트리밍 자체의 바이트 단위 동작은 무거운 E2E 대신 컨트롤러 단의 계약 검증으로 제한한다.

### 9.2 관리자 앱

이번 단계에서는 새 테스트 러너를 도입하지 않는다.  
수동 검증 체크리스트로 마감한다.

수동 검증:

1. 조회 권한 사용자로 재생 버튼이 보이고 모달에서 재생이 시작되는지
2. `canExport` 없는 사용자에게 다운로드 버튼이 보이지 않는지
3. `canExport` 사용자에게 다운로드 버튼이 보이고 파일 저장이 시작되는지
4. 존재하지 않는 파일 또는 권한 오류 시 적절한 오류 메시지가 나오는지
5. CSV 내보내기 기존 동작이 회귀하지 않는지

## 10. 구현 순서

1. 서버: 녹취 메타 조회 메서드 추가
2. 서버: `stream`, `download` 엔드포인트 추가
3. 서버: 권한 검사 및 로컬 파일 응답 처리 추가
4. 테스트: 서버 단위/통합 테스트 보강
5. 관리자 앱: 액션 컬럼 추가
6. 관리자 앱: 재생 모달 및 다운로드 핸들러 추가
7. 수동 검증: 권한별 재생/다운로드 시나리오 확인

## 11. 비범위 및 후속 후보

이번 변경에서 제외:

- 녹취 파형 UI
- 재생 속도 제어 커스텀 UI
- 최근 재생 이력 저장
- 다중 선택 다운로드
- 외부 스토리지 서명 URL

후속 확장이 필요하면 `storageProvider` 별 어댑터 계층을 만들고, 현재 `stream/download` API 계약을 유지한 채 내부 구현만 교체하는 방향이 적절하다.
