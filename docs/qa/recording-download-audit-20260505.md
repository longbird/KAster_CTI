# 녹취 다운로드 감사 검증

일시: 2026-05-05

대상: 기본 개발 서버 `blueadm@49.247.46.86:/home/blueadm/kaster_cti`

## 변경 기준

- 녹취 재생 권한은 `reports/recordings:view`를 유지한다.
- 녹취 다운로드 권한은 `reports/recordings:export`를 유지한다.
- 다운로드 감사 로그는 실제 파일 확인이 끝난 성공 다운로드에만 남긴다.
- 감사 항목은 tenant, recordingId, callId, linkedid, agentId, 역할, client IP, user-agent, action, success, createdAt이다.
- 감사 조회 API와 화면은 기존 `reports/recordings:view` 권한 아래에 둔다.
- 감사 조회 응답은 고객번호, DID, client IP를 마스킹해 반환한다.

## 운영 정책

- 녹취 파일 재생과 다운로드 권한은 분리한다. 재생은 조회 권한, 다운로드는 export 권한으로 판단한다.
- 다운로드 감사 로그는 원본 client IP와 user-agent를 서버 DB에 저장하되, 관리자 화면과 조회 API에는 마스킹된 IP만 노출한다.
- 감사 조회 화면에는 고객번호와 DID를 원문으로 표시하지 않는다. `010-****-2222`, `070-****-6380` 형식의 마스킹 값만 표시한다.
- 다운로드 감사 로그는 운영 추적용으로 1년 온라인 보관을 기본값으로 둔다. 그 이후 보관/삭제 자동화는 운영 정책 확정 후 별도 배치로 구현한다.
- 감사 로그 CSV export는 기존 녹취 export 권한이 있는 사용자에게만 노출한다.

## 로컬 검증

- `cd apps/server && npx prisma generate`
- `cd apps/server && npm test -- --runTestsByPath test/calls-service.integration.spec.ts`
- `cd apps/server && npm run build`
- `cd apps/server && npm test -- --runTestsByPath test/calls-service.integration.spec.ts test/admin-permissions.integration.spec.ts test/announcements.controller.spec.ts test/auth-softphone-config.integration.spec.ts`

결과: 4개 suite, 35개 test 통과.

## 원격 배포 검증

- `docker compose -f docker-compose.dev.yml build server`: 통과
- `docker compose -f docker-compose.dev.yml run --rm server npx prisma migrate deploy`: `20260505_call_recording_access_audit_logs` 적용
- `docker compose -f docker-compose.dev.yml up -d server`: 서버 재기동

원격 상태:

- `GET http://127.0.0.1:3000/api/v1/health`: `db=up`, `redis=up`, `ami=connected`
- `docker inspect kaster-server --format '{{json .Mounts}}'`: `[]`
- `callRecordingAccessAuditLogs` 테이블과 3개 조회 인덱스 생성 확인

## 실제 API 검증

검증용 녹취 row와 컨테이너 임시 파일을 만들고 supervisor 계정으로 API를 호출했다.

- `GET /api/v1/calls/recordings/list`: 검증 녹취 row 조회 성공, `fileSizeBytes`는 문자열 `"16"`으로 반환
- `GET /api/v1/calls/recordings/{recordingId}/download`: 16 byte 다운로드 성공
- DB 감사 확인:

```text
recordingId=00000000-0000-0000-0000-00000000a502
agentId=00000000-0000-0000-0000-000000000202
userRole=supervisor
action=DOWNLOAD
success=true
has_client_ip=true
createdAt=2026-05-05 02:31:24.931+00
```

검증 후 녹취 row, callSession row, 컨테이너 임시 파일은 삭제했다. 감사 row 1건은 다운로드 감사 증거로 유지했다.

## 감사 조회 API/화면 검증

- `GET /api/v1/admin/reports/recording-download-audits` API를 추가했다.
- 관리자 `녹취 목록` 화면에 `다운로드 감사` 탭을 추가했다.
- 기본 개발 서버에서 server/admin 컨테이너를 재빌드 배포했다.
- `GET http://127.0.0.1:3000/api/v1/health`: `db=up`, `redis=up`, `ami=connected`
- `docker inspect kaster-server --format '{{json .Mounts}}'`: `[]`
- `GET http://49.247.46.86:5174/reports/recordings`: HTTP 200
- supervisor 로그인 후 감사 조회 API 호출 결과:

```text
auditLogId=f0c6cf5e-454c-451e-b3a6-c96a119cf913
callerMasked=010-****-2222
dnisMasked=070-****-6380
clientIpMasked=masked
agentName=관리자
linkedid=codex-audit-250505
```

마스킹 검증을 위해 임시 callSession row를 재생성했고, 조회 후 다시 삭제했다.

## 추가 확인된 문제와 조치

실제 녹취 row가 생기자 목록 API에서 `Do not know how to serialize a BigInt`가 재현됐다.

원인: Prisma `BigInt` 필드인 `fileSizeBytes`가 그대로 응답 객체에 포함됐다.

조치: `listRecordings` 응답에서 `fileSizeBytes`를 문자열로 변환했다. 관리자 화면 타입도 `string | null` 기준이다.
