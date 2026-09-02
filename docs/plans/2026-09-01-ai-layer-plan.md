# AI 레이어 도입 구현 계획

작성일: 2026-09-01
근거: 콜브릿지(callbridge.ai) 경쟁 분석 — "AI 없는 CTI" 갭 해소
진행 순서: **1 → 2 → 4** (사용자 결정, 2026-09-01)
AI 배치: **프로바이더 추상화** — 온프레 로컬과 클라우드 API 를 같은 인터페이스로 지원 (사용자 결정, 2026-09-01)

---

## 0. 이 계획이 다루는 범위

| 단계 | 항목 | 이 문서의 상세도 |
|---|---|---|
| 1 | 통화 후 STT + AI 요약·분류·감정 | **실행 가능한 수준까지** |
| 2 | AI 인사이트 대시보드 | 범위 정의 |
| 4 | 비주얼 ARS 플로우 빌더 → dialplan 컴파일 | 범위 정의 |

범위 밖(이 문서에서 다루지 않음): 3번 실시간 STT, 5번 외부 AI 에이전트 브리지, P2 전체.
1번이 서고 나면 3번은 같은 프로바이더 인터페이스를 스트리밍으로 재사용하므로 그때 별도 계획서를 쓴다.

---

## 1단계 — 통화 후 STT + AI 요약·분류·감정

### 1.1 핵심 제약: 암호화가 평문을 지운다

`RecordingEncryptionService.encryptFile()` 은 암호화 직후 `fs.unlink(filePath)` 로 **평문 원본을 삭제**한다
(`recording-encryption.service.ts`). 그리고 `RecordingFinalizerService.finalizeJob()` 은
inspect → playback 변환 → **encrypt** → DB 저장 순서로 돈다.

따라서 STT 를 finalize 파이프라인 **중간에 끼워 넣으면 안 된다**:

- 중간에 끼우면 검증 끝난 finalize 경로를 건드리게 되고, STT 지연(수십 초~수 분)이 녹취 확정을 막는다.
- finalize 는 15초 sweep 이라 STT 가 느려지면 뒤 job 이 밀린다.

**결정 D1 — 별도 모듈, 별도 job 테이블, finalize 이후 실행.**
`modules/call-analysis/` 를 새로 만들고 자체 sweep 을 돌린다. 녹취 파일은
`RecordingEncryptionService.openDecryptedReadStream()`(이미 존재) 으로 읽는다.
암호화가 꺼진 사이트는 `callRecordings.playbackFilePath` / `filePath` 를 그대로 읽는다.

### 1.2 아키텍처 결정

| # | 결정 | 이유 |
|---|---|---|
| D1 | `modules/call-analysis/` 신규 모듈. `recording-pipeline` 은 enqueue 3줄만 추가 | 검증된 finalize 경로 보존, 외과적 변경 |
| D2 | 트리거는 EventBus 구독이 아니라 **DB job 테이블 + 리더 가드 sweep** | Redis Pub/Sub 은 at-most-once. 분석은 재시도·백오프가 필수 |
| D3 | 누락분은 `CallAnalysisReconcileService` 가 줍는다 | `recording-reconcile.service.ts` 와 동일 패턴 |
| D4 | STT/LLM 둘 다 인터페이스 뒤에 두고 env 로 주입 | 사용자 결정. 사이트별 온프레/클라우드 선택 |
| D5 | 로컬·클라우드 LLM 은 **OpenAI 호환 chat completions** 어댑터 하나로 커버. Anthropic 만 별도 | vLLM·Ollama·LM Studio 가 전부 호환 API 를 낸다. 어댑터 수를 늘리지 않는다 |
| D6 | 화자분리는 **diarization 모델 없이 채널 분리**로 한다 | MixMonitor 스테레오라 L=고객 / R=상담원. `speakerSeparationStatus` 필드가 이미 있다 |
| D7 | 기본값 `CALL_ANALYSIS_ENABLED=false` | 기존 운영 사이트 배포에 영향 0 |
| D8 | 전문 저장 전 PII 마스킹(전화번호·카드·주민번호) | 녹취 접근은 감사 대상인데 전문은 텍스트라 유출 표면이 더 넓다 |

### 1.3 파이프라인

