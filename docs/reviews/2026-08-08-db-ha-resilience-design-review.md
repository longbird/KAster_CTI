# K-CTI DB 장애 대응 설계 검토 및 개선 계획

- 작성일: 2026-08-08
- 검토 대상: `K-CTI_DB_백업_복구_이중화_장애대응_설계서_v1.0.docx`
- 대상 저장소: `D:\Work\AI_Projects\KAster_CTI`

## 1. 검토 결론

첨부 설계서는 방향이 맞다. 단순 PostgreSQL 복제만으로 업무 연속성을 보장하지 않고, `동기 Standby + PITR + LKG 설정 + 영속 이벤트 버퍼 + 제한 운전 + 복구 후 상태 재구성`을 하나의 장애 대응 체계로 묶고 있다.

현재 KAster_CTI는 이미 PBX AMI 수신, 세션 정규화, Redis 리더 선출, DB outbox, Redis Pub/Sub 기반 WebSocket fan-out, 헬스/모니터링 화면을 갖고 있다. 다만 문서가 요구하는 핵심인 `DB 장애 중 저장 전 이벤트 보존`, `운영 모드 전환`, `검증된 마지막 정상 설정`, `복구 후 재처리 배치`, `Patroni/pgBackRest 운영 자동화`는 아직 구현 단위로 분리되어 있지 않다.

따라서 개선 방향은 전면 재개발이 아니라 현재 구조 위에 장애 대응 레이어를 추가하는 것이다. 기존 `rawAmiEvents`, `eventOutbox`, `HealthSummaryService`, `MonitoringPage`, `AmiConnectionService`, `SessionEngineService`를 유지하고, 그 앞뒤에 durable spool, operating mode, LKG, recovery coordinator를 붙인다.

## 2. 현재 코드 기준 적합성

| 영역 | 현재 상태 | 문서 요구와의 차이 | 판단 |
|---|---|---|---|
| PBX 이벤트 수신 | `AmiConnectionService`가 AMI 연결과 리더 전용 처리를 수행한다. | DB 저장 전에 이벤트를 durable store에 먼저 남기지 않는다. | P0 보강 |
| 원본 이벤트 보존 | `rawAmiEvents` 모델과 `(tenantId, eventFingerprint)` unique가 있다. | DB 접근 불가 시 raw insert 이전 이벤트 손실 가능성이 남는다. | P0 보강 |
| 이벤트 발행 | DB `eventOutbox`와 `OutboxPublisherService`가 있다. | 장애 중 업무 명령/메모/감사 로그의 오프라인 큐와 재처리 배치가 없다. | P0 보강 |
| Redis | 리더 락, dedupe, Pub/Sub에 사용한다. | Redis Streams AOF 기반 durable handoff가 없다. | P0 보강 |
| 제한 운전 | `/health`는 db/redis/ami 상태를 반환한다. | `NORMAL`, `DB_FAILOVER`, `DEGRADED`, `RECOVERING` 같은 운영 모드가 없다. | P0 보강 |
| 설정 지속성 | PBX 설정 렌더러와 관리자 설정 화면은 존재한다. | desired/applied 버전, LKG 원자 저장, 체크섬 검증, 긴급 변경 병합 프로세스가 없다. | P0 보강 |
| 관리자 화면 | 모니터링 페이지와 alert banner가 있다. | 전역 장애 배너, 읽기 전용 전환, freshness/queue depth 표시가 부족하다. | P1 보강 |
| 메트릭 | `prom-client` 기본 지표와 CTI 운영 지표가 있다. | DB role, 복제 지연, WAL/backup, LKG age, offline queue depth 지표가 없다. | P1 보강 |
| 백업/PITR | 설계 문서 수준이다. | pgBackRest, WAL archive, 복원 검증 자동화 파일이 없다. | P1 보강 |

### 2.1 착수 전 반드시 고쳐야 할 기존 코드 결함 2건

위 보강 항목과 별개로, **현재 코드에 있는 결함 때문에 위 설계를 그대로 얹으면 동작하지 않는다.**

| # | 위치 | 결함 | 영향 |
|---|---|---|---|
| A | `modules/redis/ami-leader-election.service.ts` `tick()` | try/catch 가 없어 Redis 장애 시 unhandled rejection 이 발생하고, `isLeaderNode` 가 직전 값으로 고착된다. 리더였던 노드는 락 만료 후에도 리더로 남고(복구 후 split-brain), 비리더는 영원히 비리더가 된다. | `ami-connection.service.ts:88` 이 이 값으로 게이트하므로 `DB+Redis 동시 장애` / `Middleware 재시작` 인수 테스트가 spool 로직에 닿기 전에 무너진다. |
| B | `modules/calls/session-engine.service.ts:226-239` | Redis dedupe 키를 DB insert **앞에서** `SET NX EX 21600`(6시간)으로 선점한다. DB 장애 중에는 키 선점만 성공하고 raw insert 는 실패해, 키가 6시간 남는다. | 복구 후 재처리 시 dedupe 에 걸려 **spool 에 보존한 이벤트가 전량 폐기된다.** 6시간 미만 장애에서는 Durable Event Spool 자체가 무의미해진다. |

