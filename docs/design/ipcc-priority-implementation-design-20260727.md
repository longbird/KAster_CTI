# IPCC 우선순위 구현 설계

작성일: 2026-07-27
대상 문서: `C:\Users\Admin\Downloads\IPCC구성도_송부용 (2).pdf`
대상 저장소: `D:\Work\AI_Projects\KAster_CTI`

## 1. 목표와 범위

이 설계의 목표는 PDF 요구사항 검토에서 나온 우선순위 4개를 실제 구현 가능한 단위로 쪼개는 것이다.

우선순위는 다음 순서로 둔다.

1. IVR/Queue 대기 초과 시 AI센터 전환
2. 콜마너/올플릿 접수 및 배차 API 연동
3. 녹취 수집, 보관, 장애복구, 암호화 파이프라인
4. 보안 및 이중화 운영 설계

현재 구현에서 재사용할 수 있는 기반은 다음과 같다.

- DID, IVR 메뉴, Queue, 착신전환, 스마트 ARS, 수신거부, 트렁크 설정
- AMI 이벤트 정규화, `callSessions`, `callLegs`, `queueEvents`
- Redis leader election, Redis Pub/Sub, event outbox
- 상담원 앱의 발신, 전환, 끊기, 상태 변경, 고객 screen pop
- 관리자 앱의 대시보드, 통화내역, 녹취 목록, 권한 관리

이번 설계에서 제외하는 것은 다음과 같다.

- 실시간 통화 감청 기능. 기존 판단대로 구현하지 않는다.
- PBX 제품명과 UI 카피에서 `Asterisk` 노출 확대. UI/문서에는 `PBX`를 사용한다.
- 특정 통신사 SIP TR 상세값 확정. 실제 SIP TR 값은 현장 회선 정보 확정 후 반영한다.
- 국가정보원 CC, ISMS-P 등 인증 획득 자체. 이 설계는 인증 준비에 필요한 기술 통제만 다룬다.

## 2. 제안 모듈 구조

### 2.1 Queue Overflow / AI 전환

현재 `AFTER_QUEUE_WAIT` 착신전환은 DID가 `directQueue`인 경우에만 자연스럽게 동작한다. PDF의 핵심 흐름은 `DID -> IVR -> 1번 대리 Queue -> 25초 후 AI센터`이므로 Queue 자체에 overflow 정책을 두어야 한다.

신규 서버 모듈:

- `apps/server/src/modules/queue-overflow/queue-overflow.module.ts`
- `apps/server/src/modules/queue-overflow/queue-overflow.service.ts`
- `apps/server/src/modules/queue-overflow/queue-overflow-policy.resolver.ts`

기존 모듈 변경:

- `QueuesService`: Queue 생성/수정 시 overflow 정책 저장
- `AsteriskReloadService`: Queue별 overflow 정책을 dialplan renderer input에 포함
- `dialplan.renderer.ts`: `[queue-entry]`, `[queue-exit]`, `[queue-overflow-*]` 렌더링 확장
- `QueueCreateModal.tsx`, `QueueEditModal.tsx`: overflow 대상과 대기 시간 입력 UI 추가

핵심 설계:

- Queue별로 `AFTER_WAIT`, `NO_READY`, `TIMEOUT` 정책을 둘 수 있게 한다.
- `Queue(${QUEUE_NAME},...,${QUEUE_TIMEOUT_SECS})` 종료 후 `QUEUESTATUS=TIMEOUT`이면 Queue별 overflow context로 이동한다.
- DID별 착신전환의 `FORWARD_AFTER_QUEUE_ENABLED`가 있으면 기존 DID 전환을 우선 적용하고, 없으면 Queue overflow를 적용한다.
- AI센터가 전화번호 또는 SIP endpoint라면 `EXTERNAL_NUMBER` 또는 `SIP_URI`로 처리한다. 추후 API 기반 AI 라우팅이 필요하면 `AI_CENTER` target type을 adapter로 연결한다.

