# DB 장애 대응 레이어 구현 작업 로그 (2026-08-08)

> 브랜치: `feat/db-ha-resilience` (base `feat/pbx-feature-help`) · PR [#5](https://github.com/longbird/KAster_CTI/pull/5)
> 계획서: [`docs/plans/2026-08-08-db-ha-resilience-plan.md`](../plans/2026-08-08-db-ha-resilience-plan.md)
> 검토서: [`docs/reviews/2026-08-08-db-ha-resilience-design-review.md`](../reviews/2026-08-08-db-ha-resilience-design-review.md)
> 운영 절차: [`docs/operations/2026-08-08-db-ha-resilience-runbook.md`](../operations/2026-08-08-db-ha-resilience-runbook.md)

원천 요구: `K-CTI_DB_백업_복구_이중화_장애대응_설계서_v1.0.docx`
방향: 전면 재개발이 아니라 기존 AMI / SessionEngine / Outbox / Health 구조 위에 장애 대응 레이어를 얹는다.

**제1원칙 — 모든 모드에서 진행 중인 통화의 보류·전환·종료는 허용한다.** 막는 것은 "새로 상태를 만드는 쓰기"뿐이다.

## 1. 커밋별 진행

| # | 커밋 | 내용 | 신규 테스트 |
|---|---|---|---:|
| 0 | `4360768` | docs/ 타입 우선 재배치 + `DOCS_GUIDE.md` 신설 | — |
| 1 | `e4b2032` | Task 0A 리더 선출 Redis 내성 | 6 |
| 2 | `483f301` | 베이스라인 복구 (기존 실패 5건) | +3 |
| 3 | `6d08778` | Task 0B replay-safe dedupe | 5 |
| 4 | `24e59ef` | Task 1 resilience 스키마 6테이블 | 9 |
| 5 | `613161d` | Task 2 Operating Mode + WriteAvailabilityGuard | 29 |
| 6 | `684e00e` | Task 3 Durable Event Spool | 22 |
| 7 | `d4667fa` | Task 4 LKG 설정 스냅샷 | 20 |
| 8 | `7154273` | Task 5 Recovery Coordinator + replay batch | 13 |
| 9 | `8f4b5f4` | Task 6 `/health` + Prometheus 지표 8종 | 14 |
| 10 | `71d6b50` | Task 7 관리자 UI 제한 운전 노출 | 21 |
| 11 | `16af4f0` | Task 8·9 Patroni/HAProxy/pgBackRest 샘플 + runbook + 인수 템플릿 | — |
| 12 | `db9e5bb` | **리뷰 수정** — 호출되지 않던 Recovery / LKG 연결 | 11 |
| 13 | `c356ac7` | **리뷰 수정** — 스풀 전체 재읽기 제거 + compact | 7 |
| 14 | `18fbecb` | 리뷰 결과 runbook 반영 | — |
| 15 | `adc72de` | 작업 로그 (이 문서) | — |
| 16 | `e72d864` | **외부 검증 P2** — 비리더 노드의 공유 스풀 스트림 오염 | 8 |
| 17 | `b959bf8` | **외부 검증 P3** — 재배치 후 남은 문서 경로 2곳 | — |

## 2. 착수 전에 고친 기존 결함 2건

계획서 검토 단계에서, **이 설계를 그대로 얹으면 동작하지 않게 만드는** 결함을 코드 대조로 찾았다.

### 2.1 Redis dedupe 키가 재처리를 전량 차단

`session-engine.service.ts` 가 dedupe 키를 DB insert **앞에서** `SET NX EX 21600`(6시간)으로 선점한다.
DB 장애 중에는 Redis 만 살아 있어 키 선점만 성공하고 raw insert 는 실패 → 키가 6시간 남는다.
복구 후 재처리하면 dedupe 에 걸려 즉시 `return` 되어 **스풀에 보존한 이벤트가 전량 폐기**된다.
6시간 미만 장애에서는 Durable Event Spool 이 통째로 무의미해진다.

계획서 Task 5 의 초안 테스트가 `rawAmiEvents.findUnique` 경로만 검사해서 이 결함을 못 잡는 구조였다는 점도 함께 문제였다 — 테스트는 통과하는데 실제 재처리는 안 된다.

### 2.2 리더 선출이 Redis 장애를 못 견딤

`ami-leader-election.service.ts` 의 `tick()` 에 try/catch 가 없어 Redis 장애 시
unhandled rejection 이 발생하고 `isLeaderNode` 가 직전 값으로 굳는다.
리더였던 노드는 락 만료 후에도 리더로 남아 복구 시 split-brain 이 되고, 비리더는 영원히 비리더가 된다.
`ami-connection.service.ts:88` 이 이 값으로 게이트하므로 `DB+Redis 동시 장애` 인수 테스트가
스풀 로직에 닿기도 전에 무너진다.

## 3. 계획서에서 의도적으로 바꾼 결정

| # | 계획서 초안 | 실제 구현 | 이유 |
|---|---|---|---|
| 1 | `version BIGINT` | `INTEGER` | Prisma BigInt 는 `JSON.stringify` 에서 `TypeError` 를 던져 `ResponseTransformInterceptor` 를 깨뜨린다. 설정 버전 카운터에 21억은 충분. 계약 테스트로 고정 |
| 2 | 마이그레이션 snake_case | 따옴표 camelCase | 이 레포의 기존 마이그레이션 전부가 camelCase (`@map` 미사용) |
| 3 | 감사 테이블에 `agents` FK | FK 없음 | 감사 기록은 참조 대상보다 오래 살아야 한다 (`callRecordingAccessAuditLogs` 관례). 계약 테스트로 고정 |
| 4 | Task 5 "raw 중복이면 replay 건너뜀" 테스트 | 폐기 | raw 저장과 세션 상태 전이는 서로 다른 두 번의 쓰기다. raw 만 들어가고 상태 전이가 실패한 이벤트가 존재할 수 있다 |
| 5 | 설정 페이지별 저장 버튼 비활성화 | 공유 axios 인터셉터 | 페이지별 수정은 앞으로 추가되는 설정 화면에서 매번 빠뜨린다. 503 만으로 판단하지 않고 `OPERATING_MODE_RESTRICTED` 코드가 있을 때만 안내 (LB/프록시도 503 을 낸다) |
| 6 | 엔드포인트별 가드 데코레이터 | 컨트롤러 클래스 레벨 + 가드가 GET/HEAD/OPTIONS 통과 | 엔드포인트 56개에 개별로 붙이면 새 엔드포인트에서 빠뜨린다. 조회 경로는 장애 중에도 열려 있어야 운영자가 상황을 파악한다 |
| 7 | LKG 에 설정 본문 저장 | 파일별 sha256 다이제스트 | `pjsip.conf` 에 SIP 비밀번호가 평문으로 들어간다. 객체 키 기준 마스킹으로는 파일 본문 안의 값을 못 거른다. 복원 기능은 포기하고 유출 위험을 0 으로 |

## 4. 비판적 리뷰에서 발견해 고친 것

전체 구현 후 리뷰에서 **단위 테스트는 통과하지만 운영에서는 아예 동작하지 않는** 문제를 찾았다.
커버리지로는 안 잡힌다. "만든 것이 실제로 호출되는가" 를 호출처 검색으로 확인해야 나온다.

### 4.1 `startRecovery` 를 부르는 곳이 없었다

```
grep -rn "startRecovery" src --include=*.ts | grep -v spec
→ 정의 1건만, 호출 0건
```

DB 가 한 번만 끊겨도 `DB_FAILOVER → RECOVERING` 으로 간 뒤 **영원히 그 상태에 갇힌다.**
= 설정 저장이 영구히 차단된다. 기능이 없는 것보다 나쁘다.

→ `RecoverySweeperService` 추가 (15초 주기 + 리더 가드). 이 레포의 기존 sweeper 패턴
(`OutboxPublisher` / `SessionRecoverySweeper` / `RecordingFinalizer`)과 동일.
복구 대상 테넌트는 **DB 활성 테넌트 + 로컬 스풀에 파일이 남은 테넌트의 합집합** — DB 를 아직
못 읽는 상황에서도 재처리 대상은 존재하므로 DB 목록만 보면 놓친다.

### 4.2 `ConfigSnapshotService.save` 를 부르는 곳이 없었다

LKG 가 영영 비어 있어 `load()` 는 항상 `null`, 설정 출처는 항상 `missing` 이었다.

→ `AsteriskReloadService.executeReload` 성공 직후 `captureLkg`.
디스크의 실제 파일에서 읽는다 — 다시 렌더링하면 그 사이 DB 가 바뀌었을 때 "적용된 것" 과
"LKG" 가 어긋난다. 실제 적용된 바이트가 곧 Last Known Good 이다.

### 4.3 `/health` 폴링마다 스풀 전체를 읽고 파싱

`getPendingDepth → pendingCount → readPending` 이 스풀 파일 **전체를 읽고 전 레코드를 `JSON.parse`** 했다.
스풀이 커지는 시점은 정확히 장애 중이므로, 이미 힘든 시스템에 부하가 최악의 타이밍으로 몰린다.

→ 커서 이후 구간만 위치 지정 읽기, `pendingCount` 는 개행만 카운트(파싱 없음),
커서가 끝까지 올라가 있으면 본문을 아예 읽지 않음(평시 비용 0),
전부 처리된 파일은 `compact()` 로 비움(미처리분이 남으면 아무것도 하지 않음).

## 4-1. 외부 검증에서 지적받아 고친 것

구현 완료 후 외부 검증을 받았고, 유효한 지적 3건을 반영했다.

### P2 — 멀티노드에서 offline depth 가 영원히 0 이 되지 않음

모든 노드가 리더 게이트 앞에서 공유 Redis Stream 에 append 하는데, 리더는 처리 후
**자기 append 의 stream ID** 로 커서를 올린다. 비리더 append 가 그보다 뒤 ID 를 받으면
커서 뒤에 영구히 남는다. 유실은 아니지만 지표가 죽고 복구 중 불필요한 replay 가 반복된다.

근본 원인은 **"모든 노드가 쓴다" 의 근거가 틀렸다**는 점이었다. 그 근거는 "Redis 장애 시
리더가 없으니 아무도 안 쓴다" 였는데, Redis 가 죽으면 Redis append 자체가 실패해 로컬
스풀로 떨어진다. 즉 공유 스트림 오염은 Redis 가 **살아 있을 때만** 생기고, 그때는 리더
선출이 정상이므로 비리더가 쓸 이유가 없다.

→ `isLeadershipKnown()` 을 추가해 "리더가 아님" 과 "리더인지 알 수 없음" 을 구분하고,
스풀 조건을 `리더 || 리더십 확인 불가` 로 좁혔다. 안전장치로 `drainCursor()` 를 추가해
리더 전환 경계에서 남을 수 있는 항목을 재처리 전량 성공 시 배수한다(로컬 `compact` 와 대칭).

### P3 — `git diff --check` 실패

검토서 헤더의 markdown hard-break(trailing 2-space)와 EOF 빈 줄. 헤더를 목록으로 바꿔
trailing whitespace 없이 같은 렌더 결과를 얻었다.

### P3 — 재배치 후 남은 폐지 경로 참조

- `docs/plans/2026-04-21-customer-management-phase1.md` 의 `docs/superpowers/verification/…` 2곳.
  이 경로는 git 이력상 한 번도 존재한 적이 없어(계획서가 "만들라" 고 지시한 파일)
  일괄 치환 맵에 걸리지 않았다 → `docs/qa/…-verification.md` 로 정정
- **추가로 발견**: `tools/generate_ipcc_diagram.py` 가 폐지된 `docs/proposals/` 로 PNG 를
  출력하고 있었다. 마크다운 링크 검사로는 잡히지 않는 `.py` 경로다 → `docs/design/assets/` 로 정정

## 5. 베이스라인 복구

착수 시점에 서버 테스트가 **4 suites / 5 tests 실패** 상태였다. 전부 제품 변경을 테스트가
따라가지 못한 경우이며 제품 버그는 아니었다. 이걸 먼저 고쳐야 이후 단계에서 실제 회귀를 판별할 수 있다.

- `auth-softphone-config` / `auth-desktop-session` — `CallsService` 목에 `getOutboundCallCapabilities` 누락
- `permissions.integration` — `AsteriskConfigController` 에 나중에 추가된 `PromptTtsService` 가 테스트 모듈에 없음
- `admin.service.smdr` — `BranchSmdrProfile` 이 웹훅 방식에서 CID 프로그램 방식으로 교체됐는데 스펙이 옛 형태를 검증.
  **두 번째 테스트는 전혀 다른 CID 예외가 던져져 통과하던 false-green 이었다.** 현재 동작 기준 5건으로 재작성

## 6. 검증 증적

실행 명령과 출력 요약이다.

```bash
cd apps/server && npx jest --runInBand && npm run build
cd apps/admin  && npx vitest run && npm run build
cd apps/web    && npx vitest run
```

| 대상 | 결과 |
|---|---|
| server | 66 suites / **451 tests** 통과, `nest build` 성공, `npm run lint` 통과 |
| admin | 38 files / **137 tests** 통과, `vite build` 성공 |
| web | 11 tests 통과 |

마이그레이션 대조 (Docker 부재로 실 DB 적용 불가):

```bash
npx prisma validate                                    # valid
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
# 수기 migration.sql 과 컬럼 단위 비교 → 6테이블 72컬럼 전부 일치
```

Red-Green 검증을 수행한 항목:

- Task 0A — try/catch 없이 `tick()` 만 public 으로 만든 상태에서 Redis 장애 3건 실패,
  정상 경로 3건 통과를 확인한 뒤 수정 적용 → 6건 전부 통과
- Task 0B — `releaseDedupeKey` 호출을 임시 제거하면 "DB insert 실패 시 dedupe 키 해제"
  1건만 정확히 실패함을 확인한 뒤 복원 → 8건 통과

문서: `docs/` 마크다운 링크 깨짐 0건.

## 7. 검증하지 못한 것

- **실 PostgreSQL 리허설.** 로컬 Docker 가 기동되지 않아 `npx prisma migrate deploy` 를
  실 DB 에 적용하지 못했다. Patroni / HAProxy / pgBackRest 도 샘플이며 실기동 검증이 없다.
- **NestJS 부팅(`onModuleInit`) 검증.** DI 그래프는 `nest build` 와 의존 방향 검토로만 확인했다.
- `apps/desktop` 의 기존 실패 4건은 이 브랜치가 건드리지 않은 영역이다
  (`git diff 0f6ad19..HEAD -- apps/desktop` 이 비어 있음).
- **CI 체크 없음.** `gh pr checks 5` 결과 `no checks reported` — 이 저장소에는 CI 워크플로가
  설정돼 있지 않다. 위 검증은 전부 로컬 실행 결과다.

## 8. 남은 범위 / 판단 필요

runbook 6장에 표로 정리했다. 요약:

1. **명령 스풀 미구현** — `offlineCommandQueueDepth` 가 `0` 이 아니라 `null`(Prometheus -1).
   0 은 "밀린 명령 없음" 으로 오독된다
2. **LKG 는 복원용이 아님** — 다이제스트만 저장
3. **`allowNewLogin` 은 보고만 하고 강제하지 않음** — 강제하면 장애 중 감독자가 관리자 앱에
   재로그인할 수 없게 되는 위험이 있어 **운영 판단 사항으로 남겼다**
4. **원격 DR 미포함** (P2)
5. **실 PostgreSQL 리허설 미실시** — 이걸 하기 전에는 HA 준비 완료라고 말하지 않는다

## 9. 배포 시 주의

`RESILIENCE_LOCAL_SPOOL_DIR` 과 `RESILIENCE_LKG_DIR` 은 컨테이너 배포 시 **반드시 영속 볼륨**이어야 한다.
재시작으로 사라지면 DB+Redis 동시 장애 구간의 이벤트를 그대로 잃는다.
