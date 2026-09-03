# 설치 시나리오 준비사항 체크리스트

작성일: 2026-08-10
대상: KAster_CTI 운영 설치, 사이트별 배포 준비, PBX 연동 준비
관련 기준:

- `deploy/sites/_template/.env.example`
- `deploy/sites/_template/compose.prod.yml`
- `docs/operations/production-deployment-standard.md`
- `docs/operations/db-migration-runbook.md`
- `docs/operations/pbx-config-apply-runbook.md`
- `docs/operations/p3-release-preflight-20260506.md`

## 1. 목적

이 문서는 KAster_CTI를 신규 고객사 또는 신규 사이트에 설치하기 전에 준비해야 할 값을 목록화한다.

설치 작업 자체의 실행 순서는 배포 runbook을 따른다. 이 문서는 설치 전에 고객사, 인프라 담당자, PBX 담당자, 앱 담당자가 확정해야 하는 입력값과 중단 조건을 정리한다.

## 2. 설치 전 필수 결정사항

| 구분 | 결정해야 할 사항 | 비고 |
| --- | --- | --- |
| 설치 범위 | 운영, 검증, 교육 환경 중 어느 환경인지 | 운영과 검증은 가능하면 분리 |
| 구성 방식 | 단일 서버, 앱/DB/PBX 분리, 이중화 구성 | 동시통화 수와 장애 대응 수준에 따라 결정 |
| 사이트 코드 | `SITE_CODE` | 컨테이너명, 이미지명, 볼륨명에 사용 |
| 도메인 | 상담원, 관리자, API/WS 도메인 | 프론트 build 값과 CORS 값에 직접 영향 |
| PBX 연동 | AMI 접속 정보, DID, 큐, 내선, 발신 context | 설치 전 PBX 담당자 확인 필요 |
| DB 운영 | 신규 DB인지 기존 DB 이관인지 | 기존 DB면 migration 전 백업 필수 |
| 녹취 저장 | 저장 경로, 보관 기간, 암호화 여부 | 디스크/NAS/백업 정책과 연결 |
| 외부 연동 | CID TCP, 외부 상담 솔루션, CRM, Socket.IO 사용 여부 | 방화벽과 인증 방식 확정 필요 |
| 롤백 기준 | 실패 시 중단/복구 담당자와 복구 방식 | 설치 전 승인 필요 |

## 3. 사이트 기본 정보

| 항목 | 준비값 | 예시 |
| --- | --- | --- |
| 고객사명 |  |  |
| 사이트/지점명 |  |  |
| `SITE_CODE` |  | `prod-main`, `customer-a` |
| 설치 환경 |  | 운영 / 검증 / 교육 |
| 설치 예정일 |  |  |
| 운영 담당자 |  | 이름, 연락처 |
| PBX 담당자 |  | 이름, 연락처 |
| 네트워크 담당자 |  | 이름, 연락처 |
| 앱 담당자 |  | 이름, 연락처 |

## 4. 서버와 인프라 준비

### 4.1 서버

| 항목 | 준비값 | 확인 |
| --- | --- | --- |
| 운영 서버 IP |  | [ ] |
| 접속 계정 |  | [ ] |
| sudo 권한 |  | [ ] |
| Docker 설치 |  | [ ] |
| Docker Compose 설치 |  | [ ] |
| 시간 동기화 |  | [ ] |
| 로그 보관 경로 |  | [ ] |
| 백업 저장 경로 |  | [ ] |

### 4.2 권장 구성

소규모 단일 사이트는 앱, PostgreSQL, Redis를 같은 compose에서 시작할 수 있다. 운영 안정성을 우선하면 PBX, 앱, DB, Redis를 논리적으로 분리한다.

| 규모 | 권장 구성 |
| --- | --- |
| 소규모 단일 사이트 | PBX 1대, CTI app 1대, PostgreSQL 1대, Redis 1대, Nginx 1대 |
| 권장 운영 | PBX 2대, CTI app 2대 이상, PostgreSQL primary/replica, Redis Sentinel 또는 3노드, LB/Nginx 이중화 |

## 5. 도메인, 포트, 방화벽

### 5.1 도메인

| 항목 | 환경변수 | 준비값 |
| --- | --- | --- |
| 상담원 앱 도메인 | `SITE_DOMAIN` |  |
| 관리자 앱 도메인 | `ADMIN_DOMAIN` |  |
| API/WS 도메인 | `API_DOMAIN` |  |
| HTTP 포트 | `HTTP_PORT` |  |
| TLS 종료 위치 |  | LB / Nginx / Ingress / 기타 |

### 5.2 방화벽