두 건 모두 개발 계획서에 **Task 0A / Task 0B 선행 태스크**로 반영했다.
(`docs/plans/2026-08-08-db-ha-resilience-plan.md`)

### 2.2 설계상 정정한 사항

- `offline_spool_entries` 는 PostgreSQL 테이블이므로 **durable store 가 아니다.** 실제 내구 저장소는
  Redis Streams + 로컬 JSONL 이고, 이 테이블은 DB 가용 시에만 기록하는 감사·추적용 투영이다.
  DB 장애 중 이 테이블 insert 실패를 spool 실패로 취급하면 안 된다.
- spool append 는 리더 게이트 **앞**에서 수행하되, **아무 노드나 쓰지는 않는다.**
  리더이거나 리더십을 확인할 수 없을 때(Redis 장애)만 쓴다. Task 0A 이후 Redis 장애 구간에는 어떤
  노드도 리더가 아니므로 게이트 뒤에 두면 그 구간 이벤트가 전부 사라지지만, 반대로 모든 노드가 항상
  쓰면 공유 Redis Stream 이 오염된다 — 리더는 자기 append 의 stream ID 로 커서를 올리므로 비리더
  append 가 커서 뒤에 영구히 남아 offline depth 가 0 이 되지 않는다.
  Redis 장애 구간에는 Redis append 가 어차피 실패해 로컬 스풀로 떨어지므로 공유 스트림을 오염시키지
  않는다. 즉 "모두 쓰기" 가 필요한 유일한 구간에서만 모두 쓴다.
- `configVersions` 등의 `BigInt` 컬럼은 `ResponseTransformInterceptor` 의 JSON 직렬화에서 `TypeError` 를
  던진다. 이 레포는 이미 경계마다 명시 변환한다 (`calls.service.ts:1758` 의 `.toString()`,
  `agent-updates.service.ts:112` 의 `Number(...)`). 신규 컨트롤러도 같은 규칙을 따른다.

## 3. 개선 원칙

1. 본 시스템과 백업 시스템 중심의 단순 운영 구성을 유지한다.
2. 원격 DR은 P2로 두고, 1차 개발은 동일 센터 Primary/Standby와 장애 중 업무 지속성에 집중한다.
3. 모든 복구 가능한 이벤트와 명령에는 멱등 키를 둔다.
4. DB 장애 중 일반 설정 변경은 자동 큐잉하지 않고 차단한다.
5. 긴급 라우팅 변경은 승인, 감사, 수동 병합을 전제로 제한 허용한다.
6. 복구 후 상태는 과거 이벤트만으로 확정하지 않고 PBX 현재 채널/브리지/큐/상담원 상태를 우선한다.
7. 문서 요구 중 녹취 파일 자체의 NAS/S3 복제는 별도 저장소 설계로 분리하고, 이번 범위는 녹취 메타데이터와 참조값 복구까지로 제한한다.

## 4. P0 개선 계획

### 4.1 Operating Mode 도입

`NORMAL`, `DB_FAILOVER`, `DEGRADED`, `RECOVERING`을 서버의 1급 런타임 상태로 만든다. `/health`와 관리자 API 응답에 `operatingMode`, `dataFreshness`, `restrictions`를 포함한다.

완료 기준:

- DB 연결 실패가 모든 API의 단순 500으로만 노출되지 않는다.
- 설정 저장, 권한 변경, 일반 관리자 쓰기는 `DEGRADED`에서 명시적으로 차단된다.
- 기존 통화 제어, 보류, 전환, 종료는 정책상 허용된 경우 command id와 함께 처리된다.

### 4.2 Durable Event Spool

AMI/ARI 원본 이벤트는 DB insert 전에 Redis Streams 또는 로컬 append-only spool에 먼저 기록한다. Redis 장애 시에도 로컬 파일 spool을 사용하고, DB 복구 후 `eventFingerprint`와 `linkedid` 기준으로 멱등 재처리한다.

완료 기준:

- DB가 내려가도 AMI 이벤트 수신 프로세스가 이벤트를 버리지 않는다.
- DB+Redis 동시 장애 후 Middleware 재시작 시에도 로컬 spool이 남아 있다.
- 재처리 중복은 `rawAmiEvents` unique와 dedupe key로 방어된다.

### 4.3 LKG 설정 스냅샷

