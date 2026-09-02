# 통화 AI 분석 1·2단계 구현 작업 로그

작성일: 2026-09-01
계획서: [`docs/plans/2026-09-01-ai-layer-plan.md`](../plans/2026-09-01-ai-layer-plan.md) 1단계
범위: 1단계(계획서 1.11 의 작업 순서 1~9, 11. **10(실 프로바이더 어댑터)은 미착수**) + 2단계(AI 인사이트 대시보드)

---

## 한 일

| # | 항목 | 산출물 |
|---|---|---|
| 1 | 스키마 + 마이그레이션 | `prisma/migrations/20260901_call_analysis/` — 테이블 5개 |
| 2 | 순수 유틸 | `audio/wav-channels.util.ts`, `pii-mask.util.ts` |
| 3 | 프로바이더 계층 | `providers/` — 인터페이스 2개 + fake 구현 2개 + factory |
| 4 | job sweep | `call-analysis-sweeper.service.ts` (리더 가드·백오프·단계 전이) |
| 5 | 전사 | `transcription.service.ts` (복호 → 채널 분리 → STT → 마스킹 저장) |
| 6 | 분석 | `analysis.service.ts` + `analysis-response.util.ts` + `prompts/summarize.prompt.ts` |
| 7 | 트리거 | `call-analysis-reconcile.service.ts` |
| 8 | REST | `call-analysis.controller.ts` + `call-analysis-query.service.ts`, `docs/openapi.json` 갱신 |
| 9 | 상담분류 | `modules/consult-categories/` + 메뉴 키 `settings/consult-categories` (서버·관리자 1:1) |
| 11 | 관리자 UI | `features/consult-categories/`, `features/call-analysis/CallAnalysisDrawer.tsx`, 통화 이력에 진입점 |

## 계획서와 달라진 것

세 가지를 바꿨다. 이유를 남긴다.

### 1. 트리거를 finalizer 3줄 추가가 아니라 reconcile sweep 으로

계획서 1.11-7 은 `RecordingFinalizerService` 안에서 분석 job 을 적재하려 했다.
그러면 `RecordingPipelineModule` → `CallAnalysisModule` 의존이 생기는데,
`CallAnalysisModule` 은 녹취 복호를 위해 이미 `RecordingPipelineModule` 을 import 한다. **모듈 순환**이다.

`CallAnalysisReconcileService` 가 `recordingStatus='READY'` 이고 분석 job 이 없는 녹취를 직접 찾아 적재하게 바꿨다.
결과적으로 `recording-pipeline` 은 한 줄도 바뀌지 않았고(D1 취지에 더 맞다), 계획서가 백스톱으로만 두려던
reconcile 이 트리거 자체가 됐다. 지연은 sweep 주기(기본 30초)만큼이며 통화 후 처리라 문제 없다.

이 조회를 위해 `callAnalysisJobs.recordingId` 에 `callRecordings` FK/관계를 추가했다
(`analysisJobs: { none: {} }` 조건에 필요). 마이그레이션은 아직 어디에도 적용 전이라 같은 파일에 반영했다.

### 2. LLM 응답 검증에 zod 를 쓰지 않음

계획서 1.6 은 zod 를 쓰려 했으나 이 저장소에 zod 의존성이 없다(검증은 class-validator).
한 곳을 위해 의존성을 늘리는 대신 `analysis-response.util.ts` 의 순수 파서로 처리했다.
코드펜스 제거, 앞뒤 잡담 안에서 JSON 객체 추출, sentiment 화이트리스트, sentimentScore -1~1 클램프,
keywords 비문자열 제거까지 spec 10건으로 고정했다.

### 3. 구현 순서를 4 → 5·6 이 아니라 5·6 → 4 로

sweeper 가 전사·분석 서비스를 주입받으므로 리프부터 만들었다. 목(mock) 없이 검증되는 순서다.

## 추가로 한 것 (계획서에 없던, 저장소 규약 때문에 필요했던 것)

- `test/write-availability-coverage.spec.ts` 의 `FULLY_GATED` 에 새 컨트롤러 2개 등록.
  이 저장소는 쓰기 엔드포인트를 가진 컨트롤러가 장애 모드 정책에 분류되지 않으면 테스트가 실패한다.
  분석 재요청·상담분류 CRUD 는 통화 제어가 아니므로 쓰기 저하 모드에서 끊는다(`general`).