| 방향 | 포트/대상 | 용도 | 확인 |
| --- | --- | --- | --- |
| 사용자 -> Gateway | 80/443 | 상담원/관리자/API 접근 | [ ] |
| CTI app -> PBX | 5038 또는 현장 AMI 포트 | PBX AMI 제어/이벤트 | [ ] |
| CTI app -> PostgreSQL | 5432 또는 현장 포트 | DB 연결 | [ ] |
| CTI app -> Redis | 6379 또는 현장 포트 | 리더 선출, dedupe, Pub/Sub | [ ] |
| 외부 상담 솔루션 -> API | 443 | 외부 CTI API | [ ] |
| 타사 CID 프로그램 -> CTI app | 28002/28003/28004 기본 | 로지/아이콘/콜마너 Call Report | [ ] |

## 6. 사이트별 환경변수

운영 site 디렉터리는 `deploy/sites/_template`을 복제해서 만든다.

```text
deploy/sites/<site-code>/
  .env
  compose.prod.yml
  nginx/default.conf.template
```

`.env`에는 운영 secret이 들어가므로 Git에 커밋하지 않는다.

### 6.1 기본값

| 환경변수 | 준비값 | 중단 조건 |
| --- | --- | --- |
| `SITE_CODE` |  | 비어 있음 |
| `SITE_DOMAIN` |  | 운영 도메인과 불일치 |
| `ADMIN_DOMAIN` |  | 운영 도메인과 불일치 |
| `API_DOMAIN` |  | 운영 도메인과 불일치 |
| `HTTP_PORT` |  | 포트 충돌 |

### 6.2 DB/Redis

| 환경변수 | 준비값 | 중단 조건 |
| --- | --- | --- |
| `POSTGRES_DB` |  | 비어 있음 |
| `POSTGRES_USER` |  | 비어 있음 |
| `POSTGRES_PASSWORD` |  | 기본값 또는 약한 비밀번호 |
| `REDIS_HOST` | compose 내부면 `redis` | 접속 불가 |
| `REDIS_PORT` | 기본 `6379` | 접속 불가 |

### 6.3 인증/보안

| 환경변수 | 준비값 | 중단 조건 |
| --- | --- | --- |
| `JWT_SECRET` |  | 기본값 `change_me` 사용 |
| `KASTER_INTERNAL_SECRET` |  | 기본값 사용 |
| `REST_CORS_ORIGIN` |  | 운영 상담원/관리자 URL 누락 |
| `WS_CORS_ORIGIN` |  | 운영 상담원/관리자 URL 누락 |

### 6.4 프론트 빌드

| 환경변수 | 준비값 | 중단 조건 |
| --- | --- | --- |
| `VITE_API_BASE_URL` |  | API 도메인과 불일치 |
| `VITE_WS_URL` |  | WS 도메인과 불일치 |
| `VITE_USE_MOCK` | `false` | 운영에서 `true` |
| `VITE_ACCESS_TOKEN_KEY` | 기본 `kaster.access_token` | 앱 간 토큰 정책 미확정 |

프론트는 현재 build-time env 방식이다. 사이트 도메인이 바뀌면 상담원 앱과 관리자 앱 이미지를 다시 빌드해야 한다.

## 7. PBX 연동 준비

### 7.1 AMI 접속

| 항목 | 환경변수 | 준비값 | 확인 |
| --- | --- | --- | --- |
| PBX AMI host | `AMI_HOST` |  | [ ] |
| PBX AMI port | `AMI_PORT` | 기본 `5038` | [ ] |
| AMI 계정 | `AMI_USERNAME` |  | [ ] |
| AMI 비밀번호 | `AMI_SECRET` |  | [ ] |
| 재연결 주기 | `AMI_RECONNECT_MS` | 기본 `5000` | [ ] |
| PBX 노드 ID | `ASTERISK_NODE_ID` | 사이트/노드별 고유값 | [ ] |

### 7.2 통화 제어

| 항목 | 환경변수 | 준비값 | 확인 |
| --- | --- | --- | --- |
| 발신 context | `ASTERISK_OUTBOUND_CONTEXT` | 기본 `outbound-main` | [ ] |
| 참석 전환 완료 코드 | `ASTERISK_ATXFER_COMPLETE_CODE` | 기본 `*2` | [ ] |
| 보류 기능 코드 | `ASTERISK_HOLD_FEATURE_CODE` | 미사용 시 공백 | [ ] |
| 보류 해제 기능 코드 | `ASTERISK_RESUME_FEATURE_CODE` | 미사용 시 공백 | [ ] |

### 7.3 PBX 설정 반영

