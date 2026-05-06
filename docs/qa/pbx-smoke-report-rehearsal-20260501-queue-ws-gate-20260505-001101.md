# PBX Smoke Report

createdAt: 2026-05-05 00:12:55
site: rehearsal-20260501

## Inputs

| Field | Value |
| --- | --- |
| scenario file | D:\Work\AI_Projects\KAster_CTI\tools\pbx-loadgen\test-templates\sites\rehearsal-20260501-smoke.yaml |
| DID | 07052346380 |
| callerId | 01011112222 |
| queue | smoke-3999 |
| agent extension | 3999 |
| run summary json | D:\Work\AI_Projects\KAster_CTI\reports\rehearsal-20260501-smoke\run-summary-1777907475061462-82396-0.json |
| call details csv | D:\Work\AI_Projects\KAster_CTI\reports\rehearsal-20260501-smoke\call-details-1777907475061462-82396-0.csv |

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
                 "timestamp":  "2026-05-04T15:12:55.401Z",
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
    "callId":  "7e0fd146-01d1-4df1-a79b-e74b9fd21199",
    "linkedid":  "1777907469.65",
    "sessionStatus":  "ENDED",
    "ani":  "01011112222",
    "dnis":  "07052346380",
    "queueName":  "smoke-3999",
    "primaryAgentId":  "ec367ab9-c755-44ba-b241-c011d83b2aa0",
    "queuedAt":  "2026-05-04T15:11:09.383+00:00",
    "ringingAt":  "2026-05-04T15:11:09.412+00:00",
    "answeredAt":  "2026-05-04T15:11:09.383+00:00",
    "endedAt":  "2026-05-04T15:12:13.391+00:00",
    "talkSeconds":  64,
    "createdAt":  "2026-05-04T15:11:09.369+00:00",
    "updatedAt":  "2026-05-04T15:11:09.369+00:00"
}
~~~

## AMI Events

~~~text
Newchannel	2026-05-04T15:11:09.346+00:00	queue=	agent=	dial=	state=Ring	connected=<unknown>	dest=
QueueCallerJoin	2026-05-04T15:11:09.347+00:00	queue=smoke-3999	agent=	dial=	state=Ring	connected=<unknown>	dest=
NewConnectedLine	2026-05-04T15:11:09.348+00:00	queue=	agent=	dial=	state=Ring	connected=3999	dest=
Newstate	2026-05-04T15:11:09.357+00:00	queue=	agent=	dial=	state=Ringing	connected=01011112222	dest=
Newexten	2026-05-04T15:11:09.36+00:00	queue=	agent=	dial=	state=Ringing	connected=01011112222	dest=
VarSet	2026-05-04T15:11:09.36+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
DialEnd	2026-05-04T15:11:09.362+00:00	queue=	agent=	dial=ANSWER	state=Ring	connected=3999	dest=3999
QueueCallerLeave	2026-05-04T15:11:09.379+00:00	queue=smoke-3999	agent=	dial=	state=Ring	connected=3999	dest=
AgentConnect	2026-05-04T15:11:09.379+00:00	queue=smoke-3999	agent=PJSIP/3999	dial=	state=Ring	connected=3999	dest=3999
VarSet	2026-05-04T15:11:09.381+00:00	queue=	agent=	dial=	state=Ring	connected=<unknown>	dest=
Newexten	2026-05-04T15:11:09.384+00:00	queue=	agent=	dial=	state=Ring	connected=<unknown>	dest=
NewConnectedLine	2026-05-04T15:11:09.389+00:00	queue=	agent=	dial=	state=Ringing	connected=01011112222	dest=
DialState	2026-05-04T15:11:09.393+00:00	queue=	agent=	dial=RINGING	state=Ring	connected=3999	dest=3999
MixMonitorStart	2026-05-04T15:11:09.398+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
Newstate	2026-05-04T15:11:09.399+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
Newchannel	2026-05-04T15:11:09.402+00:00	queue=	agent=	dial=	state=Down	connected=<unknown>	dest=
BridgeEnter	2026-05-04T15:11:09.409+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
AgentCalled	2026-05-04T15:11:09.412+00:00	queue=smoke-3999	agent=PJSIP/3999	dial=	state=Ring	connected=<unknown>	dest=3999
BridgeEnter	2026-05-04T15:11:09.416+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
DialBegin	2026-05-04T15:11:09.421+00:00	queue=	agent=	dial=	state=Ring	connected=<unknown>	dest=3999
HangupRequest	2026-05-04T15:12:13.361+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
VarSet	2026-05-04T15:12:13.369+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
VarSet	2026-05-04T15:12:13.371+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
BridgeLeave	2026-05-04T15:12:13.373+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
SoftHangupRequest	2026-05-04T15:12:13.376+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
Newexten	2026-05-04T15:12:13.377+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
BridgeLeave	2026-05-04T15:12:13.38+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
AgentComplete	2026-05-04T15:12:13.383+00:00	queue=smoke-3999	agent=PJSIP/3999	dial=	state=Up	connected=3999	dest=3999
Hangup	2026-05-04T15:12:13.391+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
Hangup	2026-05-04T15:12:13.397+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
~~~

