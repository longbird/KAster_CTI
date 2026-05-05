# PBX Smoke Report

createdAt: 2026-05-05 09:39:00
site: rehearsal-20260501-config-apply-gate-classified

## Inputs

| Field | Value |
| --- | --- |
| scenario file | D:\Work\AI_Projects\KAster_CTI\tools\pbx-loadgen\test-templates\sites\rehearsal-20260501-smoke.yaml |
| DID | 07052346380 |
| callerId | 01011112222 |
| queue | smoke-3999 |
| agent extension | 3999 |
| run summary json | D:\Work\AI_Projects\KAster_CTI\reports\rehearsal-20260501-smoke\run-summary-1777936532647521-174796-0.json |
| call details csv | D:\Work\AI_Projects\KAster_CTI\reports\rehearsal-20260501-smoke\call-details-1777936532647521-174796-0.csv |

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
                 "timestamp":  "2026-05-05T00:39:00.991Z",
                 "instanceId":  "fff6f775-e6b0-4c7a-82dc-2afed6414af7",
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
    "callId":  "dc21d284-0835-443f-91df-b0a68ae2dbbb",
    "linkedid":  "1777936527.71",
    "sessionStatus":  "ENDED",
    "ani":  "01011112222",
    "dnis":  "07052346380",
    "queueName":  "smoke-3999",
    "primaryAgentId":  "ec367ab9-c755-44ba-b241-c011d83b2aa0",
    "queuedAt":  "2026-05-04T23:15:27.311+00:00",
    "ringingAt":  "2026-05-04T23:15:27.325+00:00",
    "answeredAt":  "2026-05-04T23:15:27.311+00:00",
    "endedAt":  "2026-05-04T23:16:31.296+00:00",
    "talkSeconds":  64,
    "createdAt":  "2026-05-04T23:15:27.302+00:00",
    "updatedAt":  "2026-05-04T23:15:27.302+00:00"
}
~~~

## AMI Events

~~~text
Newchannel	2026-05-04T23:15:27.274+00:00	queue=	agent=	dial=	state=Ring	connected=<unknown>	dest=
Newexten	2026-05-04T23:15:27.275+00:00	queue=	agent=	dial=	state=Ring	connected=<unknown>	dest=
Newchannel	2026-05-04T23:15:27.277+00:00	queue=	agent=	dial=	state=Down	connected=<unknown>	dest=
NewConnectedLine	2026-05-04T23:15:27.277+00:00	queue=	agent=	dial=	state=Ring	connected=3999	dest=
Newstate	2026-05-04T23:15:27.29+00:00	queue=	agent=	dial=	state=Ringing	connected=01011112222	dest=
AgentConnect	2026-05-04T23:15:27.292+00:00	queue=smoke-3999	agent=PJSIP/3999	dial=	state=Ring	connected=3999	dest=3999
VarSet	2026-05-04T23:15:27.305+00:00	queue=	agent=	dial=	state=Ring	connected=<unknown>	dest=
Newexten	2026-05-04T23:15:27.314+00:00	queue=	agent=	dial=	state=Ringing	connected=01011112222	dest=
VarSet	2026-05-04T23:15:27.315+00:00	queue=	agent=	dial=	state=Down	connected=<unknown>	dest=
NewConnectedLine	2026-05-04T23:15:27.316+00:00	queue=	agent=	dial=	state=Ringing	connected=01011112222	dest=
Newstate	2026-05-04T23:15:27.317+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
QueueCallerJoin	2026-05-04T23:15:27.317+00:00	queue=smoke-3999	agent=	dial=	state=Ring	connected=<unknown>	dest=
DialState	2026-05-04T23:15:27.318+00:00	queue=	agent=	dial=RINGING	state=Ring	connected=3999	dest=3999
AgentCalled	2026-05-04T23:15:27.325+00:00	queue=smoke-3999	agent=PJSIP/3999	dial=	state=Ring	connected=<unknown>	dest=3999
BridgeEnter	2026-05-04T23:15:27.327+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
DialEnd	2026-05-04T23:15:27.333+00:00	queue=	agent=	dial=ANSWER	state=Ring	connected=3999	dest=3999
DialBegin	2026-05-04T23:15:27.335+00:00	queue=	agent=	dial=	state=Ring	connected=<unknown>	dest=3999
BridgeEnter	2026-05-04T23:15:27.337+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
QueueCallerLeave	2026-05-04T23:15:27.337+00:00	queue=smoke-3999	agent=	dial=	state=Ring	connected=3999	dest=
MixMonitorStart	2026-05-04T23:15:27.342+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
HangupRequest	2026-05-04T23:16:31.295+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
Hangup	2026-05-04T23:16:31.296+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
VarSet	2026-05-04T23:16:31.304+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
VarSet	2026-05-04T23:16:31.306+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
BridgeLeave	2026-05-04T23:16:31.307+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
SoftHangupRequest	2026-05-04T23:16:31.309+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
Newexten	2026-05-04T23:16:31.31+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
AgentComplete	2026-05-04T23:16:31.311+00:00	queue=smoke-3999	agent=PJSIP/3999	dial=	state=Up	connected=3999	dest=3999
BridgeLeave	2026-05-04T23:16:31.317+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
Hangup	2026-05-04T23:16:31.32+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
~~~