```
AMI Hangup
  → recordingFinalizeJobs (기존)
      → finalize: inspect → playback 변환 → encrypt → callRecordings READY
          → callAnalysisJobs enqueue(stage=TRANSCRIBE)   ← 신규 3줄
              → CallAnalysisSweeper (15초, 리더 가드)
                  ├ TRANSCRIBE: 복호 스트림 → 채널 분리 → SttProvider
                  │              → callTranscripts + callTranscriptSegments
                  │              → stage=ANALYZE 로 재적재
                  └ ANALYZE:    전문 → LlmProvider
                                 → callAnalyses (요약·감정·키워드·분류)
                                 → callMemos AI 초안 upsert
                                 → EventBus 'call.analysis.ready'
```

### 1.4 스키마 변경 (신규 마이그레이션 1개)

```prisma
model consultCategories {
  categoryId       String  @id @default(uuid()) @db.Uuid
  tenantId         String  @db.Uuid
  parentCategoryId String? @db.Uuid
  level            Int     // 1=대 2=중 3=소
  code             String  @db.VarChar(64)
  name             String  @db.VarChar(128)
  sortOrder        Int     @default(0)
  isActive         Boolean @default(true)
  @@unique([tenantId, code])
  @@index([tenantId, parentCategoryId, sortOrder])
}

model callTranscripts {
  transcriptId    String  @id @default(uuid()) @db.Uuid
  tenantId        String  @db.Uuid
  callId          String  @db.Uuid
  recordingId     String  @db.Uuid
  provider        String  @db.VarChar(32)
  modelName       String? @db.VarChar(128)
  language        String  @default("ko") @db.VarChar(16)
  fullText        String
  durationSeconds Int     @default(0)
  confidence      Float?
  status          String  @default("READY") @db.VarChar(32)
  failureReason   String?
  @@unique([tenantId, callId, recordingId])
  @@index([tenantId, callId])
}

model callTranscriptSegments {
  segmentId    String @id @default(uuid()) @db.Uuid
  tenantId     String @db.Uuid
  transcriptId String @db.Uuid
  speaker      String @db.VarChar(16)   // CUSTOMER | AGENT | UNKNOWN
  startMs      Int
  endMs        Int
  text         String
  confidence   Float?
  @@index([transcriptId, startMs])
}

model callAnalyses {
  analysisId     String  @id @default(uuid()) @db.Uuid
  tenantId       String  @db.Uuid
  callId         String  @db.Uuid
  transcriptId   String  @db.Uuid
  summary        String
  sentiment      String  @db.VarChar(16)   // POSITIVE | NEUTRAL | NEGATIVE
  sentimentScore Float?
  categoryId     String? @db.Uuid
  keywords       Json?
  riskFlags      Json?
  provider       String  @db.VarChar(32)
  modelName      String? @db.VarChar(128)
  @@unique([tenantId, callId])
  @@index([tenantId, sentiment])
}

model callAnalysisJobs {
  callAnalysisJobId String   @id @default(uuid()) @db.Uuid
  tenantId          String   @db.Uuid
  callId            String   @db.Uuid
  recordingId       String   @db.Uuid
  stage             String   @default("TRANSCRIBE") @db.VarChar(16)
  status            String   @default("PENDING") @db.VarChar(32)
  attempts          Int      @default(0)
  nextAttemptAt     DateTime @default(now()) @db.Timestamptz(6)
  lastError         String?
  @@unique([tenantId, callId, recordingId])
  @@index([tenantId, status, nextAttemptAt])
}
```

모든 테이블에 `tenantId` + `createdAt`/`updatedAt` + `tenants` 관계를 기존 모델과 같은 형태로 붙인다.
기존 마이그레이션은 편집하지 않는다. `npm run prisma:sync` 로 generate + deploy 를 함께 검증한다.

### 1.5 파일 구성

```
src/modules/call-analysis/
  call-analysis.module.ts
  call-analysis.controller.ts
  call-analysis-sweeper.service.ts        + .spec.ts   ← 리더 가드·백오프·stage 전이
  call-analysis-reconcile.service.ts      + .spec.ts
  transcription.service.ts                + .spec.ts   ← 복호 스트림 → 채널 분리 → STT
  analysis.service.ts                     + .spec.ts   ← 전문 → LLM → 요약·감정·분류
  audio/deinterleave-stereo.util.ts       + .spec.ts   ← L/R 채널 분리 (순수 함수)
  pii-mask.util.ts                        + .spec.ts   ← 전화·카드·주민번호 마스킹
  prompts/summarize.prompt.ts                          ← 프롬프트 상수 분리
  providers/
    stt.provider.ts            (interface + DI 토큰)
    llm.provider.ts            (interface + DI 토큰)
    provider.factory.ts        + .spec.ts              ← env → 구현체 선택
    stt/local-whisper.provider.ts       (HTTP, faster-whisper 사이드카)
    stt/openai-whisper.provider.ts
    llm/openai-compatible.provider.ts   (로컬 vLLM/Ollama + OpenAI 공용)
    llm/anthropic.provider.ts
    fake/fake-stt.provider.ts           ← 테스트·개발용
    fake/fake-llm.provider.ts
  dto/
src/modules/consult-categories/          ← 상담분류 CRUD (별도 모듈, 200~400줄)
```

