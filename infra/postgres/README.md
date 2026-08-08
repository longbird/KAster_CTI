# PostgreSQL HA / 백업 구성

이 디렉터리는 **샘플**이다. 그대로 배포하지 말고 사이트별 값으로 치환한 뒤 사용한다.
운영 절차와 훈련 시나리오는 [`docs/operations/2026-08-08-db-ha-resilience-runbook.md`](../../docs/operations/2026-08-08-db-ha-resilience-runbook.md)에 있다.

## 지원 토폴로지 (1차)

| 구성요소 | 수량 | 비고 |
|---|---:|---|
| PostgreSQL primary | 1 | |
| 동기 standby | 1 | `synchronous_commit=on` |
| DCS witness | 3 voters | **단일 DB 장애 도메인과 분리**해야 한다. 같은 호스트/랙에 두면 정족수가 같이 죽는다 |
| HAProxy/VIP writer endpoint | 1 | `db-writer.internal:5432` |
| 원격 DR standby | 0 | P2. 회선 지연·비용·운영 승인이 확정된 뒤 별도 단계 |

애플리케이션의 `DATABASE_URL` 은 **항상 writer endpoint** 를 가리킨다. Patroni 가 승격을
처리하고 HAProxy 가 트래픽을 옮기므로 앱은 장애조치를 몰라도 된다.

## 파일

| 파일 | 용도 |
|---|---|
| `patroni.sample.yml` | Patroni 노드 설정. 노드별 값은 환경변수로 주입 |
| `haproxy.sample.cfg` | writer/reader 엔드포인트 라우팅 |
| `pgbackrest.sample.conf` | 백업 저장소와 보관 정책 |

## 애플리케이션 쪽 전제

`apps/server/.env` 의 아래 값이 이 구성과 맞물린다.

- `RESILIENCE_LOCAL_SPOOL_DIR`, `RESILIENCE_LKG_DIR` — **영속 볼륨이어야 한다.**
  컨테이너 재시작으로 사라지면 DB+Redis 동시 장애 구간의 이벤트를 잃는다.
- `RESILIENCE_BACKUP_STATUS_FILE` — pgBackRest 잡이 성공 시각을 남길 파일.
  PostgreSQL 은 백업 성공 여부를 모르므로 이 파일이 `/health` 의 유일한 출처다.

백업 잡 마지막 줄 예시:

```bash
pgbackrest --stanza=kcti --type=incr backup \
  && date -u +%Y-%m-%dT%H:%M:%SZ > /var/lib/kcti/backup-last-success
```

## 미확정 항목

아래는 이 샘플이 값을 정하지 않는다. 운영 승인 후 채운다.

- 최종 RPO/RTO 와 자동 승격 허용 시간
- 동기 standby 물리 배치와 DCS witness 위치
- 백업 보관 정책(35일 / 월간 12개월)과 개인정보 보관정책의 일치 여부
- 백업 저장소의 장애 도메인 (운영 DB 와 물리적으로 분리돼야 한다)