## Server Logs

Patterns: Prisma, 25P02, session create raced, Unhandled event, AMI connected, AMI login accepted, AMI socket closed

~~~text
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 11:15:27 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newexten[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 11:15:27 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event NewConnectedLine[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 11:15:27 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 11:15:27 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newstate[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 11:15:27 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newexten[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 11:15:27 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event NewConnectedLine[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 11:15:27 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 11:15:27 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event DialEnd[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 11:15:27 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event DialBegin[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 11:15:27 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event QueueCallerLeave[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 11:15:27 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event MixMonitorStart[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 11:16:31 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 11:16:31 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 11:16:31 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event SoftHangupRequest[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 11:16:31 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newexten[39m
~~~

## WebSocket Events

~~~json
{
    "startedAt":  "2026-05-04T23:15:20.843Z",
    "endedAt":  "2026-05-04T23:17:10.988Z",
    "connected":  true,
    "eventCount":  18,
    "events":  [
                   {
                       "type":  "socket.connected",
                       "at":  "2026-05-04T23:15:21.014Z",
                       "payload":  {
                                       "id":  "utii4rb_6oLEIzQJAAAH"
                                   }
                   },
                   {
                       "type":  "call.created",
                       "at":  "2026-05-04T23:15:29.484Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "dc21d284-0835-443f-91df-b0a68ae2dbbb",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777936527.71",
                                       "queuedAt":  null,
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T23:15:27.302Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  null,
                                       "ringingAt":  null,
                                       "startedAt":  "2026-05-04T23:15:27.300Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T23:15:27.302Z",
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
                       "at":  "2026-05-04T23:15:29.492Z",
                       "payload":  [
                                       {
                                           "queueId":  "2370150c-e06a-4a27-9080-7c9846fedb9a",
                                           "queueName":  "Smoke 3999 Queue",
                                           "waitingCount":  0,
                                           "talkingCount":  1,
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
                       "at":  "2026-05-04T23:15:29.495Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "dc21d284-0835-443f-91df-b0a68ae2dbbb",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777936527.71",
                                       "queuedAt":  null,
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T23:15:27.302Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  "smoke-3999",
                                       "ringingAt":  null,
                                       "startedAt":  "2026-05-04T23:15:27.300Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T23:15:27.302Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T23:15:27.292Z",
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
                                       "primaryAgentId":  "ec367ab9-c755-44ba-b241-c011d83b2aa0",
                                       "latestTransfer":  null,
                                       "customer":  null,
                                       "isMuted":  false
                                   }
                   },
                   {
                       "type":  "queue.summary.updated",
                       "at":  "2026-05-04T23:15:29.501Z",
                       "payload":  [
                                       {
                                           "queueId":  "2370150c-e06a-4a27-9080-7c9846fedb9a",
                                           "queueName":  "Smoke 3999 Queue",
                                           "waitingCount":  0,
                                           "talkingCount":  1,
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
                       "at":  "2026-05-04T23:15:29.503Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "dc21d284-0835-443f-91df-b0a68ae2dbbb",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777936527.71",
                                       "queuedAt":  "2026-05-04T23:15:27.317Z",
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T23:15:27.302Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  "smoke-3999",
                                       "ringingAt":  null,
                                       "startedAt":  "2026-05-04T23:15:27.300Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T23:15:27.302Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T23:15:27.292Z",
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
                                       "primaryAgentId":  "ec367ab9-c755-44ba-b241-c011d83b2aa0",
                                       "latestTransfer":  null,
                                       "customer":  null,
                                       "isMuted":  false
                                   }
                   },
                   {
                       "type":  "queue.summary.updated",
                       "at":  "2026-05-04T23:15:29.508Z",
                       "payload":  [
                                       {
                                           "queueId":  "2370150c-e06a-4a27-9080-7c9846fedb9a",
                                           "queueName":  "Smoke 3999 Queue",
                                           "waitingCount":  0,
                                           "talkingCount":  1,
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
                       "at":  "2026-05-04T23:15:29.510Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "dc21d284-0835-443f-91df-b0a68ae2dbbb",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777936527.71",
                                       "queuedAt":  "2026-05-04T23:15:27.317Z",
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T23:15:27.302Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  "smoke-3999",
                                       "ringingAt":  "2026-05-04T23:15:27.318Z",
                                       "startedAt":  "2026-05-04T23:15:27.300Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T23:15:27.302Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T23:15:27.292Z",
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
                                       "primaryAgentId":  "ec367ab9-c755-44ba-b241-c011d83b2aa0",
                                       "latestTransfer":  null,
                                       "customer":  null,
                                       "isMuted":  false
                                   }
                   },
                   {
                       "type":  "queue.summary.updated",
                       "at":  "2026-05-04T23:15:29.526Z",
                       "payload":  [
                                       {
                                           "queueId":  "2370150c-e06a-4a27-9080-7c9846fedb9a",
                                           "queueName":  "Smoke 3999 Queue",
                                           "waitingCount":  0,
                                           "talkingCount":  1,
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
                       "at":  "2026-05-04T23:15:29.526Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "dc21d284-0835-443f-91df-b0a68ae2dbbb",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777936527.71",
                                       "queuedAt":  "2026-05-04T23:15:27.317Z",
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T23:15:27.302Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  "smoke-3999",
                                       "ringingAt":  "2026-05-04T23:15:27.325Z",
                                       "startedAt":  "2026-05-04T23:15:27.300Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T23:15:27.302Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T23:15:27.292Z",
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
                                       "primaryAgentId":  "ec367ab9-c755-44ba-b241-c011d83b2aa0",
                                       "latestTransfer":  null,
                                       "customer":  null,
                                       "isMuted":  false
                                   }
                   },
                   {
                       "type":  "queue.summary.updated",
                       "at":  "2026-05-04T23:15:29.530Z",
                       "payload":  [
                                       {
                                           "queueId":  "2370150c-e06a-4a27-9080-7c9846fedb9a",
                                           "queueName":  "Smoke 3999 Queue",
                                           "waitingCount":  0,
                                           "talkingCount":  1,
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
                       "at":  "2026-05-04T23:15:29.532Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "dc21d284-0835-443f-91df-b0a68ae2dbbb",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777936527.71",
                                       "queuedAt":  "2026-05-04T23:15:27.317Z",
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T23:15:27.302Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  "smoke-3999",
                                       "ringingAt":  "2026-05-04T23:15:27.325Z",
                                       "startedAt":  "2026-05-04T23:15:27.300Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T23:15:27.302Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T23:15:27.327Z",
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
                                       "primaryAgentId":  "ec367ab9-c755-44ba-b241-c011d83b2aa0",
                                       "latestTransfer":  null,
                                       "customer":  null,
                                       "isMuted":  false
                                   }
                   },
                   {
                       "type":  "queue.summary.updated",
                       "at":  "2026-05-04T23:15:29.538Z",
                       "payload":  [
                                       {
                                           "queueId":  "2370150c-e06a-4a27-9080-7c9846fedb9a",
                                           "queueName":  "Smoke 3999 Queue",
                                           "waitingCount":  0,
                                           "talkingCount":  1,
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
                       "at":  "2026-05-04T23:15:29.540Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "dc21d284-0835-443f-91df-b0a68ae2dbbb",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777936527.71",
                                       "queuedAt":  "2026-05-04T23:15:27.317Z",
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T23:15:27.302Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  "smoke-3999",
                                       "ringingAt":  "2026-05-04T23:15:27.325Z",
                                       "startedAt":  "2026-05-04T23:15:27.300Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T23:15:27.302Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T23:15:27.337Z",
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
                                       "primaryAgentId":  "ec367ab9-c755-44ba-b241-c011d83b2aa0",
                                       "latestTransfer":  null,
                                       "customer":  null,
                                       "isMuted":  false
                                   }
                   },
                   {
                       "type":  "queue.summary.updated",
                       "at":  "2026-05-04T23:15:29.544Z",
                       "payload":  [
                                       {
                                           "queueId":  "2370150c-e06a-4a27-9080-7c9846fedb9a",
                                           "queueName":  "Smoke 3999 Queue",
                                           "waitingCount":  0,
                                           "talkingCount":  1,
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
                       "at":  "2026-05-04T23:16:32.470Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "dc21d284-0835-443f-91df-b0a68ae2dbbb",
                                       "endedAt":  "2026-05-04T23:16:31.296Z",
                                       "queueId":  null,
                                       "linkedid":  "1777936527.71",
                                       "queuedAt":  "2026-05-04T23:15:27.317Z",
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T23:15:27.302Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  "smoke-3999",
                                       "ringingAt":  "2026-05-04T23:15:27.325Z",
                                       "startedAt":  "2026-05-04T23:15:27.300Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T23:15:27.302Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T23:15:27.337Z",
                                       "customerId":  null,
                                       "resultCode":  null,
                                       "abandonFlag":  false,
                                       "holdSeconds":  0,
                                       "ringSeconds":  0,
                                       "talkSeconds":  63,
                                       "waitSeconds":  0,
                                       "callbackFlag":  false,
                                       "campaignCode":  null,
                                       "resultDetail":  null,
                                       "transferFlag":  false,
                                       "aniNormalized":  "01011112222",
                                       "recordingFlag":  false,
                                       "sessionStatus":  "ENDED",
                                       "primaryAgentId":  "ec367ab9-c755-44ba-b241-c011d83b2aa0"
                                   }
                   },
                   {
                       "type":  "queue.summary.updated",
                       "at":  "2026-05-04T23:16:32.481Z",
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
                       "at":  "2026-05-04T23:16:32.483Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "dc21d284-0835-443f-91df-b0a68ae2dbbb",
                                       "endedAt":  "2026-05-04T23:16:31.296Z",
                                       "queueId":  null,
                                       "linkedid":  "1777936527.71",
                                       "queuedAt":  "2026-05-04T23:15:27.311Z",
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T23:15:27.302Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  "smoke-3999",
                                       "ringingAt":  "2026-05-04T23:15:27.325Z",
                                       "startedAt":  "2026-05-04T23:15:27.300Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T23:15:27.302Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T23:15:27.311Z",
                                       "customerId":  null,
                                       "resultCode":  null,
                                       "abandonFlag":  false,
                                       "holdSeconds":  0,
                                       "ringSeconds":  0,
                                       "talkSeconds":  64,
                                       "waitSeconds":  0,
                                       "callbackFlag":  false,
                                       "campaignCode":  null,
                                       "resultDetail":  null,
                                       "transferFlag":  false,
                                       "aniNormalized":  "01011112222",
                                       "recordingFlag":  false,
                                       "sessionStatus":  "ENDED",
                                       "primaryAgentId":  "ec367ab9-c755-44ba-b241-c011d83b2aa0",
                                       "latestTransfer":  null,
                                       "customer":  null,
                                       "isMuted":  false
                                   }
                   },
                   {
                       "type":  "queue.summary.updated",
                       "at":  "2026-05-04T23:16:32.489Z",
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
                       "at":  "2026-05-04T23:17:10.987Z",
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
| DB | PASS: callSessions row found for linkedid 1777936527.71 |
| AMI events | PASS: queue, ringing, connected, and hangup events observed |
| Server logs | PASS: no error patterns found |
| WebSocket | PASS: call.created, call.updated, and call.ended observed for linkedid 1777936527.71 |

## Failure Classification

| Failure location | Judgment | Next investigation point |
| --- | --- | --- |
| PBX server | PASS | No issue detected by this gate |
| CTI server | PASS | No issue detected by this gate |
| WebSocket | PASS | No issue detected by this gate |
| DB | PASS | No issue detected by this gate |
| Test input | PASS | No issue detected by this gate |

Final verdict: PASS

Next action: Use this smoke as deployment gate evidence; run a queue-specific gate when stable SIP registration is required.