## Server Logs

Patterns: Prisma, 25P02, session create raced, Unhandled event, AMI connected, AMI login accepted, AMI socket closed

~~~text
kaster-rehearsal-20260501-server  | Prisma schema loaded from prisma/schema.prisma
kaster-rehearsal-20260501-server  | [32m[Nest] 1  - [39m05/04/2026, 3:00:54 PM [32m    LOG[39m [38;5;3m[AmiConnectionService] [39m[32mAMI connected 172.20.0.1:5038[39m
kaster-rehearsal-20260501-server  | [32m[Nest] 1  - [39m05/04/2026, 3:00:54 PM [32m    LOG[39m [38;5;3m[AmiConnectionService] [39m[32mAMI login accepted[39m
kaster-rehearsal-20260501-server  | Prisma schema loaded from prisma/schema.prisma
kaster-rehearsal-20260501-server  | [32m[Nest] 1  - [39m05/04/2026, 3:01:05 PM [32m    LOG[39m [38;5;3m[AmiConnectionService] [39m[32mAMI connected 172.20.0.1:5038[39m
kaster-rehearsal-20260501-server  | [32m[Nest] 1  - [39m05/04/2026, 3:01:05 PM [32m    LOG[39m [38;5;3m[AmiConnectionService] [39m[32mAMI login accepted[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:01:25 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:03:12 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event NewConnectedLine[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:03:12 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newstate[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:03:12 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:03:12 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event MixMonitorStart[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:03:12 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:03:12 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newexten[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:03:12 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newexten[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:03:12 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event NewConnectedLine[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:03:12 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event DialEnd[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:03:12 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event QueueCallerLeave[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:03:12 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event DialBegin[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:04:16 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:04:16 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:04:16 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event SoftHangupRequest[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:04:16 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newexten[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:11:09 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newstate[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:11:09 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event NewConnectedLine[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:11:09 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event DialEnd[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:11:09 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:11:09 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event QueueCallerLeave[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:11:09 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:11:09 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newexten[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:11:09 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newexten[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:11:09 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event NewConnectedLine[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:11:09 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event MixMonitorStart[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:11:09 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event DialBegin[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:12:13 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:12:13 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:12:13 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event SoftHangupRequest[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 3:12:13 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newexten[39m
~~~

## WebSocket Events

~~~json
{
    "startedAt":  "2026-05-04T15:11:03.342Z",
    "endedAt":  "2026-05-04T15:12:53.518Z",
    "connected":  true,
    "eventCount":  18,
    "events":  [
                   {
                       "type":  "socket.connected",
                       "at":  "2026-05-04T15:11:03.530Z",
                       "payload":  {
                                       "id":  "w9dNNvwmYOxkU9oCAAAD"
                                   }
                   },
                   {
                       "type":  "call.created",
                       "at":  "2026-05-04T15:11:10.929Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "7e0fd146-01d1-4df1-a79b-e74b9fd21199",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777907469.65",
                                       "queuedAt":  null,
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T15:11:09.369Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  null,
                                       "ringingAt":  null,
                                       "startedAt":  "2026-05-04T15:11:09.368Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T15:11:09.369Z",
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
                       "at":  "2026-05-04T15:11:10.938Z",
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
                       "at":  "2026-05-04T15:11:10.941Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "7e0fd146-01d1-4df1-a79b-e74b9fd21199",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777907469.65",
                                       "queuedAt":  null,
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T15:11:09.369Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  "smoke-3999",
                                       "ringingAt":  null,
                                       "startedAt":  "2026-05-04T15:11:09.368Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T15:11:09.369Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T15:11:09.379Z",
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
                       "at":  "2026-05-04T15:11:10.950Z",
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
                       "at":  "2026-05-04T15:11:10.955Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "7e0fd146-01d1-4df1-a79b-e74b9fd21199",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777907469.65",
                                       "queuedAt":  "2026-05-04T15:11:09.347Z",
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T15:11:09.369Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  "smoke-3999",
                                       "ringingAt":  null,
                                       "startedAt":  "2026-05-04T15:11:09.368Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T15:11:09.369Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T15:11:09.379Z",
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
                                       "sessionStatus":  "QUEUED",
                                       "primaryAgentId":  "ec367ab9-c755-44ba-b241-c011d83b2aa0",
                                       "latestTransfer":  null,
                                       "customer":  null,
                                       "isMuted":  false
                                   }
                   },
                   {
                       "type":  "queue.summary.updated",
                       "at":  "2026-05-04T15:11:10.963Z",
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
                       "at":  "2026-05-04T15:11:10.965Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "7e0fd146-01d1-4df1-a79b-e74b9fd21199",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777907469.65",
                                       "queuedAt":  "2026-05-04T15:11:09.347Z",
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T15:11:09.369Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  "smoke-3999",
                                       "ringingAt":  "2026-05-04T15:11:09.393Z",
                                       "startedAt":  "2026-05-04T15:11:09.368Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T15:11:09.369Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T15:11:09.379Z",
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
                                       "sessionStatus":  "RINGING_AGENT",
                                       "primaryAgentId":  "ec367ab9-c755-44ba-b241-c011d83b2aa0",
                                       "latestTransfer":  null,
                                       "customer":  null,
                                       "isMuted":  false
                                   }
                   },
                   {
                       "type":  "queue.summary.updated",
                       "at":  "2026-05-04T15:11:10.972Z",
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
                       "at":  "2026-05-04T15:11:10.974Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "7e0fd146-01d1-4df1-a79b-e74b9fd21199",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777907469.65",
                                       "queuedAt":  "2026-05-04T15:11:09.347Z",
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T15:11:09.369Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  "smoke-3999",
                                       "ringingAt":  "2026-05-04T15:11:09.393Z",
                                       "startedAt":  "2026-05-04T15:11:09.368Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T15:11:09.369Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T15:11:09.409Z",
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
                       "at":  "2026-05-04T15:11:10.982Z",
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
                       "at":  "2026-05-04T15:11:10.984Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "7e0fd146-01d1-4df1-a79b-e74b9fd21199",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777907469.65",
                                       "queuedAt":  "2026-05-04T15:11:09.347Z",
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T15:11:09.369Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  "smoke-3999",
                                       "ringingAt":  "2026-05-04T15:11:09.412Z",
                                       "startedAt":  "2026-05-04T15:11:09.368Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T15:11:09.369Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T15:11:09.409Z",
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
                       "at":  "2026-05-04T15:11:10.991Z",
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
                       "at":  "2026-05-04T15:11:10.995Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "7e0fd146-01d1-4df1-a79b-e74b9fd21199",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777907469.65",
                                       "queuedAt":  "2026-05-04T15:11:09.347Z",
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T15:11:09.369Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  "smoke-3999",
                                       "ringingAt":  "2026-05-04T15:11:09.412Z",
                                       "startedAt":  "2026-05-04T15:11:09.368Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T15:11:09.369Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T15:11:09.416Z",
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
                       "at":  "2026-05-04T15:11:10.999Z",
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
                       "at":  "2026-05-04T15:12:13.912Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "7e0fd146-01d1-4df1-a79b-e74b9fd21199",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777907469.65",
                                       "queuedAt":  "2026-05-04T15:11:09.383Z",
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T15:11:09.369Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  "smoke-3999",
                                       "ringingAt":  "2026-05-04T15:11:09.412Z",
                                       "startedAt":  "2026-05-04T15:11:09.368Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T15:11:09.369Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T15:11:09.383Z",
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
                                       "sessionStatus":  "AFTER_CALL_WORK",
                                       "primaryAgentId":  "ec367ab9-c755-44ba-b241-c011d83b2aa0",
                                       "latestTransfer":  null,
                                       "customer":  null,
                                       "isMuted":  false
                                   }
                   },
                   {
                       "type":  "queue.summary.updated",
                       "at":  "2026-05-04T15:12:13.923Z",
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
                       "at":  "2026-05-04T15:12:13.924Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "7e0fd146-01d1-4df1-a79b-e74b9fd21199",
                                       "endedAt":  "2026-05-04T15:12:13.391Z",
                                       "queueId":  null,
                                       "linkedid":  "1777907469.65",
                                       "queuedAt":  "2026-05-04T15:11:09.383Z",
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T15:11:09.369Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  "smoke-3999",
                                       "ringingAt":  "2026-05-04T15:11:09.412Z",
                                       "startedAt":  "2026-05-04T15:11:09.368Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T15:11:09.369Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T15:11:09.383Z",
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
                                       "primaryAgentId":  "ec367ab9-c755-44ba-b241-c011d83b2aa0"
                                   }
                   },
                   {
                       "type":  "queue.summary.updated",
                       "at":  "2026-05-04T15:12:13.931Z",
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
                       "at":  "2026-05-04T15:12:53.518Z",
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
| DB | PASS: callSessions row found for linkedid 1777907469.65 |
| AMI events | PASS: queue, ringing, connected, and hangup events observed |
| Server logs | PASS: no error patterns found |
| WebSocket | PASS: call.created, call.updated, and call.ended observed for linkedid 1777907469.65 |

Final verdict: PASS

Next action: Use this smoke as deployment gate evidence; run a queue-specific gate when stable SIP registration is required.
