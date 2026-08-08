# DB 장애 대응 운영 절차

작성일: 2026-08-08
대상: `apps/server` resilience 모듈, `infra/postgres/`
관련: [개선 계획서](../reviews/2026-08-08-db-ha-resilience-design-review.md) · [개발 계획서](../plans/2026-08-08-db-ha-resilience-plan.md)

## 1. 운영 모드

서버는 4가지 모드를 가진다. 현재 모드는 `GET /api/v1/health` 의 `operatingMode` 와
관리자 앱 상단 배너에서 확인한다.

| 모드 | 진입 조건 | 허용 | 차단 |
|---|---|---|---|
| `NORMAL` | 평시 | 전부 | — |
| `DB_FAILOVER` | DB 접근 실패 직후 | 기존 통화 제어, 로그인 | 일반 설정 저장, 고객 캐시 미스 조회 |
| `DEGRADED` | 장애가 `RESILIENCE_DEGRADED_AFTER_MS`(기본 30초) 초과 | 기존 통화 제어, **긴급** 설정 변경 | 일반 설정 저장, **신규 로그인** |
| `RECOVERING` | DB 복구됨, 재처리 미완 | 기존 통화 제어, 로그인 | 일반 설정 저장 |

**모든 모드에서 진행 중인 통화의 보류·전환·종료는 허용된다.** 이것이 이 설계의 제1원칙이다.

`RECOVERING` 은 재처리가 **전부 성공**해야 `NORMAL` 로 내려간다. 실패가 하나라도 남으면
모드가 유지된다 — 미반영 이벤트를 안고 평시로 복귀하면 이후 상태 불일치를 설명할 수 없다.

## 2. 장애 감지

| 신호 | 확인 위치 |
|---|---|
| 운영 모드 | `/health` `operatingMode`, 관리자 상단 배너, `cti_operating_mode` (NORMAL=0/DB_FAILOVER=1/RECOVERING=2/DEGRADED=3) |
| 미처리 이벤트 | `/health` `resilience.offlineEventQueueDepth`, `cti_offline_event_queue_depth` |
| DB 역할·복제 지연 | `resilience.dbRole`, `cti_db_replication_lag_seconds` (-1 = 모름/primary) |
| LKG 상태 | `resilience.lkgVersion` / `lkgAgeSeconds`, `cti_config_snapshot_age_seconds` |
| 설정 미반영 | `resilience.configVersionMismatch`, `cti_config_version_mismatch` |
| WAL/백업 | `cti_wal_archive_age_seconds`, `cti_backup_last_success_timestamp` (-1 = 모름) |

지표에서 **-1 은 "0" 이 아니라 "모름"** 이다. 경보 임계값을 잡을 때 0 과 구분한다.

## 3. 장애 대응 절차

### 3.1 DB 장애 발생 시

1. 관리자 배너와 `/health` 로 모드를 확인한다.
2. Patroni 상태를 본다: `patronictl -c /etc/patroni.yml list`
3. 자동 승격이 진행 중이면 기다린다. 앱은 writer endpoint 만 보므로 별도 조작이 필요 없다.
4. `offlineEventQueueDepth` 가 증가하는지 확인한다. 증가하면 스풀이 정상 동작 중이라는 뜻이다.
5. **일반 설정 변경을 시도하지 않는다.** 서버가 503 `OPERATING_MODE_RESTRICTED` 로 거부한다.

### 3.2 긴급 라우팅 변경이 필요할 때

`DEGRADED` 에서만 허용된다. 승인자와 사유가 반드시 남는다 (`configEmergencyChanges`).
복구 후 `mergeStatus = PENDING_REVIEW` 인 항목을 수동 병합한다. **자동 병합하지 않는다.**

### 3.3 복구 후

1. DB 가 살아나면 서버가 자동으로 `RECOVERING` 으로 전환한다.
2. Recovery Coordinator 가 리더 노드에서 재처리를 수행한다.
3. `recoveryAuditLog` 에서 `RECOVERY_STARTED` / `RECOVERY_FINISHED` 를 확인한다.
4. `replayBatches` 의 `failureCount` 가 0 이면 자동으로 `NORMAL` 로 내려간다.
5. 0 이 아니면 `RECOVERING` 이 유지된다. 실패 원인을 해소하고 재처리를 다시 돌린다.
6. `configEmergencyChanges` 의 미검토 항목을 처리한다.

## 4. 백업 / PITR

### 4.1 백업 확인

```bash
pgbackrest --stanza=kcti info
```

### 4.2 PITR (격리 서버로 복원)

```bash
# 1) 대상 시각을 정한다
pgbackrest --stanza=kcti --type=time \
  --target="2026-08-08 12:00:00+09" \
  --target-action=promote \
  --pg1-path=/var/lib/postgresql/16/restore \
  restore

# 2) 복원본을 기동해 검증한다 (운영 포트와 분리)
pg_ctl -D /var/lib/postgresql/16/restore -o "-p 5439" start
psql -p 5439 -d kaster_cti -c "SELECT max(\"startedAt\") FROM \"callSessions\";"
```