파일당 200~400줄을 넘기지 않는다. 프롬프트는 서비스 안에 인라인하지 않고 `prompts/` 로 뺀다.

### 1.6 프로바이더 인터페이스

```ts
export interface SttProvider {
  readonly name: string;
  transcribe(input: {
    audio: NodeJS.ReadableStream;
    sizeBytes: number;
    format: string;
    language: string;
    speaker: 'CUSTOMER' | 'AGENT' | 'UNKNOWN';
  }): Promise<{ text: string; segments: SttSegment[]; confidence?: number; modelName?: string }>;
}

export interface LlmProvider {
  readonly name: string;
  complete(input: {
    system: string;
    user: string;
    maxTokens: number;
    responseFormat?: 'json';
  }): Promise<{ text: string; modelName?: string }>;
}
```

LLM 응답은 **JSON 스키마로 받고 zod 로 검증**한다(경계 검증 원칙). 파싱 실패 시 job 은 RETRY 로 떨어진다.

### 1.7 env 추가 (`apps/server/.env.example`)

```
CALL_ANALYSIS_ENABLED=false
CALL_ANALYSIS_SWEEP_MS=15000
CALL_ANALYSIS_MAX_JOBS_PER_SWEEP=5
CALL_ANALYSIS_LANGUAGE=ko

CALL_ANALYSIS_STT_PROVIDER=local        # local | openai | fake
CALL_ANALYSIS_STT_ENDPOINT=
CALL_ANALYSIS_STT_MODEL=
CALL_ANALYSIS_STT_API_KEY=

CALL_ANALYSIS_LLM_PROVIDER=local        # local | openai | anthropic | fake
CALL_ANALYSIS_LLM_ENDPOINT=
CALL_ANALYSIS_LLM_MODEL=
CALL_ANALYSIS_LLM_API_KEY=
```

키는 전부 env 에서만 읽고 없으면 부팅이 아니라 **첫 job 실행 시점에** 명확한 에러로 실패시킨다
(`CALL_ANALYSIS_ENABLED=false` 인 사이트가 키 없이도 뜨게).

### 1.8 API

| 메서드 | 경로 | 권한 |
|---|---|---|
| GET | `/calls/:callId/transcript` | 본인 콜 또는 supervisor/admin |
| GET | `/calls/:callId/analysis` | 위와 동일 |
| POST | `/calls/:callId/analysis/retry` | supervisor/admin |
| GET/POST/PATCH/DELETE | `/admin/consult-categories` | admin |

전부 `{ success, data, error }` envelope 유지. 추가 후 `npm run openapi:export`.
메뉴 키를 서버 `common/menu-permission.service.ts` 의 `MENU_KEYS` 와
`apps/admin/src/shared/permissions/menuConfig.tsx` 에 **1:1로** 추가한다.

### 1.9 관리자 UI

- `apps/admin/src/features/history/` 통화 상세에 탭 추가: **요약 / 전문 / 감정**
- 전문은 화자별 말풍선, 세그먼트 클릭 시 녹취 재생 위치 점프
- `agent-settings` 가 아니라 `system-settings` 아래에 상담분류 관리 화면 신설

### 1.10 검증 방법 (완료 판정 근거)

| 주장 | 근거 명령 |
|---|---|
| 스키마 반영 | `npm run prisma:sync` exit 0 |
| 단위 테스트 | `npx jest src/modules/call-analysis` — 실패 0 |
| 전체 회귀 | `cd apps/server && npm test` — 기존 실패 수와 동일 |
| 린트 | `npm run lint` — 0 error |
| 빌드 | `npm run build` — exit 0 |
| 관리자 빌드 | `cd apps/admin && npm test` + `npm run build` |
| OpenAPI 갱신 | `npm run openapi:export` 후 `docs/openapi.json` diff 존재 |

리더 가드는 **Red-Green** 으로 검증한다: 리더가 아닐 때 sweep 이 job 을 집지 않는 테스트를 먼저
실패시키고, 가드를 넣어 통과시킨다.

