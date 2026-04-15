# KAster_CTI 운영 아키텍처 (멀티노드·Redis·장애복구)

> 원본: ChatGPT 대화 `69ddf94f-d6c8-83a2-8236-4057a00c0b18` — "운영 가능한 시스템 설계"  
> `docs/chatgpt-archive/conversations.json` 에서 추출.

단일 노드 프로토타입에서 **멀티노드 + Redis 리더 선출 + 이벤트 정합성 + 장애복구**를 갖춘 운영 수준 아키텍처로 확장하기 위한 설계 원전 문서입니다. 현재 `apps/server/src/modules/redis/*`, `outbox/*`, `session-recovery/*` 모듈의 존재 이유가 전부 이 대화에서 출발합니다.

---

## 💬 질문 1

“실제 운영 가능한 수준 (멀티노드 + Redis + 이벤트 정합성 보강 + 장애복구 포함)” 완성판 이어서 만들어

## 🤖 답변 6

운영 레벨 기준으로 바로 이어서 붙일 수 있게, 이번에는 코드 조각보다 상위 설계와 구현 기준을 한 단계 더 끌어올려 정리하겠습니다. 멀티노드, Redis, 이벤트 정합성, 장애복구, 운영 절차까지 한 번에 이어서 맞물리도록 구성하겠습니다.

## 🤖 답변 7

좋습니다.  
아래는 기존 **NestJS + Prisma + AMI Session Engine + WebSocket Gateway** 완성판 위에 바로 이어붙이는 형태의

# **실제 운영 가능한 수준 완성판**
## **멀티노드 + Redis + 이벤트 정합성 보강 + 장애복구 포함**

버전입니다.

기존 설계의 핵심 원칙인 **Asterisk는 통화 제어에 집중하고, CTI Middleware가 AMI 이벤트를 linkedid 중심 세션으로 정규화한다**는 방향을 그대로 유지하되, 운영 단계에서는 여기에 **수평 확장, 중복 이벤트 제어, 재기동 복구, 리플레이, Redis 기반 fan-out, 리더 선출, idempotent upsert, outbox/inbox 패턴**이 추가되어야 합니다. 이 확장 방향은 업로드된 설계서의 linkedid 중심 세션 모델, raw 이벤트와 정규화 결과 분리 저장, AMI 재접속 후 상태 재동기화 원칙과도 일치합니다. fileciteturn0file1 fileciteturn0file2

---

# 1. 운영 목표 재정의

단일 서버에서 “동작하는 시스템”과  
운영 환경에서 “버티는 시스템”은 다릅니다.

운영 수준에서는 다음 4가지를 만족해야 합니다.

1. **어떤 노드가 죽어도 통화 상태 정합성이 크게 무너지지 않을 것**
2. **AMI 이벤트가 중복 수신·역순 도착·일시 유실되어도 세션이 복원될 것**
3. **웹소켓 서버가 여러 대여도 상담원 화면이 동일 상태를 보게 할 것**
4. **Asterisk/앱/DB/Redis 중 일부 장애 시에도 복구 절차가 명확할 것**

기존 문서에서 제시된 `raw_ami_events`, `call_sessions`, `call_legs`, `queue_events` 분리 전략은 이 운영 목표의 기반이 됩니다. 운영판에서는 여기에 **이벤트 처리 계층을 더 세분화**해야 합니다. fileciteturn0file2

---

# 2. 권장 운영 아키텍처

## 2.1 전체 구성

```text
                ┌───────────────────────────────┐
                │         SIP Trunk / DID       │
                └───────────────┬───────────────┘
                                │
                     ┌──────────▼──────────┐
                     │   Asterisk Node A   │
                     │   Queue / Dialplan  │
                     │   AMI / MixMonitor  │
                     └──────────┬──────────┘
                                │ AMI
                     ┌──────────▼──────────┐
                     │   Asterisk Node B   │
                     │   Queue / Dialplan  │
                     │   AMI / MixMonitor  │
                     └──────────┬──────────┘
                                │
        ┌───────────────────────┼────────────────────────┐
        │                       │                        │
┌───────▼────────┐    ┌────────▼────────┐     ┌─────────▼────────┐
│ CTI App Node 1 │    │ CTI App Node 2  │     │ CTI App Node 3   │
│ API / WS / AMI │    │ API / WS / AMI  │     │ API / WS / AMI   │
│ Event Consumer │    │ Event Consumer  │     │ Event Consumer   │
└───────┬────────┘    └────────┬────────┘     └─────────┬────────┘
        │                      │                         │
        └──────────────┬───────┴──────────────┬─────────┘
                       │                      │
              ┌────────▼────────┐    ┌───────▼─────────┐
              │  Redis Cluster   │    │ PostgreSQL HA   │
              │ PubSub / Streams │    │ Primary/Replica │
              │ Lock / Cache     │    │ WAL / Backup    │
              └────────┬─────────┘    └───────┬─────────┘
                       │                      │
               ┌───────▼────────┐     ┌──────▼──────────┐
               │ Recording Store │     │ Monitoring/Alert│
               │ NAS / S3 / NFS  │     │ Prom/Grafana    │
               └─────────────────┘     └─────────────────┘
```

