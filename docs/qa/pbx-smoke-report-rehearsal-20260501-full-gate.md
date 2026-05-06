# PBX Smoke Report

createdAt: 2026-05-04 17:46:40
site: rehearsal-20260501-full-gate

## Inputs

| Field | Value |
| --- | --- |
| scenario file | D:\Work\AI_Projects\KAster_CTI\tools\pbx-loadgen\test-templates\sites\rehearsal-20260501-smoke.yaml |
| DID | 07052346380 |
| callerId | 01011112222 |
| queue |  |
| agent extension |  |
| run summary json | D:\Work\AI_Projects\KAster_CTI\reports\rehearsal-20260501-smoke\run-summary-1777884119419036-216240-0.json |
| call details csv | D:\Work\AI_Projects\KAster_CTI\reports\rehearsal-20260501-smoke\call-details-1777884119419036-216240-0.csv |

## Run Result

| Check | Result | Evidence |
| --- | --- | --- |
| health after | collected | /api/v1/health |
| SIP run | attempted=1, connected=1, failed=0 | finalSipCode=200, failureCode=none |

### Health

~~~json
{
    "success":  true,
    "data":  {
                 "status":  "ok",
                 "timestamp":  "2026-05-04T08:46:40.676Z",
                 "instanceId":  "1eb989f2-bc93-42e4-a097-bb640e8f50d3",
                 "leader":  true,
                 "checks":  {
                                "db":  "up",
                                "redis":  "up",
                                "ami":  "connected"
                            },
                 "call":  {
                              "active":  0,
                              "queued":  0,
                              "ringing":  0,
                              "talking":  0,
                              "hold":  0,
                              "transferring":  0,
                              "stuck":  0,
                              "longestWaitingSeconds":  0
                          },
                 "agent":  {
                               "available":  1,
                               "talking":  0,
                               "ringing":  0,
                               "paused":  0,
                               "loggedIn":  1
                           },
                 "queue":  {
                               "waiting":  0,
                               "ringing":  0,
                               "talking":  0,
                               "availableAgents":  1,
                               "longestWaitSeconds":  0
                           }
             },
    "error":  null
}
~~~

### Loadgen Summary

~~~json
{
    "attempted":  1,
    "connected":  1,
    "failed":  0,
    "peakConcurrent":  1,
    "totalScheduleMs":  5000
}
~~~

## CTI DB

~~~json
{
    "callId":  "99b7ae33-0dce-419a-b95a-21dae5832dd7",
    "linkedid":  "1777884113.31",
    "sessionStatus":  "ENDED",
    "ani":  "01011112222",
    "dnis":  "07052346380",
    "queueName":  null,
    "primaryAgentId":  null,
    "queuedAt":  null,
    "ringingAt":  null,
    "answeredAt":  "2026-05-04T08:41:53.531+00:00",
    "endedAt":  "2026-05-04T08:41:58.455+00:00",
    "talkSeconds":  4,
    "createdAt":  "2026-05-04T08:41:53.525+00:00",
    "updatedAt":  "2026-05-04T08:41:53.525+00:00"
}
~~~

## AMI Events

~~~text
Newchannel	2026-05-04T08:41:53.507+00:00	queue=	agent=	dial=	state=Ring	connected=<unknown>	dest=
RTCPReceived	2026-05-04T08:41:53.514+00:00	queue=	agent=	dial=	state=Up	connected=<unknown>	dest=
VarSet	2026-05-04T08:41:53.527+00:00	queue=	agent=	dial=	state=Ring	connected=<unknown>	dest=
Newexten	2026-05-04T08:41:53.528+00:00	queue=	agent=	dial=	state=Ring	connected=<unknown>	dest=
Newstate	2026-05-04T08:41:53.531+00:00	queue=	agent=	dial=	state=Up	connected=<unknown>	dest=
RTCPReceived	2026-05-04T08:41:58.059+00:00	queue=	agent=	dial=	state=Up	connected=<unknown>	dest=
VarSet	2026-05-04T08:41:58.455+00:00	queue=	agent=	dial=	state=Up	connected=<unknown>	dest=
Hangup	2026-05-04T08:41:58.455+00:00	queue=	agent=	dial=	state=Up	connected=<unknown>	dest=
Newexten	2026-05-04T08:41:58.459+00:00	queue=	agent=	dial=	state=Up	connected=<unknown>	dest=
SoftHangupRequest	2026-05-04T08:41:58.462+00:00	queue=	agent=	dial=	state=Up	connected=<unknown>	dest=
~~~

