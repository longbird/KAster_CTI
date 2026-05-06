# PBX Smoke Report

createdAt: 2026-05-04 23:42:34
site: rehearsal-20260501

## Inputs

| Field | Value |
| --- | --- |
| scenario file | D:\Work\AI_Projects\KAster_CTI\tools\pbx-loadgen\test-templates\sites\rehearsal-20260501-smoke.yaml |
| DID | 07052346380 |
| callerId | 01011112222 |
| queue | smoke-3999 |
| agent extension | 3999 |
| run summary json | D:\Work\AI_Projects\KAster_CTI\reports\rehearsal-20260501-smoke\run-summary-1777905554976070-113624-0.json |
| call details csv | D:\Work\AI_Projects\KAster_CTI\reports\rehearsal-20260501-smoke\call-details-1777905554976070-113624-0.csv |

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
                 "timestamp":  "2026-05-04T14:42:34.816Z",
                 "instanceId":  "5fa1e15c-5462-4eb4-83e0-ee4deaf06fe3",
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
    "callId":  "5fb95b7b-fd2e-4f55-b3cc-f21808511446",
    "linkedid":  "1777905549.59",
    "sessionStatus":  "ENDED",
    "ani":  "01011112222",
    "dnis":  "07052346380",
    "queueName":  "smoke-3999",
    "primaryAgentId":  "ec367ab9-c755-44ba-b241-c011d83b2aa0",
    "queuedAt":  "2026-05-04T14:39:09.318+00:00",
    "ringingAt":  "2026-05-04T14:39:09.322+00:00",
    "answeredAt":  "2026-05-04T14:39:09.318+00:00",
    "endedAt":  "2026-05-04T14:40:13.345+00:00",
    "talkSeconds":  64,
    "createdAt":  "2026-05-04T14:39:09.3+00:00",
    "updatedAt":  "2026-05-04T14:39:09.3+00:00"
}
~~~

## AMI Events

~~~text
Newchannel	2026-05-04T14:39:09.287+00:00	queue=	agent=	dial=	state=Down	connected=<unknown>	dest=
Newchannel	2026-05-04T14:39:09.287+00:00	queue=	agent=	dial=	state=Ring	connected=<unknown>	dest=
Newstate	2026-05-04T14:39:09.296+00:00	queue=	agent=	dial=	state=Ringing	connected=01011112222	dest=
VarSet	2026-05-04T14:39:09.297+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
Newexten	2026-05-04T14:39:09.3+00:00	queue=	agent=	dial=	state=Ringing	connected=01011112222	dest=
VarSet	2026-05-04T14:39:09.302+00:00	queue=	agent=	dial=	state=Ring	connected=<unknown>	dest=
NewConnectedLine	2026-05-04T14:39:09.305+00:00	queue=	agent=	dial=	state=Ringing	connected=01011112222	dest=
DialState	2026-05-04T14:39:09.308+00:00	queue=	agent=	dial=RINGING	state=Ring	connected=3999	dest=3999
Newexten	2026-05-04T14:39:09.308+00:00	queue=	agent=	dial=	state=Ring	connected=<unknown>	dest=
MixMonitorStart	2026-05-04T14:39:09.317+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
AgentCalled	2026-05-04T14:39:09.322+00:00	queue=smoke-3999	agent=PJSIP/3999	dial=	state=Ring	connected=<unknown>	dest=3999
AgentConnect	2026-05-04T14:39:09.323+00:00	queue=smoke-3999	agent=PJSIP/3999	dial=	state=Ring	connected=3999	dest=3999
DialEnd	2026-05-04T14:39:09.325+00:00	queue=	agent=	dial=ANSWER	state=Ring	connected=3999	dest=3999
QueueCallerLeave	2026-05-04T14:39:09.327+00:00	queue=smoke-3999	agent=	dial=	state=Ring	connected=3999	dest=
QueueCallerJoin	2026-05-04T14:39:09.337+00:00	queue=smoke-3999	agent=	dial=	state=Ring	connected=<unknown>	dest=
Newstate	2026-05-04T14:39:09.337+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
DialBegin	2026-05-04T14:39:09.341+00:00	queue=	agent=	dial=	state=Ring	connected=<unknown>	dest=3999
NewConnectedLine	2026-05-04T14:39:09.344+00:00	queue=	agent=	dial=	state=Ring	connected=3999	dest=
BridgeEnter	2026-05-04T14:39:09.346+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
BridgeEnter	2026-05-04T14:39:09.358+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
HangupRequest	2026-05-04T14:40:13.296+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
VarSet	2026-05-04T14:40:13.304+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
VarSet	2026-05-04T14:40:13.307+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
BridgeLeave	2026-05-04T14:40:13.31+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
SoftHangupRequest	2026-05-04T14:40:13.314+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
Newexten	2026-05-04T14:40:13.316+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
AgentComplete	2026-05-04T14:40:13.318+00:00	queue=smoke-3999	agent=PJSIP/3999	dial=	state=Up	connected=3999	dest=3999
BridgeLeave	2026-05-04T14:40:13.341+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
Hangup	2026-05-04T14:40:13.345+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
Hangup	2026-05-04T14:40:13.355+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
~~~