---

## 2.2 노드 역할

### Asterisk 노드
- SIP, Queue, Dialplan, RTP, 녹취 담당
- 업무 상태를 보관하지 않음
- 가능하면 **RTP 품질 확보를 위해 앱 서버와 분리**
- 트렁크/Queue/내선 처리 전담

### CTI App 노드
- REST API
- WebSocket Gateway
- AMI Connector
- Session Engine
- Agent State Service
- Redis Pub/Sub fan-out
- DB persistence
- 장애 시 다른 앱 노드가 인계 가능

### Redis
- WebSocket 브로드캐스트 백플레인
- 노드 간 세션 invalidation
- 분산 락
- dedupe 키
- replay cursor 캐시
- 선택적으로 Redis Streams 기반 이벤트 버퍼

### PostgreSQL
- 최종 정합성의 소스 오브 트루스
- raw 이벤트 저장소
- session snapshot 저장소
- 운영 리포트/감사 로그 저장소

이 구조는 기존 설계서의 **PBX/App/DB 분리 권장 구성**과 직접 연결됩니다. fileciteturn0file1

---

# 3. 멀티노드 전략

운영 레벨에서 가장 중요한 질문은 이겁니다.

## “AMI는 모든 앱 노드가 동시에 붙어도 되나?”

정답은 **붙을 수는 있지만, 처리 책임은 분리해야 한다**입니다.

### 권장안
- 모든 CTI App 노드가 모든 Asterisk 노드에 AMI 연결을 맺을 수 있음
- 하지만 **특정 Asterisk 노드의 raw event ingest 책임은 한 리더만 수행**
- 나머지 앱 노드는 standby 또는 command/API/WS 전용 역할 수행

즉,

- `asterisk-a` → `cti-leader-for-asterisk-a`
- `asterisk-b` → `cti-leader-for-asterisk-b`

형태로 **Asterisk별 리더 선출**을 합니다.

---

## 3.1 리더 선출 방식

Redis 분산 락 사용:

```text
lock key: leader:ami:asterisk-a
value: node-2
ttl: 15s
renew every: 5s
```

리더만 하는 일:
- 해당 PBX 노드 AMI raw event 수신
- `raw_ami_events` 저장
- Redis Pub/Sub 또는 Stream으로 표준 이벤트 발행
- 주기적 상태 스냅샷 동기화 실행

standby 노드는:
- 리더 락 감시
- 락 만료 시 takeover
- takeover 시 즉시 AMI reconnect + snapshot sync

---

## 3.2 왜 이 구조가 중요한가

모든 앱 노드가 같은 이벤트를 DB에 바로 반영하면:
- duplicate insert
- out-of-order overwrite
- queue summary double count
- websocket duplicate push

가 생깁니다.

따라서 운영판은 반드시 다음 두 단계를 나눠야 합니다.

### 단계 A. Raw ingest
- 한 리더만 raw 이벤트를 ingest

### 단계 B. Normalization / fan-out
- 정규화는 단일 consumer group 또는 strict idempotent consumer로 처리

---

# 4. 이벤트 처리 파이프라인 운영판

기존 MVP 수준은 보통 이렇습니다.

```text
AMI -> SessionEngine -> DB -> WS
```

운영판은 이렇게 바꿔야 합니다.

```text
AMI
 -> Raw Event Ingest
 -> Durable Event Bus
 -> Normalizer / Session Engine
 -> DB Transaction
 -> Outbox
 -> Redis PubSub
 -> WebSocket Gateway
```

---

## 4.1 단계별 책임

### 1) Raw Event Ingest
- 원본 수신 즉시 저장
- payload 원문 보존
- event fingerprint 생성
- replay 가능 상태 확보

### 2) Durable Event Bus
권장 순서:
- 1순위: PostgreSQL + outbox/inbox
- 2순위: Redis Streams
- 3순위: Redis Pub/Sub only 는 보조용

**Pub/Sub만으로는 복구성과 재처리가 약합니다.**