- `apps/admin/src/shared/permissions/menuConfig.test.tsx` 의 leaf key 목록에 새 메뉴 키 등록.

## 검증 결과 (2026-09-01 실행)

| 항목 | 명령 | 결과 |
|---|---|---|
| 스키마 유효성 | `npx prisma validate` | valid |
| 클라이언트 생성 | `npx prisma generate` + 모델 5개 존재 확인 | OK |
| 서버 단위/통합 | `npm test` (apps/server) | **1011 passed / 120 suites, 실패 0** |
| 서버 린트 | `npm run lint` | 0 error |
| 서버 빌드 | `npm run build` | exit 0 |
| 관리자 테스트 | `npx vitest run` (apps/admin) | **219 passed / 48 files, 실패 0** |
| 관리자 컴파일 | `npm run build` | 성공 (dist 는 로컬 env 가 박히므로 확인 후 삭제) |
| OpenAPI | `npm run openapi:export` | +216줄 (엔드포인트 7개) |

리더 가드는 **Red-Green** 으로 확인했다.
가드 한 줄을 제거 → `리더가 아니면 job 을 조회조차 하지 않는다` 실패 → 복원 → 15건 전부 통과.

## 남은 것

1. **마이그레이션 미적용.** 로컬 Docker 와 WSL 이 모두 꺼져 있어 `prisma migrate deploy` 를 돌리지 못했다.

   > 정정(2026-09-02): 이 로그는 처음에 `DATABASE_URL` 의 `172.19.56.218` 을 "원격 개발서버" 라고 적었다. **틀렸다.**
   > 그 주소는 이 PC 의 WSL2 가상 어댑터 대역(`172.19.48.1`) 안에서 배포판에 할당된 **로컬 주소**이고,
   > WSL 재시작마다 바뀐다. `.env` 는 `AMI_HOST=127.0.0.1`, CORS 도 localhost 인 로컬 개발 설정이다.
   > 공유 개발/검증 서버는 `49.247.46.86` 이며, 그 서버는 `server` 컨테이너 부팅 시
   > `prisma migrate deploy` 를 스스로 돌린다 — 원격 DB 에 직접 붙어 미는 것이 아니라 배포·restart 로 적용된다.
2. **실 프로바이더 어댑터(계획서 1.11-10).** 현재 `fake` 만 동작하며, `local`/`openai`/`anthropic` 은
   factory 가 명시적으로 던진다. 한국어 8kHz 통화 STT 정확도 비교도 이 단계에서 한다.
3. **실 녹취 end-to-end 미검증.** fake 프로바이더로 파이프라인 전 구간(job 전이·저장·마스킹)은 검증했지만,
   실제 MixMonitor 스테레오 파일로 채널 분리가 화자와 맞는지는 실 PBX 확인이 필요하다
   (`CALL_ANALYSIS_CUSTOMER_CHANNEL` 로 좌/우를 뒤집을 수 있게 열어 뒀다).

---

# 2단계 — AI 인사이트 대시보드

## 계획서 §2 의 틀린 전제를 고침

계획서 §2 는 "집계는 조회 시점이 아니라 `dashboardSnapshots` 롤업에 넣는다" 였다. **틀렸다.**

`dashboardSnapshots` 는 분당 *순간 상태*(대기 호수·상담원 상태·트렁크 점유) 스냅샷이지 통화 결과 롤업이 아니다.
AI 분석 결과는 통화가 끝나고 수 분 뒤에 도착하는데, 통화 시각 기준 스냅샷에 넣으려면
과거 스냅샷 행을 다시 써야 하고 그러지 않으면 늦게 도착한 분석이 영원히 빠진다.

`TrendQueryService.readCallBuckets` 가 호 인입/응답/포기에 이미 **요청 시점 집계**를 쓰고 있고
(그 주석도 "적재를 시작하기 전 기간도 소급 조회된다"고 적혀 있다), 같은 방식으로 갔다.
계획서 §2 도 같은 커밋에서 고쳤다.

## 배치 결정

`modules/trends/insights/` 에 넣었다. `modules/call-analysis/` 가 아니다.

