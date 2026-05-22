# PBX 릴리즈 게이트 결과

## 판정

**CONDITIONAL GO**

코드, 테스트, 빌드는 운영 반영 후보 상태다. 단, 운영 DB 마이그레이션과 운영 PBX 반영 검증은 아직 이 로컬 세션에서 수행하지 않았으므로 운영 배포 전 필수 조건으로 남긴다.

## 로컬 검증 결과

2026-05-22 기준 `D:\Work\AI_Projects\KAster_CTI`에서 실행했다.

| 영역 | 명령 | 결과 |
|---|---|---|
| Prisma Client | `cd apps/server && npx prisma generate` | PASS |
| 서버 테스트 | `cd apps/server && npm test -- --runInBand` | 47 suites / 260 tests PASS |
| 서버 빌드 | `cd apps/server && npm run build` | PASS |
| 관리자 앱 테스트 | `cd apps/admin && npm test` | 35 files / 113 tests PASS |
| 관리자 앱 빌드 | `cd apps/admin && npm run build` | PASS |
| 상담원 앱 빌드 | `cd apps/web && npm run build` | PASS |
| 공백 검사 | `git diff --check` | PASS |
| 계획서 미체크 확인 | M1/M2/상위 PBX 계획서 `- [ ]` 검색 | 없음 |

참고 경고:

- 서버 Jest 종료 시 worker force-exit 경고가 1회 출력됐다. 테스트 실패는 아니며 기존 타이머/연결 teardown 성격의 경고로 보인다.
- 관리자/상담원 앱 Vite 빌드에서 chunk size 경고가 출력됐다. 현재 릴리즈 차단 이슈는 아니지만 추후 code splitting 후보로 남긴다.
- 관리자 테스트에서 Ant Design `Card bodyStyle` deprecation 경고가 출력됐다. 릴리즈 차단 이슈는 아니다.

## 치명 이슈

없음.

## 조건부 GO 조건

운영 반영 전 아래 항목이 완료되어야 한다.

1. 운영 DB에서 `docs/operations/pbx-production-migration-runbook-20260522.md` 절차대로 `npx prisma migrate deploy` 실행
2. 운영 DB에서 `branchDids_tenantId_didId_key`, `queues.distributionMode`, `tenantHolidayRules`, 트렁크 표시번호 컬럼 존재 확인
3. 운영 서버의 `JWT_SECRET`, `AMI_SECRET`, `POSTGRES_PASSWORD`가 placeholder가 아닌 값인지 확인
4. 운영 PBX 설정 미리보기와 리로드 경로 확인
5. 관리자 화면에서 지사 DID, 호 분배룰, 착신전환, 공휴일, 번호 자원 화면 스모크 테스트

## 높은 우선순위 수정

없음.

## 있으면 좋은 보강

- 서버 Jest worker force-exit 경고 원인 추적
- 관리자/상담원 앱 code splitting
- Ant Design `bodyStyle` 사용 지점 정리

## 운영 체크리스트

- [ ] 운영 DB 백업 생성
- [ ] 운영 DB 마이그레이션 적용
- [ ] 운영 DB 사후 SQL 검증
- [ ] 서버 새 코드 기동
- [ ] `/api/v1/health` 확인
- [ ] `/api/v1/admin/settings/system/time-sync` 확인
- [ ] `/api/v1/asterisk-config/preview` 확인
- [ ] 관리자 화면 핵심 설정 저장/조회 스모크
- [ ] PBX 리로드 예약 또는 실행 경로 확인
- [ ] 장애 시 이전 애플리케이션 버전으로 되돌릴 절차 확인