### 3) Normalizer
- 이벤트 순서 보정
- linkedid 기반 세션 병합
- uniqueid leg 보강
- Queue/Bridge/Hangup/Transfer 상호 참조

### 4) DB Transaction
- raw 저장과 normalized 반영을 분리
- session/leg/queue_fact/agent_state upsert
- 정확히 한 번은 어렵더라도 **실질적 once-effect** 보장

### 5) Outbox
- `call.updated`, `agent.status.changed`, `queue.summary.updated`
- commit 이후에만 외부 발행

### 6) WebSocket fan-out
- 모든 노드에 동일 이벤트 전파
- 특정 상담원/tenant/channel room으로 브로드캐스트

---

# 5. 이벤트 정합성 보강 핵심

기존 설계서가 말한 것처럼 운영 핵심은 **이벤트 정합성**입니다. fileciteturn0file1

운영판에서는 아래 8가지를 반드시 넣어야 합니다.

---

## 5.1 이벤트 fingerprint + dedupe

AMI 이벤트는 재접속 시 중복 수신될 수 있고,  
Asterisk 구성에 따라 유사 이벤트가 중첩될 수 있습니다.

예시 fingerprint:

```ts
fingerprint = sha1(
  [
    asteriskNodeId,
    event.Event,
    event.Linkedid || '',
    event.Uniqueid || '',
    event.DestUniqueid || '',
    event.BridgeUniqueid || '',
    event.Channel || '',
    event.DestChannel || '',
    event.Timestamp || '',
  ].join('|'),
);
```

Redis dedupe 키:

```text
dedupe:ami:{fingerprint} = 1 (TTL 6h)
```

DB 측 추가 방어:
```sql
CREATE UNIQUE INDEX uq_raw_ami_event_fingerprint
ON raw_ami_events (tenant_id, event_fingerprint);
```

즉,
- Redis는 빠른 중복 차단
- DB unique index는 최종 방어선

---

## 5.2 linkedid 중심, uniqueid 보조

기존 문서 원칙 그대로, 운영판도 **linkedid를 세션 헤더의 유일 기준**으로 삼아야 합니다. fileciteturn0file2

- `call_sessions` = linkedid 중심
- `call_legs` = uniqueid 중심
- attended transfer 시 leg는 늘어나도 세션은 보통 linkedid 기준으로 유지
- blind transfer도 linkedid continuity를 우선 확인
- Queue 재시도/다중 agent ringing도 linkedid 세션 하위의 leg/event로 처리

---

## 5.3 이벤트 순서 역전 보정

AMI 이벤트는 실제로 다음 상황이 가능합니다.

- `Hangup` 이 `BridgeLeave` 보다 먼저 들어옴
- `AgentComplete` 가 `Hangup` 뒤에 늦게 들어옴
- `QueueCallerLeave` 없이 `Abandon` 성격 종료가 생김
- `BridgeEnter` 두 번, `BridgeLeave` 한 번처럼 짝이 어긋남

해결법은 “이벤트 하나마다 즉시 최종 상태 확정”이 아니라  
**세션 상태 전이 규칙 + 타임윈도우 보정**입니다.

예:

```ts
const SESSION_PRECEDENCE = {
  NEW: 1,
  IVR: 2,
  QUEUED: 3,
  RINGING_AGENT: 4,
  TALKING: 5,
  HOLD: 6,
  TRANSFERRING: 7,
  AFTER_CALL_WORK: 8,
  ENDED: 9,
};
```

하지만 단순 precedence만 쓰면 안 됩니다.  
`ENDED`는 강하지만, 이후 `AgentComplete`가 오면 세션을 죽은 채로 두고 **ACW만 보강**해야 합니다.

즉,
- 세션 상태
- 타임스탬프
- leg 종료 여부
- queue 완료 이벤트 존재 여부
를 함께 봐야 합니다.

---

## 5.4 soft close / hard close

운영판은 `ENDED`를 두 단계로 가져가는 것이 좋습니다.

### soft close
- 주요 leg hangup 확인
- UI에는 종료로 표시
- 하지만 10~30초 동안 후행 이벤트 허용

### hard close
- close grace window 경과
- queue complete / transfer finalize / recording finalize 처리 완료
- 통계 확정

예:

```text
session_status = ENDED
finalization_status = SOFT_CLOSED | FINALIZED
```

이 구조가 있어야
- 늦게 도착한 `AgentComplete`
- 녹취 파일 size 확정
- transfer completion
을 안전하게 반영할 수 있습니다.

---

## 5.5 periodic reconciliation