### 2.2 콜마너/올플릿 연동

현재 `IntegrationsService`는 설정 저장과 테스트 POST 중심이다. 운영 이벤트에서 콜마너/올플릿 API를 호출하는 별도 outbox가 필요하다.

신규 서버 모듈:

- `apps/server/src/modules/dispatch-integrations/dispatch-integrations.module.ts`
- `apps/server/src/modules/dispatch-integrations/dispatch-integration.service.ts`
- `apps/server/src/modules/dispatch-integrations/dispatch-outbox.service.ts`
- `apps/server/src/modules/dispatch-integrations/adapters/callmaner.adapter.ts`
- `apps/server/src/modules/dispatch-integrations/adapters/allfleet.adapter.ts`
- `apps/server/src/modules/dispatch-integrations/dto/create-dispatch-order.dto.ts`

기존 모듈 변경:

- `OutboxPublisherService`: `call.created`, `call.updated`, `call.answered`, `call.ended` 계열 payload를 dispatch outbox로 넘길 수 있는 hook 추가
- `SessionEngineService`: `AgentConnect` 또는 `BridgeEnter` 시점에 `call.answered` 성격의 내부 이벤트를 명확히 만든다.
- `CallsController`: 상담APP에서 접수 데이터 생성용 `POST /calls/:callId/dispatch-order` 추가
- `apps/web`: 상담APP에서 출발지, 목적지, 요청사항, 서비스 유형을 저장하고 전송하는 UI 추가

핵심 설계:

- 서비스 유형은 Queue 기준으로 판정한다. 예: `queues.serviceType = DRIVER | QUICK | B2B | UNKNOWN`.
- `DRIVER`는 콜마너 adapter, `QUICK`은 올플릿 adapter로 라우팅한다.
- 외부 API 호출은 반드시 DB outbox 기반으로 처리한다.
- 멱등키는 `tenantId + callId + serviceType + eventType + orderRevision`으로 만든다.
- 외부 API 실패는 상담원 콜 제어를 막지 않고, UI에는 `연동 실패/재시도 가능` 상태를 표시한다.

### 2.3 녹취 파이프라인

현재 PBX dialplan은 `MixMonitor`를 시작할 수 있고, 관리자는 녹취 목록/재생/다운로드/감사 일부를 사용할 수 있다. 하지만 PDF 요구의 1콜 1파일, 손실률 0 기준 검증, 로컬 보관 후 재전송, 3년 보관/일 삭제, 암호화, 화자분리는 별도 파이프라인이 필요하다.

신규 서버 모듈:

- `apps/server/src/modules/recording-pipeline/recording-pipeline.module.ts`
- `apps/server/src/modules/recording-pipeline/recording-finalizer.service.ts`
- `apps/server/src/modules/recording-pipeline/recording-storage.service.ts`
- `apps/server/src/modules/recording-pipeline/recording-retention.service.ts`
- `apps/server/src/modules/recording-pipeline/recording-encryption.service.ts`
- `apps/server/src/modules/recording-pipeline/recording-reconcile.service.ts`

기존 모듈 변경:

- `SessionRecoverySweeperService`: 종료 세션 finalization과 녹취 finalization을 분리한다.
- `callRecordings`: 녹취 상태, checksum, 암호화, 보관만료, segment 정보를 확장한다.
- `CallsController`: encrypted local file stream/download 처리. 권한 모델은 기존 `reports/recordings:view/export` 유지.

핵심 설계:

- 통화 종료 직후 `callSessions.sessionStatus=ENDED`는 soft close로 보고, 녹취 파일 size/checksum이 확정되면 `FINALIZED`로 본다.
- 파일이 없거나 size 0이면 `FAILED`로 두고 재수집 job을 만든다.
- 원본 파일은 spool 영역에 두고, finalizer가 checksum 및 암호화 후 storage 영역으로 이동한다.
- 1콜 1파일은 `primaryRecordingId` 개념으로 보장한다. 전환/복수 leg로 segment가 생기면 segment table에 보관하고 primary mixed file을 별도로 만든다.
- 화자분리는 1차 납품 범위에서는 `PENDING` 상태와 확장 필드만 만들고, 실제 diarization engine은 별도 단계로 둔다.