테넌트별 큐, 라우팅, 권한, 기능 플래그, PBX 적용 설정을 버전 스냅샷으로 관리한다. L1 메모리, L2 Redis, L3 로컬 LKG를 두고 로컬 파일은 체크섬과 원자적 rename으로 갱신한다.

완료 기준:

- DB/Redis 동시 장애 후 재시작해도 유효 LKG가 있으면 제한 운전으로 부팅한다.
- 유효 LKG가 없으면 readiness 실패로 트래픽 수신을 막는다.
- LKG에는 비밀번호와 API Secret 원문이 저장되지 않는다.

### 4.4 Recovery Coordinator

복구 후 새 Primary 상태, 설정 버전, LKG checksum, PBX 활성 채널/브리지/큐/상담원 상태를 비교하고 replay batch를 생성한다. 원본 이벤트, 메모, 상담 결과, 감사 로그 순서로 재처리한다.

완료 기준:

- 재처리 범위와 체크포인트가 `replay_batches`에 남는다.
- 중단 후 같은 batch를 이어서 실행할 수 있다.
- 긴급 설정 충돌은 자동 병합하지 않고 관리자 승인 대상으로 분리된다.

## 5. P1 개선 계획

### 5.1 백업 및 PITR 자동화

pgBackRest 기준으로 전체/차등/증분 백업과 WAL archive를 구성한다. 운영 DB와 다른 장애 도메인의 저장소를 사용하고, 월 1회 격리 복원 검증을 자동 기록한다.

완료 기준:

- 최근 백업 성공 시각과 WAL archive age가 `/health` 및 Prometheus 지표에 노출된다.
- PITR 복구 절차가 스크립트와 Runbook으로 재현 가능하다.
- 백업 손상 시 다른 세대로 복원하는 훈련 결과를 남긴다.

### 5.2 관리자 UI

기존 모니터링 페이지와 레이아웃을 확장한다. 전역 상단 배너에 운영 모드와 제한 기능을 표시하고, 설정 화면은 `DEGRADED`에서 저장 버튼을 비활성화한다.

완료 기준:

- `DB_FAILOVER`, `DEGRADED`, `RECOVERING`이 관리자 전체 화면에서 즉시 보인다.
- stale 데이터는 마지막 갱신 시각과 함께 표시된다.
- 오프라인 이벤트 큐, LKG 생성 시각, desired/applied mismatch를 운영자가 볼 수 있다.

### 5.3 메트릭 및 경보

문서의 `kcti_*` 지표를 현재 `cti_*` prefix 정책과 정합시켜 추가한다. Prometheus 표기는 기존 `cti_` prefix를 유지하고, 문서 명칭은 alias 설명으로 남긴다.

완료 기준:

- DB 연결, DB role, 복제 지연, operating mode, LKG age, offline queue depth, WAL age, backup success timestamp가 scrape된다.
- 경보 임계값은 운영 Runbook과 같은 수치를 사용한다.

## 6. P2 개선 계획

원격 DR 비동기 Standby와 센터 전환 자동화는 P0/P1 안정화 이후 추진한다. 초기 릴리스에서는 동일 센터 자동 장애조치와 백업 기반 복구를 먼저 완성하고, 원격 DR은 네트워크 지연, 회선 비용, 운영 승인 체계가 확정된 뒤 별도 단계로 분리한다.

## 7. 착수 전 확정 필요

- 최종 RPO/RTO와 자동 승격 허용 시간
- 동일 센터 Standby 물리 배치와 DCS witness 위치
- 백업 35일, 월간 12개월 보관정책과 개인정보 보관정책의 일치 여부
- DB 장애 시 기존 로그인 세션 유예시간
- 긴급 설정으로 허용할 항목과 승인 권한
- 고객 캐시 범위, 암호화 방식, TTL
- Redis Streams와 로컬 spool 최대 용량 및 백프레셔 정책
- 복구 완료 승인자와 자동/수동 경계

## 8. 권장 진행 순서

0. **P0-0: 기존 코드 결함 2건 선행 수정 (§2.1)** — 계획서의 Task 0A(리더 선출 Redis 내성) / Task 0B(replay-safe dedupe).
   신규 기능이 아니라 결함 수정이며, 서로 독립이라 병렬 진행 가능. **P0-3 착수 전에 반드시 완료한다.**
1. P0-1: Prisma 스키마와 resilience module 뼈대 추가
2. P0-2: Operating mode와 API 제한 정책 적용
3. P0-3: AMI 이벤트 durable spool과 replay batch 구현 — P0-0 완료가 전제
4. P0-4: LKG 설정 스냅샷과 readiness 정책 구현
5. P0-5: Recovery coordinator와 PBX 상태 재조회 구현
6. P1-1: 관리자 UI 배너와 설정 저장 차단
7. P1-2: Prometheus 지표와 운영 Runbook
8. P1-3: Patroni, HAProxy, pgBackRest 배포 초안 및 복구훈련