운영판에서 가장 중요한 안정장치 중 하나입니다.

주기적으로:
- `core show channels concise`
- `queue show`
- `pjsip show endpoints`
- 필요 시 AMI action 결과

를 기준으로 현재 상태를 재동기화합니다.

목적:
- 유령 TALKING 세션 정리
- 이미 종료된 leg 종료 처리
- queue waiting count correction
- agent 상태 stale 정리

즉, 이벤트 기반만 믿지 말고 **스냅샷 보정 루프**를 추가해야 합니다.

기존 설계서의 “AMI 재접속 후 주기적 상태 재동기화” 원칙을 운영 수준으로 구체화한 것입니다. fileciteturn0file1

---

## 5.6 orphan session sweeper

예:
- `RINGING_AGENT` 120초 유지
- `TALKING`인데 bridge 없음
- `QUEUED`인데 queue에 없음
- `AFTER_CALL_WORK` 2시간 유지

이런 세션을 정리해야 합니다.

예시 기준:
- `NEW` 30초 초과 → stale 검사
- `RINGING_AGENT` 90초 초과 → timeout 종료 후보
- `TALKING`인데 active leg 모두 종료 → soft close
- `AFTER_CALL_WORK` 10분 초과 → 강제 종료 + 자동 result code

---

## 5.7 raw replay 가능 구조

운영에서 꼭 필요합니다.

장애 사례:
- Session Engine bug
- 새 attended transfer 매핑 로직 배포
- 특정 기간 queue summary 재계산 필요

이때 `raw_ami_events`를 기준으로 재처리 가능해야 합니다.

재처리 원칙:
- 특정 linkedid 범위 replay
- 특정 기간 replay
- 특정 tenant replay
- dry-run compare 모드 지원

즉, raw event는 단순 감사 로그가 아니라 **복구와 재산출의 근거 데이터**입니다. 이는 업로드 문서의 raw 저장 전략과 직접 맞닿아 있습니다. fileciteturn0file2

---

## 5.8 outbox / inbox 패턴

멀티노드에서 이벤트 중복 발행 방지를 위해 필요합니다.

### outbox_events
DB commit 후 외부 발행할 이벤트

### inbox_events
이미 처리한 외부/내부 이벤트 기록

예시:

```sql
CREATE TABLE outbox_events (
  outbox_id UUID PRIMARY KEY,
  aggregate_type VARCHAR(32) NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  published_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inbox_events (
  inbox_id UUID PRIMARY KEY,
  source_name VARCHAR(64) NOT NULL,
  source_event_id VARCHAR(128) NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_name, source_event_id)
);
```

---

# 6. Redis 활용 설계

Redis는 캐시만이 아니라 **멀티노드 조정 계층**으로 씁니다.

---

## 6.1 Redis 사용 목적

### 필수
- 리더 락
- websocket backplane
- dedupe key
- agent presence cache
- queue summary cache

### 권장
- transient call state cache
- replay cursor
- rate limit
- node heartbeat

### 선택
- Redis Streams 기반 durable handoff

---

## 6.2 Redis 키 설계 예시

```text
leader:ami:asterisk-a -> node-1
leader:ami:asterisk-b -> node-2

dedupe:ami:{fingerprint} -> 1
ttl: 21600

presence:agent:{tenantId}:{agentId} -> JSON
ttl: 120

call:live:{tenantId}:{linkedid} -> JSON
ttl: 3600

queue:summary:{tenantId}:{queueName} -> JSON
ttl: 10

ws:session:{tenantId}:{userId}:{socketId} -> node-3
ttl: 90

node:heartbeat:{nodeId} -> alive
ttl: 15
```

---

## 6.3 WebSocket backplane

모든 노드가 다음 채널을 구독합니다.

```text
pubsub channel:
tenant:{tenantId}:calls
tenant:{tenantId}:agents
tenant:{tenantId}:queues
user:{userId}:screenpop
```

Node 1에서 처리된 `call.updated`가 Redis Pub/Sub로 나가면  
Node 2, Node 3에 붙은 소켓 사용자도 동일 이벤트를 받습니다.

---

# 7. DB 스키마 운영 보강

기존 설계의 `call_sessions`, `call_legs`, `queue_events`, `raw_ami_events`는 유지하고, 운영판에서 아래 컬럼을 더하는 것이 좋습니다. fileciteturn0file2

---

## 7.1 raw_ami_events 보강

```sql
ALTER TABLE raw_ami_events
ADD COLUMN asterisk_node_id VARCHAR(64),
ADD COLUMN event_fingerprint VARCHAR(64),
ADD COLUMN ingest_node_id VARCHAR(64),
ADD COLUMN replayed_from_event_id UUID NULL,
ADD COLUMN processing_status VARCHAR(16) NOT NULL DEFAULT 'NEW'
  CHECK (processing_status IN ('NEW', 'PROCESSED', 'FAILED', 'SKIPPED')),
ADD COLUMN error_message TEXT NULL;
```

인덱스:
```sql
CREATE UNIQUE INDEX uq_raw_ami_fingerprint
ON raw_ami_events(tenant_id, event_fingerprint);

CREATE INDEX idx_raw_ami_node_event_time
ON raw_ami_events(asterisk_node_id, event_time DESC);

CREATE INDEX idx_raw_ami_processing_status
ON raw_ami_events(processing_status, event_time);
```

---

## 7.2 call_sessions 보강

```sql
ALTER TABLE call_sessions
ADD COLUMN finalization_status VARCHAR(16) NOT NULL DEFAULT 'OPEN'
  CHECK (finalization_status IN ('OPEN', 'SOFT_CLOSED', 'FINALIZED')),
ADD COLUMN last_event_at TIMESTAMPTZ NULL,
ADD COLUMN last_event_name VARCHAR(64) NULL,
ADD COLUMN active_leg_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN event_version BIGINT NOT NULL DEFAULT 0,
ADD COLUMN asterisk_node_id VARCHAR(64) NULL,
ADD COLUMN reconciliation_needed BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN recovery_note TEXT NULL;
```

---

## 7.3 call_legs 보강

```sql
ALTER TABLE call_legs
ADD COLUMN bridge_id VARCHAR(64) NULL,
ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN last_state_at TIMESTAMPTZ NULL,
ADD COLUMN hangup_cause VARCHAR(64) NULL,
ADD COLUMN hangup_cause_code VARCHAR(16) NULL;
```

---

## 7.4 queue_events 보강

```sql
ALTER TABLE queue_events
ADD COLUMN event_key VARCHAR(128) NULL,
ADD COLUMN source_event_fingerprint VARCHAR(64) NULL;

CREATE UNIQUE INDEX uq_queue_events_dedupe
ON queue_events(tenant_id, source_event_fingerprint)
WHERE source_event_fingerprint IS NOT NULL;
```

---

## 7.5 운영용 보조 테이블

### node_leases
```sql
CREATE TABLE node_leases (
  lease_key VARCHAR(128) PRIMARY KEY,
  owner_node_id VARCHAR(64) NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
```

### reconciliation_jobs
```sql
CREATE TABLE reconciliation_jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL,
  target_type VARCHAR(32) NOT NULL,
  target_key VARCHAR(128) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  result_summary JSONB NULL
);
```

### dead_letter_events
```sql
CREATE TABLE dead_letter_events (
  dead_letter_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL,
  source_table VARCHAR(64) NOT NULL,
  source_id UUID NULL,
  reason_code VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ NULL
);
```

---

# 8. NestJS 운영 모듈 구조

운영판 모듈은 아래처럼 나누는 것이 좋습니다.

```text
src/
  modules/
    ami/
      ami-connector.service.ts
      ami-leader-election.service.ts
      ami-event-ingest.service.ts
      ami-reconcile.service.ts
    events/
      event-bus.service.ts
      outbox-publisher.service.ts
      inbox-guard.service.ts
      dead-letter.service.ts
    sessions/
      session-engine.service.ts
      session-recovery.service.ts
      session-finalizer.service.ts
      session-sweeper.service.ts
    agents/
      agent-state.service.ts
      agent-presence-cache.service.ts
    websocket/
      redis-ws-adapter.ts
      realtime.gateway.ts
    infra/
      redis.module.ts
      locks.service.ts
      heartbeat.service.ts
      health.service.ts
```

---

# 9. 운영용 핵심 서비스 설계

## 9.1 AmiLeaderElectionService

```ts
@Injectable()
export class AmiLeaderElectionService {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async tryAcquire(pbxNodeId: string, appNodeId: string): Promise<boolean> {
    const key = `leader:ami:${pbxNodeId}`;
    const ok = await this.redis.set(key, appNodeId, 'NX', 'EX', 15);
    return ok === 'OK';
  }

  async renew(pbxNodeId: string, appNodeId: string): Promise<boolean> {
    const key = `leader:ami:${pbxNodeId}`;
    const current = await this.redis.get(key);
    if (current !== appNodeId) return false;
    await this.redis.expire(key, 15);
    return true;
  }

  async isLeader(pbxNodeId: string, appNodeId: string): Promise<boolean> {
    return (await this.redis.get(`leader:ami:${pbxNodeId}`)) === appNodeId;
  }
}
```

---

## 9.2 AmiEventIngestService

책임:
- raw 저장
- dedupe
- durable enqueue

```ts
@Injectable()
export class AmiEventIngestService {
  async ingest(pbxNodeId: string, payload: AmiEventPayload) {
    const fingerprint = this.buildFingerprint(pbxNodeId, payload);

    const deduped = await this.tryFastDedupe(fingerprint);
    if (!deduped) return;

    const raw = await this.prisma.rawAmiEvent.upsert({
      where: {
        tenant_id_event_fingerprint: {
          tenant_id: payload.tenantId,
          event_fingerprint: fingerprint,
        },
      },
      update: {},
      create: {
        tenant_id: payload.tenantId,
        asterisk_node_id: pbxNodeId,
        linkedid: payload.Linkedid ?? null,
        uniqueid: payload.Uniqueid ?? null,
        event_name: payload.Event,
        event_time: this.extractEventTime(payload),
        payload,
        event_fingerprint: fingerprint,
        ingest_node_id: this.nodeId,
      },
    });

    await this.eventBus.publishRawEvent({
      rawEventId: raw.event_id,
      tenantId: payload.tenantId,
      linkedid: payload.Linkedid ?? null,
      eventName: payload.Event,
    });
  }
}
```

---

## 9.3 SessionEngine 운영 규칙

### 원칙
- 상태 전이는 단조 증가가 아니라 “허용 전이 규칙” 기반
- 세션 업데이트는 반드시 transaction
- `event_version` 증가
- 최종 publish는 outbox에 적재

```ts
await this.prisma.$transaction(async (tx) => {
  const session = await tx.callSession.upsert(...);
  const leg = await tx.callLeg.upsert(...);
  await tx.queueEvent.create(...); // if applicable
  await tx.outboxEvent.create({
    data: {
      aggregate_type: 'call_session',
      aggregate_id: session.call_id,
      event_type: 'call.updated',
      payload: normalizedPayload,
    },
  });
});
```

---

## 9.4 SessionRecoveryService

### 역할
- 앱 재시작 시 OPEN 세션 재로드
- soft-closed 미finalized 세션 재처리
- active agent presence 재구성
- queue summary 재계산

```ts
@Injectable()
export class SessionRecoveryService {
  async recoverOnBoot() {
    const sessions = await this.prisma.callSession.findMany({
      where: {
        finalization_status: { in: ['OPEN', 'SOFT_CLOSED'] },
      },
      take: 5000,
      orderBy: { updated_at: 'desc' },
    });

    for (const session of sessions) {
      await this.reconcileSession(session.linkedid);
    }
  }
}
```

---

## 9.5 SessionFinalizerService

```ts
@Injectable()
export class SessionFinalizerService {
  async finalizeEligibleSessions() {
    const candidates = await this.prisma.callSession.findMany({
      where: {
        session_status: 'ENDED',
        finalization_status: { not: 'FINALIZED' },
        ended_at: { lt: new Date(Date.now() - 30_000) },
      },
    });

    for (const session of candidates) {
      await this.finalizeOne(session.call_id);
    }
  }
}
```

---

## 9.6 SessionSweeperService

역할:
- 유령 세션 정리
- stale ringing 정리
- TALKING인데 bridge 없는 세션 검증
- ACW 시간 초과 정리

---

# 10. WebSocket 멀티노드 구성

운영판에서는 단순 메모리 adapter가 아니라  
**Redis adapter** 또는 Redis Pub/Sub bridge를 씁니다.

## 10.1 브로드캐스트 흐름

```text
Normalizer -> outbox -> publisher -> Redis PubSub -> all WS nodes -> room emit
```

## 10.2 룸 설계

```text
tenant:{tenantId}
tenant:{tenantId}:queue:{queueName}
tenant:{tenantId}:agent:{agentId}
user:{userId}
```

## 10.3 screen pop
특정 상담원만 받아야 하는 이벤트는 `user:{userId}` 채널로 발행

## 10.4 주의
웹소켓 세션 상태를 노드 메모리에만 두면 안 됩니다.
최소한:
- socket <-> user 매핑
- node heartbeat
- agent online presence
는 Redis 또는 DB와 동기화해야 합니다.

---

# 11. 장애복구 설계

---

## 11.1 CTI App 노드 다운

### 증상
- 특정 노드 API/WS/AMI 처리 중단