| 항목 | 준비값 | 중단 조건 |
| --- | --- | --- |
| PBX 설정 경로 | 기본 `/etc/asterisk` | 경로 접근 불가 |
| owner marker | `/etc/asterisk/.kaster-cti-config-owner` | 다른 site code가 기록됨 |
| dry-run 권한 | 관리자 앱 또는 API 토큰 | dry-run 실행 불가 |
| reload 권한 | 관리자 앱 또는 API 토큰 | reload 실행 불가 |
| 설정 백업 경로 |  | 백업 불가 |

PBX 설정 변경은 반드시 preview, diff, dry-run, reload, smoke test 순서로 진행한다.

## 8. 통화 시나리오 입력값

설치 전 최소 1개 이상의 대표 통화 흐름을 확정한다.

| 항목 | 준비값 | 비고 |
| --- | --- | --- |
| 테스트 발신자 번호 |  | 외부 인입 테스트용 |
| 대표 DID |  | 인입 라우팅 확인 |
| 테스트 큐 |  | 대기/분배 확인 |
| 테스트 상담원 내선 |  | SIP 등록 필요 |
| 테스트 supervisor 계정 |  | 관리자 확인 |
| 외부 발신 테스트 번호 |  | 발신 통제 필요 |
| 전환 대상 내선 |  | blind/attended transfer 확인 |
| 녹취 확인 통화 |  | 녹취 생성/조회/다운로드 확인 |

## 9. DB와 초기 데이터

### 9.1 DB 상태

| 항목 | 준비값 | 확인 |
| --- | --- | --- |
| 신규 DB 여부 | 신규 / 기존 | [ ] |
| 기존 데이터 이관 여부 | 있음 / 없음 | [ ] |
| 운영 백업 경로 |  | [ ] |
| 백업 보관 기간 |  | [ ] |
| migration baseline 확인 |  | [ ] |

운영 DB에는 `prisma migrate deploy`만 사용한다. `prisma db push`는 운영 설치 절차에 포함하지 않는다.

### 9.2 초기 데이터

| 데이터 | 준비값 | 확인 |
| --- | --- | --- |
| tenant |  | [ ] |
| branch/site |  | [ ] |
| 관리자 계정 |  | [ ] |
| supervisor 계정 |  | [ ] |
| 상담원 계정/내선 |  | [ ] |
| 큐 |  | [ ] |
| 큐 멤버 |  | [ ] |
| DID 라우팅 |  | [ ] |
| 고객/전화번호 이관 | 필요 / 불필요 | [ ] |

운영 설치에서는 demo seed를 기본 비활성화한다. 교육/검증 환경에서만 별도로 승인 후 사용한다.

## 10. 녹취와 파일 저장소

| 항목 | 환경변수 | 준비값 | 확인 |
| --- | --- | --- | --- |
| 녹취 원본 경로 | `RECORDING_STORAGE_ROOT` |  | [ ] |
| 암호화 사용 | `RECORDING_ENCRYPTION_ENABLED` | `true` / `false` | [ ] |
| 암호화 키 | `RECORDING_ENCRYPTION_KEY` | 사용 시 필요 | [ ] |
| 암호화 파일 경로 | `RECORDING_ENCRYPTED_STORAGE_ROOT` |  | [ ] |
| 저장 기간 |  |  | [ ] |
| 다운로드 권한 정책 |  |  | [ ] |
| 다운로드 감사 로그 보관 |  |  | [ ] |

녹취 파일은 운영 데이터다. 설치 전 디스크 용량, 백업, 접근 권한, 보관 기간을 확정한다.

## 11. 장애 대응 저장소

| 항목 | 환경변수 | 준비값 | 확인 |
| --- | --- | --- | --- |
| 로컬 spool 디렉터리 | `RESILIENCE_LOCAL_SPOOL_DIR` |  | [ ] |
| LKG 스냅샷 디렉터리 | `RESILIENCE_LKG_DIR` |  | [ ] |
| 백업 상태 파일 | `RESILIENCE_BACKUP_STATUS_FILE` |  | [ ] |

컨테이너 배포에서는 spool과 LKG 디렉터리를 영속 볼륨으로 마운트해야 한다.

## 12. 외부 연동 준비

| 연동 | 준비값 | 확인 |
| --- | --- | --- |
| 외부 CTI API 사용 여부 |  | [ ] |
| Socket.IO `/ws` 사용 클라이언트 |  | [ ] |
| API 인증 방식 | JWT / 내부 토큰 / 기타 | [ ] |
| 허용 IP |  | [ ] |
| idempotency key 사용 여부 |  | [ ] |
| CID TCP 로지 포트 | 기본 `28002` | [ ] |
| CID TCP 아이콘 포트 | 기본 `28003` | [ ] |
| CID TCP 콜마너 포트 | 기본 `28004` | [ ] |
| Smart ARS SMS webhook | 사용 시 URL/secret | [ ] |