### 2.4 보안 및 이중화

현재 JWT, 역할, 메뉴 권한, WebRTC DTLS 설정은 있다. PDF의 MFA, 관리자 IP 제한, 네트워크 allowlist, 개인정보/통화로그 암호화 저장, 감사 로그는 별도 보강이 필요하다.

신규/변경 모듈:

- `apps/server/src/modules/security/security.module.ts`
- `apps/server/src/modules/security/admin-ip-allowlist.guard.ts`
- `apps/server/src/modules/security/mfa.service.ts`
- `apps/server/src/modules/security/sensitive-field-crypto.service.ts`
- `apps/server/src/modules/audit/audit.module.ts`
- `apps/server/src/modules/audit/audit-log.service.ts`
- `apps/server/src/modules/ha/ha-health.service.ts`

핵심 설계:

- 관리자 페이지는 역할/메뉴 권한에 더해 IP allowlist guard를 선택 적용한다.
- supervisor/admin은 MFA 정책을 켤 수 있게 하고, 첫 단계는 TOTP로 둔다.
- SIP trunk password, agent SIP password, 외부연동 secret, 녹취 파일 key는 `SensitiveFieldCryptoService`를 통해 암호화한다.
- 로그인, 설정 변경, PBX reload, 녹취 stream/download, 외부연동 재시도는 audit log를 남긴다.
- HA는 앱 코드만으로 완료되지 않는다. Postgres, Redis, PBX, 녹취 storage, SIP trunk, 방화벽, VPN 구성까지 운영 설계가 필요하다.

## 3. 도메인 엔티티 / Prisma 모델 후보

### 3.1 Queue Overflow

```prisma
model queueOverflowRules {
  queueOverflowRuleId String   @id @default(uuid()) @db.Uuid
  tenantId            String   @db.Uuid
  queueId             String   @db.Uuid
  triggerMode         String   @db.VarChar(32) // AFTER_WAIT | NO_READY | TIMEOUT
  waitSeconds         Int?
  targetType          String   @db.VarChar(32) // QUEUE | EXTENSION | EXTERNAL_NUMBER | SIP_URI | AI_CENTER
  targetValue         String   @db.VarChar(128)
  resultCode          String?  @db.VarChar(32) // AI_OVERFLOW, QUEUE_OVERFLOW
  enabled             Boolean  @default(true)
  priority            Int      @default(100)
  createdAt           DateTime @default(now()) @db.Timestamptz(6)
  updatedAt           DateTime @updatedAt @db.Timestamptz(6)

  tenant              tenants  @relation(fields: [tenantId], references: [tenantId], onDelete: Cascade)
  queue               queues   @relation(fields: [queueId], references: [queueId], onDelete: Cascade)

  @@index([tenantId, queueId, enabled])
}
```

`queues.maxWaitSeconds`는 대시보드 임계값으로 이미 사용되므로, overflow 동작 자체는 `queueOverflowRules.waitSeconds`로 분리한다. 운영자가 대시보드 경고 기준과 실제 AI 전환 시간을 다르게 둘 수 있어야 하기 때문이다.

### 3.2 Dispatch Integration