### 1.11 작업 순서 (TDD)

1. 스키마 + 마이그레이션 → `prisma:sync`
2. `deinterleave-stereo.util` + `pii-mask.util` (순수 함수, spec 먼저)
3. 프로바이더 인터페이스 + fake 구현 + `provider.factory` spec
4. `call-analysis-sweeper` — 리더 가드·백오프·stage 전이 spec 먼저
5. `transcription.service` (복호 스트림 경로 포함) + spec
6. `analysis.service` (zod 검증 포함) + spec
7. `recording-finalizer` 에 enqueue 추가 + reconcile 서비스
8. REST 엔드포인트 + envelope + openapi
9. 상담분류 모듈 + 메뉴 권한 키 (서버·admin 동시)
10. 실 프로바이더 어댑터(local-whisper / openai / anthropic)
11. 관리자 UI 탭

1~9 는 실제 AI 호출 없이 fake 프로바이더로 전부 검증 가능하다. 10 이 되어야 외부 의존이 생긴다.

### 1.12 리스크

| 리스크 | 대응 |
|---|---|
| 한국어 통화 STT 정확도 (8kHz 전화 대역) | 10단계에서 실 녹취로 프로바이더별 비교. 계획 단계에서 단정하지 않는다 |
| 로컬 whisper GPU 사양 | 사이드카를 별도 컨테이너로 분리해 CPU 폴백 허용. server 컨테이너에 모델을 넣지 않는다 |
| LLM 비용 (클라우드 선택 시) | 전문 길이 상한 + 요약 1회만 호출. 통화당 1콜을 넘기지 않는다 |
| 전문에 남는 개인정보 | D8 마스킹 + 전문 조회도 `callRecordingAccessAuditLogs` 와 같은 감사 로그를 남긴다 |

---

## 2단계 — AI 인사이트 대시보드 (범위)

1단계로 `callAnalyses` 가 쌓인 뒤 착수한다.

- 재활용: `modules/trends/`(snapshot-builder, snapshot-rollup, trend-query), `dashboardSnapshots`
- 추가 지표: 상담주제 분포, 감정 추이, 급상승 키워드(기간 대비 증가율), 분류별 평균 통화시간
- 화면: `apps/admin/src/features/trends/` 에 탭 추가. **`live-calls` 와 같은 화면 안에 둔다** — 콜브릿지는 실시간 현황과 AI 분석이 분리돼 있고, 통합이 우리 차별점이다
- ~~집계는 `dashboardSnapshots` 롤업에 넣는다~~ → **틀렸다. 조회 시점 집계로 한다.**
  `dashboardSnapshots` 는 분당 *순간 상태*(대기호·상담원 상태·트렁크) 스냅샷이지 통화 결과 롤업이 아니다.
  분석 결과는 통화 종료 뒤에 도착하므로 통화 시각 기준 스냅샷에 넣으면 늦게 온 분석이 영원히 빠진다.
  `TrendQueryService.readCallBuckets` 가 호 인입/응답/포기에 이미 쓰는 방식(요청 시점 집계)을 그대로 따른다 (2026-09-01 확인)

## 4단계 — 비주얼 ARS 플로우 빌더 (범위)

- 재활용: `asterisk-config/renderers/dialplan`, `asterisk-config-validation.ts`, `asterisk-reload.service.ts`, `configVersions` / `configApplyStatus` / `configEmergencyChanges`
- 현재 `AsteriskIvrMenu` / `AsteriskIvrEntry` 는 단층이라 다단계 분기·API 조회·조건 라우팅이 없다 → 플로우 그래프 모델 신설
- 파이프라인: 관리자 그래프 편집 → 검증 → **dialplan conf 컴파일** → diff 확인 → AMI reload
- 실 PBX 를 건드리는 경로이므로 이 저장소에서 가장 위험하다. 별도 설계서를 먼저 쓴다
- 렌더러를 고칠 때는 짝 `*.renderer.spec.ts` 를 반드시 함께 갱신하고, 로컬 테스트만으로 완료 처리하지 않는다

---

## 승인 요청

1단계 1.1~1.12 로 착수해도 되는지 확인이 필요하다. 특히 아래 3개는 되돌리기 비싼 결정이다.

- **D1** — recording-pipeline 을 건드리지 않고 별도 모듈로 분리
- **D6** — 화자분리를 diarization 모델 없이 스테레오 채널 분리로 처리
- **D7** — 기본 비활성(`CALL_ANALYSIS_ENABLED=false`)