## Server Logs

Patterns: Prisma, 25P02, session create raced, Unhandled event, AMI connected, AMI login accepted, AMI socket closed

~~~text
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 2:39:09 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newstate[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 2:39:09 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newexten[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 2:39:09 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 2:39:09 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event NewConnectedLine[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 2:39:09 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 2:39:09 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newexten[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 2:39:09 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event MixMonitorStart[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 2:39:09 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event DialEnd[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 2:39:09 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event QueueCallerLeave[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 2:39:09 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event DialBegin[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 2:39:09 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event NewConnectedLine[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 2:40:13 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 2:40:13 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 2:40:13 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event SoftHangupRequest[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 2:40:13 PM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newexten[39m
~~~

## WebSocket Events

~~~json
{
    "startedAt":  "2026-05-04T14:39:03.242Z",
    "endedAt":  "2026-05-04T14:40:53.437Z",
    "connected":  true,
    "eventCount":  18,
    "events":  [
                   {
                       "type":  "socket.connected",
                       "at":  "2026-05-04T14:39:03.437Z",
                       "payload":  {
                                       "id":  "G5i4cYLGJ5WtgQiOAAAD"
                                   }
                   },
                   {
                       "type":  "call.created",
                       "at":  "2026-05-04T14:39:11.892Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "5fb95b7b-fd2e-4f55-b3cc-f21808511446",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777905549.59",
                                       "queuedAt":  null,
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T14:39:09.300Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  null,
                                       "ringingAt":  null,
                                       "startedAt":  "2026-05-04T14:39:09.299Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T14:39:09.300Z",
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
                       "at":  "2026-05-04T14:39:11.900Z",
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
                       "at":  "2026-05-04T14:39:11.903Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "5fb95b7b-fd2e-4f55-b3cc-f21808511446",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777905549.59",
                                       "queuedAt":  null,
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T14:39:09.300Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  null,
                                       "ringingAt":  "2026-05-04T14:39:09.308Z",
                                       "startedAt":  "2026-05-04T14:39:09.299Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T14:39:09.300Z",
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
                                       "sessionStatus":  "RINGING_AGENT",
                                       "primaryAgentId":  "ec367ab9-c755-44ba-b241-c011d83b2aa0",
                                       "latestTransfer":  null,
                                       "customer":  null,
                                       "isMuted":  false
                                   }
                   },
                   {
                       "type":  "queue.summary.updated",
                       "at":  "2026-05-04T14:39:11.909Z",
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
                       "at":  "2026-05-04T14:39:11.911Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "5fb95b7b-fd2e-4f55-b3cc-f21808511446",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777905549.59",
                                       "queuedAt":  null,
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T14:39:09.300Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  "smoke-3999",
                                       "ringingAt":  "2026-05-04T14:39:09.308Z",
                                       "startedAt":  "2026-05-04T14:39:09.299Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T14:39:09.300Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T14:39:09.323Z",
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
                       "at":  "2026-05-04T14:39:11.918Z",
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
                       "at":  "2026-05-04T14:39:11.921Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "5fb95b7b-fd2e-4f55-b3cc-f21808511446",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777905549.59",
                                       "queuedAt":  null,
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T14:39:09.300Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  "smoke-3999",
                                       "ringingAt":  "2026-05-04T14:39:09.322Z",
                                       "startedAt":  "2026-05-04T14:39:09.299Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T14:39:09.300Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T14:39:09.323Z",
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
                       "at":  "2026-05-04T14:39:11.926Z",
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
                       "at":  "2026-05-04T14:39:11.928Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "5fb95b7b-fd2e-4f55-b3cc-f21808511446",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777905549.59",
                                       "queuedAt":  "2026-05-04T14:39:09.337Z",
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T14:39:09.300Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  "smoke-3999",
                                       "ringingAt":  "2026-05-04T14:39:09.322Z",
                                       "startedAt":  "2026-05-04T14:39:09.299Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T14:39:09.300Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T14:39:09.323Z",
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
                       "at":  "2026-05-04T14:39:11.933Z",
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
                       "at":  "2026-05-04T14:39:11.935Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "5fb95b7b-fd2e-4f55-b3cc-f21808511446",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777905549.59",
                                       "queuedAt":  "2026-05-04T14:39:09.337Z",
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T14:39:09.300Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  "smoke-3999",
                                       "ringingAt":  "2026-05-04T14:39:09.322Z",
                                       "startedAt":  "2026-05-04T14:39:09.299Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T14:39:09.300Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T14:39:09.346Z",
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
                       "at":  "2026-05-04T14:39:11.941Z",
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
                       "at":  "2026-05-04T14:39:11.943Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "5fb95b7b-fd2e-4f55-b3cc-f21808511446",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777905549.59",
                                       "queuedAt":  "2026-05-04T14:39:09.337Z",
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T14:39:09.300Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  "smoke-3999",
                                       "ringingAt":  "2026-05-04T14:39:09.322Z",
                                       "startedAt":  "2026-05-04T14:39:09.299Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T14:39:09.300Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T14:39:09.358Z",
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
                       "at":  "2026-05-04T14:39:11.948Z",
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
                       "at":  "2026-05-04T14:40:14.885Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "5fb95b7b-fd2e-4f55-b3cc-f21808511446",
                                       "endedAt":  null,
                                       "queueId":  null,
                                       "linkedid":  "1777905549.59",
                                       "queuedAt":  "2026-05-04T14:39:09.318Z",
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T14:39:09.300Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  "smoke-3999",
                                       "ringingAt":  "2026-05-04T14:39:09.322Z",
                                       "startedAt":  "2026-05-04T14:39:09.299Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T14:39:09.300Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T14:39:09.318Z",
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
                       "at":  "2026-05-04T14:40:14.895Z",
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
                       "at":  "2026-05-04T14:40:14.897Z",
                       "payload":  {
                                       "ani":  "01011112222",
                                       "dnis":  "07052346380",
                                       "callId":  "5fb95b7b-fd2e-4f55-b3cc-f21808511446",
                                       "endedAt":  "2026-05-04T14:40:13.345Z",
                                       "queueId":  null,
                                       "linkedid":  "1777905549.59",
                                       "queuedAt":  "2026-05-04T14:39:09.318Z",
                                       "tenantId":  "00000000-0000-0000-0000-000000000001",
                                       "createdAt":  "2026-05-04T14:39:09.300Z",
                                       "didNumber":  null,
                                       "direction":  "inbound",
                                       "queueName":  "smoke-3999",
                                       "ringingAt":  "2026-05-04T14:39:09.322Z",
                                       "startedAt":  "2026-05-04T14:39:09.299Z",
                                       "trunkName":  null,
                                       "updatedAt":  "2026-05-04T14:39:09.300Z",
                                       "acwSeconds":  0,
                                       "answeredAt":  "2026-05-04T14:39:09.318Z",
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
                       "at":  "2026-05-04T14:40:14.902Z",
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
                       "at":  "2026-05-04T14:40:53.437Z",
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
| DB | PASS: callSessions row found for linkedid 1777905549.59 |
| AMI events | PASS: queue, ringing, connected, and hangup events observed |
| Server logs | PASS: no error patterns found |
| WebSocket | PASS: call.created, call.updated, and call.ended observed for linkedid 1777905549.59 |

Final verdict: PASS

Next action: Use this smoke as deployment gate evidence; run a queue-specific gate when stable SIP registration is required.