```prisma
model dispatchIntegrationEndpoints {
  dispatchIntegrationEndpointId String   @id @default(uuid()) @db.Uuid
  tenantId                      String   @db.Uuid
  systemCode                    String   @db.VarChar(32) // CALLMANER | ALLFLEET
  serviceType                   String   @db.VarChar(32) // DRIVER | QUICK
  baseUrl                       String   @db.Text
  authType                      String   @db.VarChar(32) // NONE | API_KEY | HMAC | BASIC
  encryptedSecret               String?  @db.Text
  enabled                       Boolean  @default(true)
  timeoutMs                     Int      @default(5000)
  createdAt                     DateTime @default(now()) @db.Timestamptz(6)
  updatedAt                     DateTime @updatedAt @db.Timestamptz(6)

  @@unique([tenantId, systemCode, serviceType])
}

model dispatchOrderRequests {
  dispatchOrderRequestId String   @id @default(uuid()) @db.Uuid
  tenantId               String   @db.Uuid
  callId                 String   @db.Uuid
  linkedid               String   @db.VarChar(32)
  serviceType            String   @db.VarChar(32)
  customerPhone          String?  @db.VarChar(32)
  payload                Json
  requestStatus          String   @default("DRAFT") @db.VarChar(32)
  revision               Int      @default(1)
  createdByAgentId       String?  @db.Uuid
  createdAt              DateTime @default(now()) @db.Timestamptz(6)
  updatedAt              DateTime @updatedAt @db.Timestamptz(6)

  @@index([tenantId, callId])
  @@index([tenantId, linkedid])
}

model dispatchDeliveryOutbox {
  dispatchDeliveryOutboxId String   @id @default(uuid()) @db.Uuid
  tenantId                 String   @db.Uuid
  dispatchOrderRequestId   String?  @db.Uuid
  callId                   String?  @db.Uuid
  eventType                String   @db.VarChar(64)
  targetSystem             String   @db.VarChar(32)
  idempotencyKey           String   @db.VarChar(128)
  payload                  Json
  status                   String   @default("PENDING") @db.VarChar(32)
  attempts                 Int      @default(0)
  nextAttemptAt            DateTime @default(now()) @db.Timestamptz(6)
  lastError                String?
  deliveredAt             DateTime? @db.Timestamptz(6)
  createdAt                DateTime @default(now()) @db.Timestamptz(6)
  updatedAt                DateTime @updatedAt @db.Timestamptz(6)

  @@unique([tenantId, idempotencyKey])
  @@index([tenantId, status, nextAttemptAt])
}
```

`integrationAutomations`는 관리자 테스트/일반 webhook 용도로 유지하고, 배차 연동은 업무 계약이 강한 별도 모델로 분리한다.

### 3.3 Recording Pipeline

`callRecordings` 확장 후보:

```prisma
model callRecordings {
  // 기존 필드 유지
  recordingStatus       String   @default("PENDING") @db.VarChar(32)
  encryptionStatus      String   @default("NONE") @db.VarChar(32)
  encryptedFilePath     String?
  keyRef                String?  @db.VarChar(128)
  retentionUntil        DateTime? @db.Timestamptz(6)
  finalizedAt           DateTime? @db.Timestamptz(6)
  failureReason         String?
  speakerSeparationStatus String @default("NOT_REQUESTED") @db.VarChar(32)
}
```

신규 후보:

```prisma
model recordingFinalizeJobs {
  recordingFinalizeJobId String   @id @default(uuid()) @db.Uuid
  tenantId               String   @db.Uuid
  callId                 String   @db.Uuid
  linkedid               String   @db.VarChar(32)
  recFile                String
  status                 String   @default("PENDING") @db.VarChar(32)
  attempts               Int      @default(0)
  nextAttemptAt          DateTime @default(now()) @db.Timestamptz(6)
  lastError              String?
  createdAt              DateTime @default(now()) @db.Timestamptz(6)
  updatedAt              DateTime @updatedAt @db.Timestamptz(6)

  @@unique([tenantId, linkedid, recFile])
  @@index([tenantId, status, nextAttemptAt])
}

model recordingRetentionPolicies {
  recordingRetentionPolicyId String   @id @default(uuid()) @db.Uuid
  tenantId                   String   @db.Uuid
  retentionDays              Int      @default(1095)
  deleteMode                 String   @default("DAILY_SWEEP") @db.VarChar(32)
  enabled                    Boolean  @default(true)
  createdAt                  DateTime @default(now()) @db.Timestamptz(6)
  updatedAt                  DateTime @updatedAt @db.Timestamptz(6)

  @@unique([tenantId])
}
```

### 3.4 Security / Audit

```prisma
model auditLogs {
  auditLogId  String   @id @default(uuid()) @db.Uuid
  tenantId    String?  @db.Uuid
  actorId     String?  @db.Uuid
  actorRole   String?  @db.VarChar(32)
  action      String   @db.VarChar(64)
  resource    String   @db.VarChar(128)
  resourceId  String?  @db.VarChar(128)
  clientIp    String?  @db.VarChar(64)
  userAgent   String?  @db.VarChar(255)
  success     Boolean  @default(true)
  detail      Json?
  createdAt   DateTime @default(now()) @db.Timestamptz(6)

  @@index([tenantId, createdAt(sort: Desc)])
  @@index([tenantId, actorId, createdAt(sort: Desc)])
  @@index([tenantId, action, createdAt(sort: Desc)])
}

model adminIpAllowlistEntries {
  adminIpAllowlistEntryId String   @id @default(uuid()) @db.Uuid
  tenantId                String   @db.Uuid
  cidr                    String   @db.VarChar(64)
  description             String?
  enabled                 Boolean  @default(true)
  createdAt               DateTime @default(now()) @db.Timestamptz(6)
  updatedAt               DateTime @updatedAt @db.Timestamptz(6)

  @@index([tenantId, enabled])
}
```

## 4. 이벤트 흐름

### 4.1 AI센터 Queue Overflow

```text
PSTN
  -> PBX inbound DID
  -> IVR digit 1 or 2
  -> queue-entry(queueName)
  -> Queue(queueName, timeout=overflow.waitSeconds)
  -> QUEUESTATUS=TIMEOUT
  -> queue-overflow-{queueName}
  -> transfer-target / AI_CENTER endpoint
  -> AMI Queue timeout / transfer events
  -> SessionEngine updates resultCode=AI_OVERFLOW
  -> eventOutbox call.updated
  -> Redis Pub/Sub
  -> 상담APP and admin dashboard
```

정합성 기준:

- Queue overflow가 발생하면 `callSessions.transferFlag=true` 또는 별도 `overflowFlag=true`를 기록한다.
- `resultCode`는 `AI_OVERFLOW`로 고정한다.
- 상담원 재연결 요구가 있으면 AI센터 종료 이벤트를 별도 AMI/웹훅으로 받아 `REQUEUE_FROM_AI` 흐름을 추가한다. 1차 구현은 AI 전환까지만 완료 기준으로 둔다.

### 4.2 콜마너/올플릿 연동

```text
AMI AgentConnect or BridgeEnter
  -> SessionEngine call answered
  -> eventOutbox call.answered
  -> DispatchIntegrationService resolves serviceType from queue
  -> dispatchDeliveryOutbox enqueue SCREEN_POP or CALL_CONNECTED
  -> DispatchOutboxService sends to CALLMANER or ALLFLEET
  -> success: deliveredAt set
  -> failure: attempts++, nextAttemptAt backoff
  -> Realtime event integration.delivery.updated
```

상담APP 접수 데이터 흐름:

```text
상담원 입력
  -> POST /calls/:callId/dispatch-order
  -> dispatchOrderRequests upsert revision
  -> dispatchDeliveryOutbox enqueue ORDER_CREATE or ORDER_UPDATE
  -> adapter sends to external system
  -> result reflected in 상담APP
```

실패 처리:

- 4xx는 계약 오류로 보고 `FAILED_CONTRACT` 처리한다.
- 408/429/5xx/network error는 backoff 재시도한다.
- 상담원 화면에는 실패 상태와 재시도 버튼을 제공한다.
- 같은 call/order revision의 중복 전송은 idempotency key로 차단한다.

### 4.3 녹취 Finalization

```text
PBX MixMonitor starts
  -> REC_FILE set in channel variable / CDR userfield
  -> call ended
  -> recordingFinalizeJobs enqueue
  -> leader RecordingFinalizerService checks file exists / size / checksum
  -> optional encrypt
  -> callRecordings READY
  -> callSessions finalizationStatus FINALIZED
  -> recording.ready event
```