### 대응
- LB가 다른 노드로 라우팅
- Redis leader TTL 만료
- standby 노드가 해당 PBX leader takeover
- recovery service가 OPEN 세션 재동기화
- queue/agent summary 재계산
- UI는 재연결 후 동일 상태 복원

### 필수 조건
- stateless API
- JWT 기반 인증
- WS 재연결 토큰
- Redis backplane

---

## 11.2 Redis 장애

### 증상
- WS fan-out 중단
- 리더 락 불능
- dedupe 캐시 무력화

### 대응
- DB unique index로 중복 최종 방어
- 앱은 degrade mode 진입
- 단일 노드 강제 리더 모드 fallback 가능
- Redis 복구 후 presence/summary 재계산

### 권장
- Redis Sentinel 또는 Redis Cluster
- 최소 3노드
- 앱 health check에서 Redis 상태 분리 노출

---

## 11.3 PostgreSQL 장애

### 증상
- raw 저장 불가
- 세션 업데이트 중단
- API 일부 실패

### 대응
- 쓰기 실패 시 in-memory only 처리는 금지
- raw ingest를 local durable queue 또는 Redis Stream에 임시 적재
- DB 복구 후 drain
- 세션 정규화는 DB commit 성공 기준으로만 publish

### 권장
- PostgreSQL HA
- WAL archive
- PITR
- read replica 분리
- connection pool 제한

---

## 11.4 Asterisk 재시작

기존 설계서에서도 중요 장애 시나리오로 언급된 부분입니다. fileciteturn0file1

### 복구 순서
1. AMI reconnect
2. trunk registration check
3. queue member sync
4. active channel snapshot poll
5. OPEN session reconcile
6. stale session soft close
7. 알림 발송

### 구현 포인트
- `AsteriskNodeHealth` 테이블 또는 Redis state
- reboot detected 시 node generation 증가
- 재기동 전 이벤트와 후 이벤트를 분리 기록

---

## 11.5 녹취 스토리지 장애

### 증상
- MixMonitor 시작은 됐지만 파일 누락
- 파일 크기 0
- 업로드 실패

### 대응
- call_recordings를 바로 finalized 하지 않음
- 종료 후 file exists / size / checksum 검증
- 실패 시 `recording_status=FAILED`
- 운영 알림 + 재수집/백업 큐 등록

---

# 12. 큐 요약 집계 운영판

MVP에서는 이벤트 올 때마다 단순 count 해도 되지만  
운영판은 **실시간 캐시 + 정기 재계산** 이중화가 필요합니다.

## 12.1 summary sources
- Redis cache: 실시간 화면용
- PostgreSQL fact: 정산/리포트용

## 12.2 집계 항목
- waitingCount
- talkingAgents
- availableAgents
- pausedAgents
- longestWaitSeconds
- answeredToday
- abandonedToday
- slaWithin20sRate

## 12.3 업데이트 방식
- 이벤트 수신 시 increment/decrement
- 10초~30초마다 DB 기준 correction
- 노드 failover 후 full rebuild

---

# 13. 상담원 상태 정합성

운영에서 흔한 문제는 “상담원은 TALKING으로 보이는데 실제 통화 없음”입니다.

해결은 상태를 하나의 소스로만 계산하지 않는 것입니다.

## 상태 판단 우선순위
1. active bridge/leg 존재
2. queue/agent event 최근 이력
3. 수동 pause 상태
4. endpoint registration 상태
5. periodic reconciliation 결과

즉 상담원 상태는
- 이벤트 push
- 현재 leg
- 수동 상태
를 합친 **derived state** 로 만들어야 합니다.

---

# 14. 배포 토폴로지 권장안

## 소규모 운영
- Asterisk 2대
- CTI App 2대
- Redis 3노드 Sentinel
- PostgreSQL 1 primary + 1 replica
- Nginx/LB 2대
- 녹취 NAS 또는 S3

## 중간 규모
- Asterisk 2~4대
- CTI App 3~5대
- Redis Cluster
- PostgreSQL HA
- Prometheus + Grafana + Loki
- Object Storage

## 중요
PBX와 App을 같은 서버에 합치지 않는 것이 좋습니다.  
기본 기획서에서도 PBX 전용 서버 분리가 권장됩니다. fileciteturn0file1turn0file0

---

# 15. 운영 필수 모니터링 지표

## Asterisk
- channels active
- bridge count
- queue waiting
- trunk registration
- RTP packet loss / jitter
- MixMonitor failure count

## CTI App
- AMI connected nodes
- leader lease status
- raw ingest TPS
- normalize latency
- outbox backlog
- WS connected clients
- replay queue depth
- dead letter count

