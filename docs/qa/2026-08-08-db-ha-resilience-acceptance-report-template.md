# DB 장애 대응 인수 리포트 (템플릿)

> 이 파일은 **템플릿**이다. 훈련을 수행할 때 복제해서
> `docs/qa/YYYY-MM-DD-db-ha-resilience-acceptance-report.md` 로 저장한다.
> 실행하지 않은 항목은 비워두지 말고 `미실시` 로 적는다. 빈칸은 통과로 오독된다.

작성일: YYYY-MM-DD
수행자:
대상 환경: (사이트 코드 / 호스트 / 커밋 해시)
관련: [운영 절차](../operations/2026-08-08-db-ha-resilience-runbook.md)

## 1. 사전 상태

| 항목 | 값 |
|---|---|
| 커밋 해시 | |
| `operatingMode` | |
| `resilience.dbRole` | |
| `resilience.lkgVersion` / `lkgAgeSeconds` | |
| `resilience.offlineEventQueueDepth` | |
| `resilience.configVersionMismatch` | |
| 마지막 백업 성공 시각 | |

## 2. 빌드·테스트 증적

실행한 명령과 **실제 출력 요약**을 적는다. "통과함" 같은 서술만 남기지 않는다.

```bash
cd apps/server && npm test -- --runInBand && npm run build
cd apps/admin  && npm test && npm run build
cd apps/web    && npm test && npm run build
```

| 대상 | 명령 | 결과 (suites/tests) |
|---|---|---|
| server | | |
| admin | | |
| web | | |

## 3. 마이그레이션

| 항목 | 결과 |
|---|---|
| `npx prisma migrate deploy` 적용 | |
| 적용 후 `\dt` 로 6개 테이블 확인 | |
| 롤백 절차 확인 | |
| 백업 선행 여부 | |

## 4. 장애 시나리오

각 행에 **주입 시각**과 **관측 결과**를 적는다.

| # | 시나리오 | 주입 시각 | 관측된 `operatingMode` | RPO | RTO | 결과 |
|---|---|---|---|---|---|---|
| 1 | Primary 프로세스 강제 종료 | | | | | |
| 2 | Primary 네트워크 격리 | | | | | |
| 3 | DB 전체 접근 불가 | | | | | |
| 4 | DB+Redis 동시 장애 | | | | | |
| 5 | Middleware 재시작 | | | | | |
| 6 | 유효 LKG 없이 부팅 | | | | | |
| 7 | AMI 이벤트 중복 수신 | | | | | |
| 8 | 대량 이벤트 재처리 | | | | | |
| 9 | 설정 적용 중 DB 장애 | | | | | |
| 10 | 긴급 설정 적용 | | | | | |
| 11 | PITR | | | | | |
| 12 | 백업 손상 | | | | | |

## 5. 스풀 / 재처리 증적

| 항목 | 값 |
|---|---|
| 장애 전 큐 깊이 | |
| 장애 중 최대 큐 깊이 | |
| 복구 후 큐 깊이 | |
| `replayBatches.replayBatchId` | |
| `totalCount` / `successCount` / `failureCount` | |
| 로컬 스풀 파일 경로와 크기 | |
| 재처리 소요 시간 | |

## 6. 설정 무결성

| 항목 | 값 |
|---|---|
| LKG 버전 / 체크섬 | |
| 체크섬 검증 통과 여부 | |
| LKG 에 비밀값 노출 없음 확인 | |
| 긴급 변경 건수 / 검토 완료 건수 | |

## 7. 통화 연속성

**이 설계의 제1원칙이 지켜졌는지가 인수의 핵심이다.**

| 항목 | 결과 |
|---|---|
| 장애 중 진행 통화 유지 | |
| 장애 중 보류/전환/종료 동작 | |
| 장애 중 신규 인입 처리 | |
| 유실된 통화 이력 건수 | |

## 8. 판정

| 항목 | 값 |
|---|---|
| 관측 RPO | |
| 관측 RTO | |
| 목표 대비 충족 여부 | |
| `NORMAL` 복귀 승인자 | |
| 승인 시각 | |

## 9. 미해결 사항

발견했지만 이번에 해소하지 못한 것을 적는다. 없으면 `없음`.
