# PBX Smoke Report

createdAt: 2026-05-04 18:31:54
site: rehearsal-20260501-queue-ws-gate-last

## Inputs

| Field | Value |
| --- | --- |
| scenario file | D:\Work\AI_Projects\KAster_CTI\tools\pbx-loadgen\test-templates\sites\rehearsal-20260501-smoke.yaml |
| DID | 07052346380 |
| callerId | 01011112222 |
| queue | smoke-3999 |
| agent extension | 3999 |
| run summary json | D:\Work\AI_Projects\KAster_CTI\reports\rehearsal-20260501-smoke\run-summary-1777887027946693-24812-0.json |
| call details csv | D:\Work\AI_Projects\KAster_CTI\reports\rehearsal-20260501-smoke\call-details-1777887027946693-24812-0.csv |

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
                 "timestamp":  "2026-05-04T09:31:54.569Z",
                 "instanceId":  "347d0807-9a59-45ee-8f81-17b1d2f0eb46",
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
    "callId":  "49488545-f978-42c4-abd4-ebbc4551363a",
    "linkedid":  "1777887022.43",
    "sessionStatus":  "ENDED",
    "ani":  "01011112222",
    "dnis":  "07052346380",
    "queueName":  "smoke-3999",
    "primaryAgentId":  "ec367ab9-c755-44ba-b241-c011d83b2aa0",
    "queuedAt":  "2026-05-04T09:30:22.058+00:00",
    "ringingAt":  "2026-05-04T09:30:22.172+00:00",
    "answeredAt":  "2026-05-04T09:30:22.058+00:00",
    "endedAt":  "2026-05-04T09:31:26.07+00:00",
    "talkSeconds":  64,
    "createdAt":  "2026-05-04T09:30:22.078+00:00",
    "updatedAt":  "2026-05-04T09:30:22.078+00:00"
}
~~~

## AMI Events

~~~text
Newchannel	2026-05-04T09:30:22.017+00:00	queue=	agent=	dial=	state=Ring	connected=<unknown>	dest=
Newexten	2026-05-04T09:30:22.017+00:00	queue=	agent=	dial=	state=Ring	connected=<unknown>	dest=
NewConnectedLine	2026-05-04T09:30:22.019+00:00	queue=	agent=	dial=	state=Ring	connected=3999	dest=
Newstate	2026-05-04T09:30:22.028+00:00	queue=	agent=	dial=	state=Ringing	connected=01011112222	dest=
MixMonitorStart	2026-05-04T09:30:22.028+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
Newexten	2026-05-04T09:30:22.035+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
AgentConnect	2026-05-04T09:30:22.042+00:00	queue=smoke-3999	agent=PJSIP/3999	dial=	state=Ring	connected=3999	dest=3999
VarSet	2026-05-04T09:30:22.043+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
NewConnectedLine	2026-05-04T09:30:22.073+00:00	queue=	agent=	dial=	state=Ringing	connected=01011112222	dest=
VarSet	2026-05-04T09:30:22.074+00:00	queue=	agent=	dial=	state=Ring	connected=<unknown>	dest=
DialState	2026-05-04T09:30:22.087+00:00	queue=	agent=	dial=RINGING	state=Ring	connected=3999	dest=3999
QueueCallerJoin	2026-05-04T09:30:22.121+00:00	queue=smoke-3999	agent=	dial=	state=Ring	connected=<unknown>	dest=
Newstate	2026-05-04T09:30:22.137+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
DialEnd	2026-05-04T09:30:22.137+00:00	queue=	agent=	dial=ANSWER	state=Ring	connected=3999	dest=3999
QueueCallerLeave	2026-05-04T09:30:22.14+00:00	queue=smoke-3999	agent=	dial=	state=Ring	connected=3999	dest=
Newchannel	2026-05-04T09:30:22.15+00:00	queue=	agent=	dial=	state=Down	connected=<unknown>	dest=
BridgeEnter	2026-05-04T09:30:22.15+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
AgentCalled	2026-05-04T09:30:22.172+00:00	queue=smoke-3999	agent=PJSIP/3999	dial=	state=Ring	connected=<unknown>	dest=3999
BridgeEnter	2026-05-04T09:30:22.173+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
DialBegin	2026-05-04T09:30:22.183+00:00	queue=	agent=	dial=	state=Ring	connected=<unknown>	dest=3999
HangupRequest	2026-05-04T09:31:26.04+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
VarSet	2026-05-04T09:31:26.047+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
VarSet	2026-05-04T09:31:26.049+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
BridgeLeave	2026-05-04T09:31:26.051+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
SoftHangupRequest	2026-05-04T09:31:26.054+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
Newexten	2026-05-04T09:31:26.056+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
AgentComplete	2026-05-04T09:31:26.058+00:00	queue=smoke-3999	agent=PJSIP/3999	dial=	state=Up	connected=3999	dest=3999
BridgeLeave	2026-05-04T09:31:26.065+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
Hangup	2026-05-04T09:31:26.07+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
Hangup	2026-05-04T09:31:26.074+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
~~~

