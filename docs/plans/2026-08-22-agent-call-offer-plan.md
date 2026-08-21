# 상담원 호 수락/거절 구현 계획

**작성일**: 2026-08-22
**상태**: 승인 대기

## 무엇을 만드는가

큐가 상담원 전화기를 바로 울리는 대신, **서버가 먼저 상담원 앱에 호를 제안하고 수락한 경우에만
전화기로 넘긴다.** 전화기 자동응답은 그대로 두므로 상담원은 클릭 한 번으로 받는다 —
수화기를 들 필요가 없다.

사용자 결정(2026-08-22): "그전에 상담원에게 수락, 거절 여부를 물어봐야함.
수락한 경우에 해당 상담원에게 호를 전달해야 함." 방식은 **앱에서 수락 → 자동응답 유지**.

## 지금 무슨 일이 일어나는가

실측(2026-08-21 22:34, Asterisk verbose 로그):

```
Called PJSIP/1001
PJSIP/1001-00000006 is ringing
PJSIP/1001-00000006 answered          ← 같은 초
Started music on hold, class 'default'
Stopped music on hold                 ← 같은 초
```

전화기가 자동응답이라 큐 대기가 0초다. 발신자는 대기음을 한 조각 듣고 곧바로 브리지된다.
상담원이 판단할 지점 자체가 없다.

## 왜 Local 채널인가

`Queue()` 는 **멤버 채널이 응답해야** 발신자와 브리지한다. 지금은 멤버가 `PJSIP/1001` 이라
전화기가 응답하는 순간이 곧 브리지다. 그 사이에 확인 단계를 넣을 자리가 없다.

멤버를 `Local/1001@agent-offer` 로 바꾸면, Local 채널은 그 안의 `Dial(PJSIP/1001)` 이
응답할 때까지 응답하지 않는다. **수락 전까지 발신자는 큐에 남아 대기음을 계속 듣는다.**
정확히 원하는 동작이고, 큐 분배 전략·통계·오버플로우를 그대로 유지한다.

### 검토했으나 버린 대안

| 대안 | 버린 이유 |
|---|---|
| `agent-pre-bridge` gosub 안에서 확인 | gosub 는 멤버가 **응답한 뒤** 돈다. 그 시점엔 이미 MOH 가 멈춰 있어(로그로 확인) 상담원이 고민하는 동안 발신자는 무음을 듣는다 |
| 큐를 버리고 서버가 직접 분배 | 큐 전략·통계·오버플로우·pause 를 전부 다시 만들어야 한다 |
| 전화기 자동응답 끄고 SIP NOTIFY(talk) 로 원격 응답 | 기종이 `Event: talk` 을 지원해야 한다. 사용자가 자동응답 유지를 선택했다 |

## 흐름

```
발신자 → queue-entry → Queue(default-distribution)
                          │
                          └─ member => Local/1001@agent-offer
                                        │
                                  [agent-offer]
                                   1. UserEvent(KasterAgentOffer)
                                        → 서버가 WS 로 상담원 앱에 제안 push
                                   2. AGI 훅으로 서버에 롱폴 (최대 OFFER_TIMEOUT 초)
                                        → ACCEPT / REJECT / TIMEOUT
                                   3. ACCEPT → Dial(PJSIP/1001)   (자동응답 → 즉시 통화)
                                      그 외 → Hangup()            (Queue 가 다음 멤버로)
```

대기 중 발신자는 큐에 남아 있으므로 **대기음이 끊기지 않는다.**

## 함께 고쳐야 하는 것 (전수)

멤버 인터페이스가 `PJSIP/1001` → `Local/1001@agent-offer` 로 바뀌면 AMI 이벤트의
`Interface` 값이 바뀐다. 이 값을 쓰는 곳을 **한 번에 전부** 고친다. 한쪽만 고치면
증상이 사라져서 더 나빠진다.

| 지점 | 현재 | 조치 |
|---|---|---|
| `session-engine.service.ts` `resolvePrimaryAgentId` | `^PJSIP\/` 만 벗기고 `-` 앞을 취함 | `Local/1001@...` 도 내선으로 환원 |
| `call-leg.util.ts` `classifyLeg` / `getChannelEndpointName` | `PJSIP/` 전제 | `Local/` 채널 분류 규칙 추가 |
| `AsteriskManagerService.setQueuePaused` | `PJSIP/{ext}` 로 pause | 렌더된 멤버 인터페이스와 같은 문자열로 |
| `queues.renderer.ts` | `member => PJSIP/{ext}` | `member => Local/{ext}@agent-offer` |
| 당겨받기 / 통화제어 leg 선택 | `legType === 'agent'` | Local leg 가 추가로 생기므로 실제 단말 leg 를 골라야 함 |
| `agent-pre-bridge` gosub (MixMonitor) | 멤버 채널에서 실행 | 녹취 대상이 Local 채널이 되지 않도록 확인 |

**녹취는 실측으로 확인한다.** 렌더러 테스트만으로 완료 처리하지 않는다.

## 새로 만드는 것

### 서버

| 파일 | 책임 |
|---|---|
| `modules/calls/agent-offer.service.ts` | 제안 레지스트리. Redis `offer:{tenantId}:{linkedid}:{ext}` = PENDING, TTL = 타임아웃 |
| `modules/calls/agent-offer.controller.ts` | 상담원 결정: `POST /client/call-commands/offer/:offerId/accept` \| `/reject` (JWT) |
| `modules/calls/agent-offer-internal.controller.ts` | AGI 롱폴: `POST /internal/agent-offer/wait` (`KASTER_INTERNAL_SECRET`) |

**멀티노드**: 롱폴 대기와 상담원 결정이 서로 다른 노드에 붙을 수 있다.
결정은 `EventBusService`(Redis Pub/Sub)로 전파하고, 대기 중인 노드가 그것을 받아 응답한다.
Redis 장애 시 폴백은 타임아웃(= 다음 상담원으로) — 조용히 멈추지 않는다.

### PBX

| 파일 | 책임 |
|---|---|
| `renderers/agent-dialplan.renderer.ts` | `[agent-offer]` context 생성 |
| `kaster-agent-offer.agi` | 서버 롱폴 후 `SET VARIABLE KASTER_OFFER_RESULT ACCEPT\|REJECT\|TIMEOUT` |

기존 `kaster-smart-ars-hook.sh` / guarded-digit AGI 와 같은 패턴을 따른다.
`System()` 이 아니라 **AGI** 인 이유: `SYSTEMSTATUS` 는 성공/실패 2가지뿐이라
ACCEPT/REJECT/TIMEOUT 3가지를 구분할 수 없다.

### 클라이언트 (`apps/desktop-win`)

| 파일 | 책임 |
|---|---|
| `Core/Contracts/CallOffer.cs` | 제안 DTO |
| `Core/Server/CtiServerClient.cs` | `AcceptOfferAsync` / `RejectOfferAsync` |
| `ViewModels/SoftphoneViewModel.cs` | `AcceptOfferCommand` / `RejectOfferCommand`, 남은 시간 카운트다운 |
| `Views/OfferView.xaml` | 지사 · 고객번호 · 큐 + 수락/거절. **스크롤 금지 제약 유지** |

## 열린 질문

1. **제안 타임아웃**: 몇 초? 짧으면 상담원이 놓치고, 길면 발신자가 오래 기다린다. 기본 10초 제안.
2. **동시 제안**: 한 호를 여러 상담원에게 동시에 제안(먼저 누른 사람)할 것인가, 한 명씩 순차인가?
   큐 전략(`leastrecent`)을 살리려면 순차가 자연스럽다. 기본 순차 제안.
3. **거절 누적**: 연속 거절 시 자동 이석 처리할 것인가? (`autopause=yes` 가 이미 켜져 있다)
4. **실기기만 있고 앱이 꺼져 있는 상담원**: 제안을 받을 수단이 없다. 앱 미접속이면 확인을
   건너뛰고 바로 전화기를 울릴 것인가, 아니면 큐 멤버에서 제외할 것인가?

## 작업 순서

1. Local 채널 전환의 영향 지점을 **먼저** 고치고, 멤버는 그대로 둔 채 테스트를 통과시킨다
   (기존 동작 회귀 없음 확인)
2. `[agent-offer]` context + AGI 훅 — 항상 ACCEPT 를 돌려주는 stub 으로 먼저 붙인다
3. 큐 멤버를 Local 로 전환 → 실 PBX 에서 기존 통화 경로 전수 재검증
   (인입 · 발신 · 당겨받기 · 마이크끄기 · 끊기 · 녹취 · 이석)
4. 서버 제안 레지스트리 + 롱폴 + WS 이벤트
5. 클라이언트 수락/거절 UI
6. 실통화 검증 후 QA 문서 기록

각 단계는 TDD 로 진행하고, 3단계는 **실 PBX 검증 없이 완료 처리하지 않는다.**

## 남아 있는 별건

이번 조사 중 발견했으나 이 계획의 범위가 아닌 것:

- `custom/queue_timeout` 음원이 서버에 없다. 큐 45초 초과 시 안내 없이 끊긴다
- ARS 안내 멘트가 느리다는 제보. 음원 자체는 정상(16bit/8kHz/mono, 15초)이라 녹음 재작업 사안
- `AsteriskDid` 11개 중 9개에 지사 매핑이 없다