장애 처리:

- 파일 없음: `recordingStatus=MISSING`, 재시도
- size 0: `recordingStatus=FAILED_ZERO_BYTES`, 운영 알림
- checksum 실패: `recordingStatus=FAILED_CHECKSUM`
- storage 이동 실패: spool 유지, `nextAttemptAt` 갱신
- 다운로드는 기존 `callRecordingAccessAuditLogs`와 신규 `auditLogs` 둘 다 남긴다.

### 4.4 보안 / HA

```text
HTTP request
  -> AdminIpAllowlistGuard, optional by tenant policy
  -> JwtAuthGuard
  -> RolesGuard
  -> MenuPermissionService
  -> AuditLogService around mutating/export/operate action
```

HA health 흐름:

```text
HealthSummaryService
  -> DB
  -> Redis
  -> AMI
  -> PBX config directory
  -> recording storage
  -> dispatch endpoint dry health
  -> TTS provider health
```

## 5. 장애/정합성 포인트

### Queue Overflow

- 현재 DID directQueue 전용 `AFTER_QUEUE_WAIT`와 Queue-level overflow가 충돌할 수 있다. 우선순위는 `DID forwarding override > Queue overflow default`로 고정한다.
- IVR entry에서 Queue로 들어온 통화도 같은 overflow 정책을 적용해야 한다.
- `Queue()` timeout 값이 Queue별 overflow 시간과 다르면 실제 전환이 안 된다. renderer input에서 queue timeout을 overflow rule 기준으로 계산한다.
- AI센터 전환 후 상담원 재연결은 별도 이벤트 계약 없이는 완료 판단이 어렵다. 1차는 AI센터 전환 요청 accepted와 AMI transfer event까지만 검증한다.

### Dispatch Integration

- 콜마너/올플릿 API 계약이 미확정이면 adapter interface만 먼저 고정하고 mock adapter로 E2E를 만든다.
- 외부 API가 느려도 통화 제어와 상담APP 반응을 막으면 안 된다.
- 상담원이 같은 콜에서 접수 내용을 여러 번 수정할 수 있으므로 revision과 idempotency key가 필요하다.
- 고객 전화번호, 출발지, 목적지는 개인정보로 보고 payload 로그에 원문을 남기지 않는다. 원문 payload는 DB 암호화 또는 최소 마스킹 정책을 적용한다.

### Recording

- `MixMonitor` 시작과 DB row 생성이 원자적이지 않다. 종료 후 reconciliation이 필수다.
- 파일 경로는 PBX 서버 로컬 경로와 CTI 서버 접근 경로가 다를 수 있다. `recordingStorage.service.ts`에서 root mapping을 관리한다.
- 1콜 1파일 요구는 전환/상담전환/복수 leg 상황에서 깨질 수 있다. primary mixed file과 segments를 분리한다.
- 3년 보관 후 삭제는 법무/고객사 정책에 따라 hold 예외가 필요하다.

### Security / HA

- MFA와 IP allowlist는 운영자 lockout 위험이 있으므로 break-glass admin 계정 또는 emergency bypass 절차가 필요하다.
- Secret 암호화 도입 시 기존 평문 값 migration과 rollback 계획이 필요하다.
- HA는 앱 코드만으로 완료되지 않는다. DB failover, Redis failover, PBX active/standby, 녹취 storage replication, VPN/firewall 정책이 같이 필요하다.

## 6. 구현 우선순위

### M1. Queue Overflow to AI

완료 기준:

- Queue 설정에서 overflow target과 wait seconds를 저장한다.
- IVR entry로 들어온 Queue도 25초 후 AI센터로 전환된다.
- PBX config preview에 `[queue-overflow-*]` context가 보인다.
- renderer unit test와 service validation test가 통과한다.

권장 구현 순서:

1. Prisma model `queueOverflowRules` 추가
2. Queue DTO/API에 `overflowRules` 추가
3. admin Queue modal에 overflow UI 추가
4. `AsteriskReloadService` input 확장
5. `dialplan.renderer.ts`에 Queue overflow 렌더링 추가
6. `dialplan.renderer.spec.ts`에 IVR -> Queue -> AI transfer 케이스 고정

### M2. Dispatch Integration Outbox

완료 기준:

- 콜마너/올플릿 endpoint 설정을 저장한다.
- 상담APP에서 접수 payload를 저장하고 외부 시스템으로 전송한다.
- 실패 시 outbox retry와 UI 상태 표시가 가능하다.
- mock adapter 기준 E2E 테스트가 있다.

권장 구현 순서:

1. `dispatchIntegrationEndpoints`, `dispatchOrderRequests`, `dispatchDeliveryOutbox` migration
2. `DispatchIntegrationService`와 adapter interface 구현
3. `POST /calls/:callId/dispatch-order` API 추가
4. dispatch outbox sweeper 구현
5. 상담APP 접수 폼과 전송 상태 표시
6. 콜마너/올플릿 실제 계약값 반영

### M3. Recording Finalization

완료 기준:

- 통화 종료 후 녹취 파일 존재/size/checksum 검증 job이 돈다.
- 정상 파일은 `READY`, 문제 파일은 실패 상태와 재시도 상태로 남는다.
- 다운로드/재생은 암호화 저장 파일도 처리한다.
- 3년 보관 정책과 일 삭제 sweeper 초안이 동작한다.

권장 구현 순서:

1. `callRecordings` 상태 필드 확장
2. `recordingFinalizeJobs` migration
3. `RecordingFinalizerService` leader-only sweeper
4. local storage root mapping과 checksum 검증
5. AES-256-GCM file encryption 옵션
6. retention sweeper

### M4. Prompt TTS

완료 기준:

- 관리자가 멘트 텍스트를 입력하면 음성 파일이 생성되고 `AsteriskPrompt`로 등록된다.
- TTS 실패 시 기존 prompt에는 영향이 없다.
- PBX reload 전 미리보기와 파일 존재 검증이 가능하다.

구현 상태 (2026-07-27):

- `promptGenerationJobs`로 생성 요청, provider, 실패 원인, 생성 파일 크기, 연결된 prompt를 기록한다.
- `POST /asterisk-config/prompts/tts`에서 텍스트 기반 멘트를 생성하고 기존 `AsteriskPrompt`로 즉시 등록한다.
- 기본 provider는 `local-wav`이며 운영 흐름 검증용 WAV를 생성한다. 실제 자연음성 provider는 `PROMPT_TTS_PROVIDER=http-json`, `PROMPT_TTS_HTTP_URL`, 선택적 `PROMPT_TTS_HTTP_TOKEN`으로 연결한다.
- 관리자 `멘트 관리`의 신규 등록 모달에서 텍스트 입력 후 바로 생성할 수 있다.

권장 구현 순서:

1. [x] `promptGenerationJobs` model 추가
2. [x] `PromptTtsService` provider adapter 추가
3. [x] `POST /asterisk-config/prompts/tts` 추가
4. [x] Prompt modal에 텍스트 생성 UI 추가
5. [x] 생성 파일 format 변환 및 reload 검증 초안

### M5. Security / HA Hardening

완료 기준:

- 관리자 IP allowlist, MFA, audit log가 단계적으로 적용된다.
- 운영 health가 DB/Redis/AMI 외에 recording storage, dispatch endpoint, TTS provider를 포함한다.
- secret 암호화 migration 계획과 rollback 계획이 문서화된다.

권장 구현 순서:

1. `auditLogs`, `adminIpAllowlistEntries` migration
2. `AuditLogService`와 controller interceptor 적용
3. IP allowlist guard를 admin/settings 계열부터 적용
4. TOTP MFA opt-in
5. `SensitiveFieldCryptoService` 도입
6. HA runbook 작성 및 smoke test 자동화