**운영 DB 에 직접 복원하지 않는다.** 격리 서버에서 검증한 뒤 전환 여부를 판단한다.

### 4.3 백업 손상 시

`pgbackrest info` 로 이전 세대를 확인하고 `--set=<backup-label>` 로 특정 세대를 지정해 복원한다.

## 5. 훈련 시나리오

분기 1회 이상 수행하고 결과를 [인수 리포트 템플릿](../qa/2026-08-08-db-ha-resilience-acceptance-report-template.md)에 기록한다.

| # | 시나리오 | 확인할 것 |
|---|---|---|
| 1 | Primary 프로세스 강제 종료 | 자동 승격, writer endpoint 전환, 통화 유지 |
| 2 | Primary 네트워크 격리 | split-brain 없음, 정족수 동작 |
| 3 | DB 전체 접근 불가 | `DEGRADED` 진입, 통화 제어 유지, 설정 저장 503 |
| 4 | DB+Redis 동시 장애 | 로컬 JSONL 스풀에 이벤트 적재, 리더 없음 |
| 5 | Middleware 재시작 | 로컬 스풀 잔존, LKG 로 부팅 |
| 6 | 유효 LKG 없이 부팅 | 설정 출처 `missing` 보고 |
| 7 | AMI 이벤트 중복 수신 | `rawAmiEvents` unique 로 차단 |
| 8 | 대량 이벤트 재처리 | replay batch 완주, `failureCount=0` |
| 9 | 설정 적용 중 DB 장애 | desired/applied 불일치 노출 |
| 10 | 긴급 설정 적용 | 승인·사유 기록, 복구 후 검토 대기 |
| 11 | PITR | 격리 서버 복원 성공 |
| 12 | 백업 손상 | 다른 세대로 복원 성공 |

## 6. 알려진 한계 (2026-08-08 기준)

아래는 **의도적으로 남긴 범위**다. 운영 판단에 필요하므로 숨기지 않는다.

| # | 한계 | 영향 | 대응 |
|---|---|---|---|
| 1 | **명령 스풀 미구현** | 장애 중 발생한 업무 명령(메모·상담결과)은 오프라인 큐가 없어 그대로 실패한다 | `/health` 의 `offlineCommandQueueDepth` 가 `null`(Prometheus 는 -1). 0 이 아닌 이유는 "밀린 명령 없음" 으로 오독하지 않게 하기 위함 |
| 2 | **LKG 는 복원용이 아니다** | 파일별 sha256 다이제스트만 저장하므로 LKG 로 설정을 되돌릴 수 없다. 드리프트 탐지와 버전/나이 보고까지만 가능 | `pjsip.conf` 에 SIP 비밀번호가 평문으로 들어가는데 본문을 저장하면 그대로 디스크에 남는다. 복원 기능이 필요하면 필드 단위 마스킹 설계가 선행돼야 한다 |
| 3 | **`allowNewLogin` 은 보고만 하고 강제하지 않는다** | `DEGRADED` 에서 이 값이 `false` 로 나가지만 `AuthController` 에는 가드가 없다. 실제로는 DB 가 죽어 로그인이 자연히 실패한다 | 강제하면 장애 중 감독자가 관리자 앱에 재로그인할 수 없게 되는 위험이 있어 **운영 판단 사항으로 남겼다**. 적용하려면 `WriteKind` 에 `login` 을 추가해 `AuthController` 에 붙인다 |
| 4 | **원격 DR 미포함** | 동일 센터 장애조치까지만 커버 | P2 |
| 5 | **실 PostgreSQL 리허설 미실시** | 마이그레이션·Patroni·pgBackRest 를 실 DB 에 적용해 검증하지 않았다 | 5장 훈련 시나리오를 수행하고 인수 리포트에 기록한다. **이걸 하기 전에는 HA 준비 완료라고 말하지 않는다** |

### 이미 해소된 항목 (참고)

초기 구현에서 다음 두 가지가 "코드는 있으나 아무도 부르지 않는" 상태였고, 리뷰에서 발견해 수정했다.

- `RecoveryCoordinator.startRecovery` 미호출 → `RecoverySweeperService`(15초 주기·리더 전용) 추가.
  수정 전에는 DB 가 한 번만 끊겨도 `RECOVERING` 에 영구히 갇혀 설정 저장이 영원히 차단됐다.
- `ConfigSnapshotService.save` 미호출 → PBX reload 성공 직후 `captureLkg` 로 고정.
  수정 전에는 LKG 가 영영 비어 있어 설정 출처가 항상 `missing` 이었다.