## Redis
- memory
- ops/sec
- pubsub subscribers
- keyspace hits/misses
- replication lag

## PostgreSQL
- connections
- slow query
- lock wait
- replication lag
- table bloat
- WAL lag

---

# 16. 운영 시나리오별 상태 전이 규칙

## 16.1 인입 -> Queue -> 응답
```text
NEW
-> IVR
-> QUEUED
-> RINGING_AGENT
-> TALKING
-> AFTER_CALL_WORK
-> ENDED
-> FINALIZED
```

## 16.2 Queue abandon
```text
NEW
-> QUEUED
-> ENDED(abandon_flag=true, result_code='ABANDON')
-> FINALIZED
```

## 16.3 Blind transfer
```text
TALKING
-> TRANSFERRING
-> TALKING (new target leg confirmed)
-> AFTER_CALL_WORK / ENDED
```

## 16.4 Attended transfer
```text
TALKING
-> TRANSFERRING
-> consult leg ringing
-> consult leg talking
-> original bridge leave / new bridge enter
-> TALKING or ENDED
```

운영판에서는 attended transfer를 단순 `Transfer` 이벤트 하나로 판단하면 안 되고,
- `BridgeEnter/Leave`
- `DialBegin/End`
- 새 leg
- 원 leg 종료 시점
을 함께 보아야 합니다.

---

# 17. 재처리·복구 운영 명령 예시

## 17.1 특정 linkedid 재정합
```bash
POST /internal/reconcile/session
{
  "tenantId": "...",
  "linkedid": "1713071001.1234"
}
```

## 17.2 특정 시간대 raw replay
```bash
POST /internal/replay/raw-events
{
  "tenantId": "...",
  "from": "2026-04-14T00:00:00+09:00",
  "to": "2026-04-14T01:00:00+09:00",
  "dryRun": false
}
```

## 17.3 queue summary rebuild
```bash
POST /internal/rebuild/queue-summary
{
  "tenantId": "...",
  "queueName": "sales"
}
```

운영 도구가 있어야 장애 대응이 사람 손으로 가능해집니다.

---

# 18. 실제 코드로 이어질 때 우선 추가할 파일들

다음 단계에서 바로 구현 대상으로 붙이기 좋은 파일 목록은 아래입니다.

```text
src/modules/infra/redis.module.ts
src/modules/infra/locks.service.ts
src/modules/infra/heartbeat.service.ts

src/modules/ami/ami-leader-election.service.ts
src/modules/ami/ami-event-ingest.service.ts
src/modules/ami/ami-reconcile.service.ts

src/modules/events/event-bus.service.ts
src/modules/events/outbox-publisher.service.ts
src/modules/events/inbox-guard.service.ts
src/modules/events/dead-letter.service.ts

src/modules/sessions/session-recovery.service.ts
src/modules/sessions/session-finalizer.service.ts
src/modules/sessions/session-sweeper.service.ts

src/modules/websocket/redis-ws.adapter.ts
src/modules/health/health.controller.ts

prisma/migrations/xxxx_operational_hardening/migration.sql
```

---

# 19. 운영판 핵심 원칙 요약

이 완성판에서 반드시 지켜야 하는 기준은 아래 10개입니다.

1. **세션 기준키는 linkedid**
2. **raw event와 normalized state 분리**
3. **AMI ingest는 PBX별 leader 1개**
4. **DB unique index로 최종 dedupe 보장**
5. **soft close / hard finalize 분리**
6. **periodic reconciliation 필수**
7. **Redis는 cache가 아니라 coordination 계층**
8. **WS fan-out은 Redis backplane 사용**
9. **outbox/inbox로 멀티노드 발행 중복 방지**
10. **raw replay로 복구 가능한 구조 유지**

이 방향은 업로드된 프로젝트 기획서의 Asterisk 22 LTS, CTI Middleware 중심 구조와, 실전 상세 설계서의 linkedid 기반 세션·정합성 처리·장애 대응 원칙을 운영 수준으로 확장한 형태입니다. fileciteturn0file0turn0file1turn0file2

---

다음 답변에서는 이 구조를 바로 코드로 이어서  
**“NestJS + Prisma 기준 실제 운영형 전체 파일셋”** 형태로

- `redis.module.ts`
- `ami-leader-election.service.ts`
- `event-bus.service.ts`
- `outbox-publisher.service.ts`
- `session-recovery/finalizer/sweeper`
- `health controller`
- `Prisma migration.sql`

까지 한 번에 붙여서 작성할 수 있습니다.