통화 제어 API의 `accepted: true`는 PBX 명령 접수 의미다. 최종 성공 여부는 `call.created`, `call.updated`, `call.ended` 이벤트 또는 조회 API로 확인한다.

## 13. 설치 전 빌드/배포 준비

| 항목 | 기준 | 확인 |
| --- | --- | --- |
| 서버 빌드 | `apps/server` build | [ ] |
| 상담원 앱 빌드 | `apps/web` build | [ ] |
| 관리자 앱 빌드 | `apps/admin` build | [ ] |
| compose config 검증 | `deploy/sites/<site>/compose.prod.yml` | [ ] |
| 운영 `.env` 검토 | 기본값/누락 없음 | [ ] |
| DB 백업 | 기존 DB면 필수 | [ ] |
| migration status | baseline 불일치 없음 | [ ] |
| PBX owner marker | site code 일치 | [ ] |

## 14. 설치 후 smoke 기준

설치 완료 판정은 아래 항목이 모두 통과해야 한다.

| 순서 | 항목 | 통과 기준 |
| --- | --- | --- |
| 1 | API health | `success: true`, DB/Redis/PBX 연결 정상 |
| 2 | 상담원 앱 접속 | 운영 도메인에서 HTML 응답 |
| 3 | 관리자 앱 접속 | 운영 도메인에서 HTML 응답 |
| 4 | 로그인 | supervisor/admin 로그인 성공 |
| 5 | 상담원 목록 | API envelope 정상 응답 |
| 6 | 큐 목록 | API envelope 정상 응답 |
| 7 | PBX dry-run | 검증 통과 |
| 8 | 대표 DID 인입 | 예상 IVR 또는 큐로 연결 |
| 9 | 큐 연결 | 대기, 상담원 연결, 종료 이벤트 확인 |
| 10 | 통화 제어 | 발신/전환/끊기 명령 접수와 후속 이벤트 확인 |
| 11 | 녹취 | 생성, 조회, 다운로드 확인 |
| 12 | 최종 health | 설치 후에도 정상 |

## 15. 중단 조건

아래 항목 중 하나라도 해당하면 설치를 진행하지 않는다.

- 운영 `.env`에 기본 secret이 남아 있다.
- 운영 도메인과 `VITE_API_BASE_URL`, `VITE_WS_URL`, CORS 값이 불일치한다.
- 운영 서버에서 PBX AMI host/port에 접속할 수 없다.
- PBX 설정 owner marker가 다른 site code를 가리킨다.
- 기존 운영 DB인데 백업이 없다.
- migration baseline이 현재 코드와 맞지 않는다.
- compose config가 실패한다.
- HTTP/HTTPS 포트가 기존 서비스와 충돌한다.
- PBX dry-run이 실패한다.
- 테스트 DID, 큐, 상담원 내선이 준비되지 않았다.
- 롤백 담당자와 복구 기준이 확정되지 않았다.

## 16. 설치 회의용 최소 수령표

| 구분 | 받아야 할 값 |
| --- | --- |
| 사이트 | 사이트 코드, 도메인 3개, 설치 환경, 담당자 |
| 서버 | IP, 접속 계정, sudo, Docker/Compose 가능 여부 |
| PBX | IP, AMI 계정, AMI secret, 설정 경로 |
| 통화 | DID, 큐, 상담원 내선, 발신 context, 전환 대상 |
| DB | DB명, 계정, 비밀번호, 기존 DB 여부, 백업 경로 |
| 보안 | JWT secret, 내부 secret, 허용 origin/IP |
| 저장소 | 녹취 경로, 보관 기간, 암호화 여부 |
| 외부 연동 | 외부 CTI API, Socket.IO, CID TCP, SMS webhook |
| 검증 | 테스트 번호, 테스트 상담원, 승인자 |
| 복구 | 롤백 담당자, DB 복구 기준, PBX 설정 복구 기준 |

## 17. 완료 증적

설치가 끝나면 아래 증적을 보관한다.

- 운영 `.env` 검토 결과
- compose config 검증 결과
- DB 백업 파일명과 크기
- migration 적용 결과
- PBX dry-run 결과
- PBX reload 시각
- health check 결과
- 로그인 확인 결과
- 대표 통화 smoke 결과
- 녹취 확인 결과
- 실패 또는 보류 항목 목록

검증 결과 문서는 `docs/qa/` 아래에 별도로 작성한다.