## 7. 바로 생성할 파일 목록

### M1

- `apps/server/prisma/migrations/<date>_queue_overflow_rules/migration.sql`
- `apps/server/src/modules/queue-overflow/queue-overflow.module.ts`
- `apps/server/src/modules/queue-overflow/queue-overflow.service.ts`
- `apps/server/src/modules/queue-overflow/queue-overflow-policy.resolver.ts`
- `apps/server/src/modules/queues/dto/queue-overflow-rule.dto.ts`
- `apps/server/src/modules/asterisk-config/renderers/dialplan.renderer.spec.ts`
- `apps/admin/src/features/queue-settings/QueueOverflowFields.tsx`

### M2

- `apps/server/prisma/migrations/<date>_dispatch_integrations/migration.sql`
- `apps/server/src/modules/dispatch-integrations/dispatch-integrations.module.ts`
- `apps/server/src/modules/dispatch-integrations/dispatch-integration.service.ts`
- `apps/server/src/modules/dispatch-integrations/dispatch-outbox.service.ts`
- `apps/server/src/modules/dispatch-integrations/adapters/dispatch-adapter.ts`
- `apps/server/src/modules/dispatch-integrations/adapters/callmaner.adapter.ts`
- `apps/server/src/modules/dispatch-integrations/adapters/allfleet.adapter.ts`
- `apps/server/src/modules/dispatch-integrations/dto/create-dispatch-order.dto.ts`
- `apps/web/src/components/DispatchOrderPanel.tsx`

### M3

- `apps/server/prisma/migrations/<date>_recording_pipeline/migration.sql`
- `apps/server/src/modules/recording-pipeline/recording-pipeline.module.ts`
- `apps/server/src/modules/recording-pipeline/recording-finalizer.service.ts`
- `apps/server/src/modules/recording-pipeline/recording-storage.service.ts`
- `apps/server/src/modules/recording-pipeline/recording-retention.service.ts`
- `apps/server/src/modules/recording-pipeline/recording-encryption.service.ts`
- `apps/server/src/modules/recording-pipeline/recording-reconcile.service.ts`

### M4

- `apps/server/prisma/migrations/<date>_prompt_tts_jobs/migration.sql`
- `apps/server/src/modules/asterisk-config/prompt-tts.service.ts`
- `apps/server/src/modules/asterisk-config/dto/create-prompt-tts.dto.ts`
- `apps/admin/src/features/prompt-settings/PromptTtsPanel.tsx`

### M5

- `apps/server/prisma/migrations/<date>_security_audit_hardening/migration.sql`
- `apps/server/src/modules/security/security.module.ts`
- `apps/server/src/modules/security/admin-ip-allowlist.guard.ts`
- `apps/server/src/modules/security/mfa.service.ts`
- `apps/server/src/modules/security/sensitive-field-crypto.service.ts`
- `apps/server/src/modules/audit/audit.module.ts`
- `apps/server/src/modules/audit/audit-log.service.ts`
- `docs/design/ipcc-ha-security-runbook-20260727.md`

## 구현 착수 전 확인 질문

1. AI센터 전환 대상은 전화번호, SIP URI, 외부 API 중 무엇인가?
2. 25초/0초 기준은 대표번호별인지, Queue별인지, 서비스 유형별인지?
3. 콜마너/올플릿 API 계약서는 최신본이 있는가?
4. 녹취 파일은 PBX 서버 로컬, NAS, S3 호환 스토리지 중 어디를 1차 저장소로 둘 것인가?
5. 보안 요구에서 MFA/IP allowlist는 납품 1차 범위인지, 운영 hardening 범위인지?

## 1차 개발 제안

바로 구현을 시작한다면 M1부터 진행한다. 이유는 M1이 PDF의 핵심 통화 흐름을 막고 있고, DB/API/UI/dialplan/test가 작게 닫히며, M2와 M3이 의존할 `serviceType`, `resultCode`, `overflowFlag` 기준을 먼저 고정할 수 있기 때문이다.