- 시간축 어휘(해상도·버킷·MAX_POINTS)가 추이와 같아야 한다
- 화면이 추이 페이지의 탭이므로 메뉴 키 `trends` 를 그대로 쓴다 — **새 메뉴 키도, 새 모듈 등록도 없다**
- 쓰기 엔드포인트가 없어 장애 모드 분류(`write-availability-coverage.spec.ts`)에도 영향이 없다

## 공용화한 것

5분 버킷 계산(`date_trunc('hour') + make_interval`)이 두 곳에 복제될 뻔해서
`trends/call-bucket-expression.ts` 로 빼고 `TrendQueryService` 와 `CallInsightsService` 가 같이 쓴다.
복제하면 5분 버킷이 조용히 어긋난다.

## 만든 것

| 항목 | 파일 |
|---|---|
| 순수 유틸 | `trends/insights/insight-series.util.ts` — 빈 버킷 0 채움, 급상승 키워드 계산 |
| 공용 버킷 식 | `trends/call-bucket-expression.ts` (기존 `trend-query.service.ts` 에서 추출) |
| 집계 서비스 | `trends/insights/call-insights.service.ts` |
| 엔드포인트 | `GET /admin/call-insights` (기존 `TrendsController` 에 추가, 메뉴 키 `trends`) |
| 관리자 | `features/trends/components/CallInsightsPanel.tsx`, `insights/insightFormat.ts`, 추이 페이지 탭 분리 |

지표는 **분석 커버리지**(분석된 통화 / 전체 통화), **고객 감정 추이**(구간별 긍정·중립·부정 누적),
**상담 주제 분포**(분류별 건수·부정 비율·평균 통화시간), **급상승 키워드**(직전 같은 길이 구간 대비 증가).

커버리지를 맨 위에 둔 이유는 분석이 통화를 절반밖에 못 덮은 상태에서
아래 분포를 전체 통화의 분포로 읽으면 틀린 결론이 나오기 때문이다. 50% 미만이면 빨갛게 표시한다.

## 설계상 주의한 것

- **0 과 null 의 구분.** 추이의 리소스 축은 스냅샷이 없으면 `null`(측정 안 함)이지만,
  인사이트는 조회 시점 집계라 값이 없으면 `0`(그 구간에 분석된 통화가 없었다)이다. 서로 다른 사실이다.
- **급상승 비교 구간.** 요청 구간 바로 앞의 같은 길이 구간. 하루를 보면 그 전날과 비교된다.
  직전 구간에 없던 키워드는 변화율을 낼 수 없어 `null` 로 두고 화면에 '신규'로 쓴다 (무한대가 아니다).
- **노이즈 컷.** 구간 내 3건 미만 키워드는 오탈자·1회성 발화로 보고 뺀다.
- **잘못된 큐는 빈 그래프가 아니라 오류.** 빈 그래프는 "그 기간에 분석된 통화가 없었다"로 읽힌다.

## 검증 결과 (2026-09-01 실행)

| 항목 | 명령 | 결과 |
|---|---|---|
| 서버 테스트 | `npm test` (apps/server) | **1041 passed / 123 suites, 실패 0** |
| 서버 린트 | `npm run lint` | 0 error |
| 서버 빌드 | `npm run build` | exit 0 |
| 관리자 타입체크 | `npx tsc -b` | 오류 0 |
| 관리자 테스트 | `npx vitest run` | **225 passed / 49 files, 실패 0** |
| OpenAPI | `npm run openapi:export` | `GET /admin/call-insights` 반영 |

`CallInsightsService` 는 raw SQL 이라 `$queryRaw` 를 목으로 두고
입력 검증·비교 구간 계산·응답 조립·테넌트 조건 포함을 12건으로 고정했다.
**실 DB 대조는 하지 않았다** — 1단계 마이그레이션이 아직 적용되지 않았기 때문이다.

## 남은 것

1단계의 남은 항목(마이그레이션 미적용·실 프로바이더·실 녹취 E2E)이 그대로 남아 있고,
2단계는 여기에 하나 더 붙는다.

4. **인사이트 SQL 의 실 DB 검증.** 특히 `jsonb_array_elements_text` 키워드 집계와
   `LEFT JOIN consultCategories` 의 미분류 행 처리는 실제 데이터로 한 번 확인해야 한다.