## Server Logs

Patterns: Prisma, 25P02, session create raced, Unhandled event, AMI connected, AMI login accepted, AMI socket closed

~~~text
kaster-rehearsal-20260501-server  | Prisma schema loaded from prisma/schema.prisma
kaster-rehearsal-20260501-server  | [32m[Nest] 1  - [39m05/04/2026, 9:29:42 AM [32m    LOG[39m [38;5;3m[AmiConnectionService] [39m[32mAMI connected 172.20.0.1:5038[39m
kaster-rehearsal-20260501-server  | [32m[Nest] 1  - [39m05/04/2026, 9:29:42 AM [32m    LOG[39m [38;5;3m[AmiConnectionService] [39m[32mAMI login accepted[39m
kaster-rehearsal-20260501-server  | Prisma schema loaded from prisma/schema.prisma
kaster-rehearsal-20260501-server  | [32m[Nest] 1  - [39m05/04/2026, 9:29:53 AM [32m    LOG[39m [38;5;3m[AmiConnectionService] [39m[32mAMI connected 172.20.0.1:5038[39m
kaster-rehearsal-20260501-server  | [32m[Nest] 1  - [39m05/04/2026, 9:29:53 AM [32m    LOG[39m [38;5;3m[AmiConnectionService] [39m[32mAMI login accepted[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:30:01 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:30:13 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:30:22 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event MixMonitorStart[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:30:22 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newexten[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:30:22 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:30:22 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newstate[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:30:22 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newexten[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:30:22 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event NewConnectedLine[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:30:22 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:30:22 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event NewConnectedLine[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:30:22 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95msession create raced for linkedid=1777887022.43; retrying as update[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:30:22 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event DialEnd[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:30:22 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event QueueCallerLeave[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:30:22 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event DialBegin[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:30:44 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:31:26 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:31:26 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:31:26 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event SoftHangupRequest[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:31:26 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newexten[39m
~~~

## WebSocket Events

~~~json
{
    "startedAt":  "2026-05-04T09:26:36.793Z",
    "endedAt":  "2026-05-04T09:28:16.933Z",
    "connected":  true,
    "eventCount":  6,
    "events":  [
                   {
                       "type":  "socket.connected",
                       "at":  "2026-05-04T09:26:36.936Z",
                       "payload":  {
                                       "id":  "dPdwlK55ScJl-ak4AAAD"
                                   }
                   },
                   {
                       "type":  "call.created",
                       "at":  "2026-05-04T09:26:44.071Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "1749488a-2358-47cb-9093-86d175a74e08",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777886802.41",
                                       "queuedAt":  null,
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T09:26:42.653Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  null,
                                       "ringingAt":  null,
                                       "startedAt":  "2026-05-04T09:26:42.652Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T09:26:42.653Z",
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
                       "at":  "2026-05-04T09:26:44.087Z",
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
                       "at":  "2026-05-04T09:26:44.087Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "1749488a-2358-47cb-9093-86d175a74e08",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777886802.41",
                                       "queuedAt":  null,
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T09:26:42.653Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  null,
                                       "ringingAt":  null,
                                       "startedAt":  "2026-05-04T09:26:42.652Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T09:26:42.653Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T09:26:42.684Z",
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
                       "at":  "2026-05-04T09:26:44.106Z",
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
                       "at":  "2026-05-04T09:26:50.061Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "1749488a-2358-47cb-9093-86d175a74e08",
                                       "endedAt":  "2026-05-04T09:26:47.569Z",
                                       "queueId":  null,
                                       "linkedid":  "1777886802.41",
                                       "queuedAt":  null,
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T09:26:42.653Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  null,
                                       "ringingAt":  null,
                                       "startedAt":  "2026-05-04T09:26:42.652Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T09:26:42.653Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T09:26:42.684Z",
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
                       "at":  "2026-05-04T09:26:50.084Z",
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
                       "at":  "2026-05-04T09:28:16.933Z",
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
| DB | PASS: callSessions row found for linkedid 1777887022.43 |
| AMI events | PASS: queue, ringing, connected, and hangup events observed |
| Server logs | FAIL: fatal server log pattern found |
| WebSocket | PASS: call.created, call.updated, and call.ended observed |

Final verdict: FAIL

Next action: Investigate failed areas before deployment.