## Server Logs

Patterns: Prisma, 25P02, session create raced, Unhandled event, AMI connected, AMI login accepted, AMI socket closed

~~~text
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 8:41:53 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 8:41:53 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newexten[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 8:41:53 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event RTCPReceived[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 8:41:58 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event RTCPReceived[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 8:41:58 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 8:41:58 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newexten[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 8:41:58 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event SoftHangupRequest[39m
~~~

## WebSocket Events

~~~json
{
    "startedAt":  "2026-05-04T08:41:51.848Z",
    "endedAt":  "2026-05-04T08:43:27.156Z",
    "connected":  true,
    "eventCount":  6,
    "events":  [
                   {
                       "type":  "socket.connected",
                       "at":  "2026-05-04T08:41:52.166Z",
                       "payload":  {
                                       "id":  "cVLBFPdLTP5VCsGKAAAF"
                                   }
                   },
                   {
                       "type":  "call.created",
                       "at":  "2026-05-04T08:41:55.969Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "99b7ae33-0dce-419a-b95a-21dae5832dd7",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777884113.31",
                                       "queuedAt":  null,
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T08:41:53.525Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  null,
                                       "ringingAt":  null,
                                       "startedAt":  "2026-05-04T08:41:53.524Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T08:41:53.525Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  null,
                                       "customerId":  null,
                                       "resultCode":  null,
                                       "abandonFlag":  false,
                                       "holdSeconds":  0,
                                       "ringSeconds":  0,
                                       "talkSeconds":  0,
                                       "waitSeconds":  0,
                                       "callbackFlag":  false,
                                       "campaignCode":  null,
                                       "resultDetail":  null,
                                       "transferFlag":  false,
                                       "aniNormalized":  "01011112222",
                                       "recordingFlag":  false,
                                       "sessionStatus":  "NEW",
                                       "primaryAgentId":  null,
                                       "latestTransfer":  null,
                                       "customer":  null,
                                       "isMuted":  false
                                   }
                   },
                   {
                       "type":  "queue.summary.updated",
                       "at":  "2026-05-04T08:41:55.983Z",
                       "payload":  [
                                       {
                                           "queueId":  "2370150c-e06a-4a27-9080-7c9846fedb9a",
                                           "queueName":  "Smoke 3999 Queue",
                                           "waitingCount":  0,
                                           "talkingCount":  0,
                                           "availableAgents":  0,
                                           "longestWaitSeconds":  0
                                       },
                                       {
                                           "queueId":  "00000000-0000-0000-0000-000000000101",
                                           "queueName":  "Sales Queue",
                                           "waitingCount":  0,
                                           "talkingCount":  0,
                                           "availableAgents":  0,
                                           "longestWaitSeconds":  0
                                       },
                                       {
                                           "queueId":  "4f2ad187-d0e6-4a6d-89c7-dc6cf7a59168",
                                           "queueName":  "기본 호 분배룰",
                                           "waitingCount":  0,
                                           "talkingCount":  0,
                                           "availableAgents":  1,
                                           "longestWaitSeconds":  0
                                       }
                                   ]
                   },
                   {
                       "type":  "call.updated",
                       "at":  "2026-05-04T08:41:55.987Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "99b7ae33-0dce-419a-b95a-21dae5832dd7",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777884113.31",
                                       "queuedAt":  null,
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T08:41:53.525Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  null,
                                       "ringingAt":  null,
                                       "startedAt":  "2026-05-04T08:41:53.524Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T08:41:53.525Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T08:41:53.531Z",
                                       "customerId":  null,
                                       "resultCode":  null,
                                       "abandonFlag":  false,
                                       "holdSeconds":  0,
                                       "ringSeconds":  0,
                                       "talkSeconds":  0,
                                       "waitSeconds":  0,
                                       "callbackFlag":  false,
                                       "campaignCode":  null,
                                       "resultDetail":  null,
                                       "transferFlag":  false,
                                       "aniNormalized":  "01011112222",
                                       "recordingFlag":  false,
                                       "sessionStatus":  "TALKING",
                                       "primaryAgentId":  null,
                                       "latestTransfer":  null,
                                       "customer":  null,
                                       "isMuted":  false
                                   }
                   },
                   {
                       "type":  "queue.summary.updated",
                       "at":  "2026-05-04T08:41:55.996Z",
                       "payload":  [
                                       {
                                           "queueId":  "2370150c-e06a-4a27-9080-7c9846fedb9a",
                                           "queueName":  "Smoke 3999 Queue",
                                           "waitingCount":  0,
                                           "talkingCount":  0,
                                           "availableAgents":  0,
                                           "longestWaitSeconds":  0
                                       },
                                       {
                                           "queueId":  "00000000-0000-0000-0000-000000000101",
                                           "queueName":  "Sales Queue",
                                           "waitingCount":  0,
                                           "talkingCount":  0,
                                           "availableAgents":  0,
                                           "longestWaitSeconds":  0
                                       },
                                       {
                                           "queueId":  "4f2ad187-d0e6-4a6d-89c7-dc6cf7a59168",
                                           "queueName":  "기본 호 분배룰",
                                           "waitingCount":  0,
                                           "talkingCount":  0,
                                           "availableAgents":  1,
                                           "longestWaitSeconds":  0
                                       }
                                   ]
                   },
                   {
                       "type":  "call.ended",
                       "at":  "2026-05-04T08:41:58.955Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "99b7ae33-0dce-419a-b95a-21dae5832dd7",
                                       "endedAt":  "2026-05-04T08:41:58.455Z",
                                       "queueId":  null,
                                       "linkedid":  "1777884113.31",
                                       "queuedAt":  null,
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T08:41:53.525Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  null,
                                       "ringingAt":  null,
                                       "startedAt":  "2026-05-04T08:41:53.524Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T08:41:53.525Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T08:41:53.531Z",
                                       "customerId":  null,
                                       "resultCode":  null,
                                       "abandonFlag":  false,
                                       "holdSeconds":  0,
                                       "ringSeconds":  0,
                                       "talkSeconds":  4,
                                       "waitSeconds":  0,
                                       "callbackFlag":  false,
                                       "campaignCode":  null,
                                       "resultDetail":  null,
                                       "transferFlag":  false,
                                       "aniNormalized":  "01011112222",
                                       "recordingFlag":  false,
                                       "sessionStatus":  "ENDED",
                                       "primaryAgentId":  null
                                   }
                   },
                   {
                       "type":  "queue.summary.updated",
                       "at":  "2026-05-04T08:41:58.963Z",
                       "payload":  [
                                       {
                                           "queueId":  "2370150c-e06a-4a27-9080-7c9846fedb9a",
                                           "queueName":  "Smoke 3999 Queue",
                                           "waitingCount":  0,
                                           "talkingCount":  0,
                                           "availableAgents":  0,
                                           "longestWaitSeconds":  0
                                       },
                                       {
                                           "queueId":  "00000000-0000-0000-0000-000000000101",
                                           "queueName":  "Sales Queue",
                                           "waitingCount":  0,
                                           "talkingCount":  0,
                                           "availableAgents":  0,
                                           "longestWaitSeconds":  0
                                       },
                                       {
                                           "queueId":  "4f2ad187-d0e6-4a6d-89c7-dc6cf7a59168",
                                           "queueName":  "기본 호 분배룰",
                                           "waitingCount":  0,
                                           "talkingCount":  0,
                                           "availableAgents":  1,
                                           "longestWaitSeconds":  0
                                       }
                                   ]
                   },
                   {
                       "type":  "socket.disconnected",
                       "at":  "2026-05-04T08:43:27.156Z",
                       "payload":  {
                                       "reason":  "io client disconnect"
                                   }
                   }
               ],
    "errors":  [

               ]
}
~~~

## Verdict

| Area | Judgment |
| --- | --- |
| Health | PASS: db/redis/ami are healthy |
| PBX server | PASS: SIP call connected with 200 and no failure |
| CTI server | PASS: call session reached ENDED with required routing fields, answer, and talk time |
| DB | PASS: callSessions row found for linkedid 1777884113.31 |
| AMI events | PASS: newchannel, connected, and hangup events observed |
| Server logs | PASS: no error patterns found |
| WebSocket | PASS: call.created, call.updated, and call.ended observed |

Final verdict: PASS

Next action: Use this smoke as deployment gate evidence; run a queue-specific gate when stable SIP registration is required.
