# PBX Smoke Report Template

작성일:
site:
실행자:

## 입력값

| 항목 | 값 |
| --- | --- |
| scenario file |  |
| PBX host:port |  |
| DID |  |
| callerId |  |
| queue |  |
| agent extension |  |
| run summary JSON |  |
| call details CSV |  |

## 실행 결과

| 단계 | 결과 | 증적 |
| --- | --- | --- |
| health before |  | `/api/v1/health` |
| scenario validate |  | `pbx-loadgen validate -f ...` |
| scenario dry-run |  | `pbx-loadgen dry-run -f ...` |
| SIP run |  | `attempted`, `connected`, `failed`, `finalSipCode`, `failureCode` |
| health after |  | `/api/v1/health` |

## CTI DB 확인

| 항목 | 값 |
| --- | --- |
| linkedid |  |
| sessionStatus |  |
| ani |  |
| dnis |  |
| queueName |  |
| primaryAgentId |  |
| queuedAt |  |
| ringingAt |  |
| answeredAt |  |
| endedAt |  |
| talkSeconds |  |

## AMI 이벤트 확인

기대 이벤트:

- `Newchannel`
- `QueueCallerJoin`
- `AgentCalled` 또는 `DialState RINGING`
- `AgentConnect`, `BridgeEnter`, 또는 `ChannelStateDesc=Up` 연결 관측 이벤트
- `Hangup`

관찰 이벤트:

```text

```

## 서버 로그 확인

확인할 패턴:

- `Prisma`
- `25P02`
- `session create raced`
- `Unhandled event`
- `AMI connected`
- `AMI login accepted`
- `AMI socket closed`

결과:

```text

```

## WebSocket 이벤트 확인

기대 이벤트:

- `call.created`
- `call.updated`
- `call.ended`
- `queue.summary.updated`

관찰 이벤트:

```json

```

## 판정

| 실패 위치 | 판단 |
| --- | --- |
| PBX 서버 |  |
| CTI 서버 |  |
| WebSocket |  |
| DB |  |
| 테스트 입력값 |  |

최종 판정:

다음 조치:
