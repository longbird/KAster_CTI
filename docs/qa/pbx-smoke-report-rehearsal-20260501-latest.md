# PBX Smoke Report

createdAt: 2026-05-04 14:58:22
site: rehearsal-20260501

## Inputs

| Field | Value |
| --- | --- |
| scenario file | D:\Work\AI_Projects\KAster_CTI\tools\pbx-loadgen\test-templates\sites\rehearsal-20260501-smoke.yaml |
| DID | 07052346380 |
| callerId | 01011112222 |
| queue | smoke-3999 |
| agent extension | 3999 |
| run summary json | D:\Work\AI_Projects\KAster_CTI\reports\run-summary-1777868944297977-156380-0.json |
| call details csv | D:\Work\AI_Projects\KAster_CTI\reports\call-details-1777868944297977-156380-0.csv |

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
                 "timestamp":  "2026-05-04T05:58:22.859Z",
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
    "callId":  "a1291e34-fa8d-4724-9c2a-3f8c9a23462f",
    "linkedid":  "1777868938.24",
    "sessionStatus":  "ENDED",
    "ani":  "01011112222",
    "dnis":  "07052346380",
    "queueName":  "smoke-3999",
    "primaryAgentId":  "ec367ab9-c755-44ba-b241-c011d83b2aa0",
    "queuedAt":  "2026-05-04T04:28:58.204+00:00",
    "ringingAt":  "2026-05-04T04:28:59.028+00:00",
    "answeredAt":  "2026-05-04T04:28:59.204+00:00",
    "endedAt":  "2026-05-04T04:30:03.215+00:00",
    "talkSeconds":  64,
    "createdAt":  "2026-05-04T04:28:58.922+00:00",
    "updatedAt":  "2026-05-04T04:28:58.922+00:00"
}
~~~

## AMI Events

~~~text
Newchannel	2026-05-04T04:28:58.911+00:00	queue=	agent=	dial=	state=Ring	connected=<unknown>	dest=
QueueCallerJoin	2026-05-04T04:28:58.912+00:00	queue=smoke-3999	agent=	dial=	state=Ring	connected=<unknown>	dest=
VarSet	2026-05-04T04:28:58.925+00:00	queue=	agent=	dial=	state=Ring	connected=<unknown>	dest=
Newexten	2026-05-04T04:28:58.93+00:00	queue=	agent=	dial=	state=Ring	connected=<unknown>	dest=
Newchannel	2026-05-04T04:28:58.937+00:00	queue=	agent=	dial=	state=Down	connected=<unknown>	dest=
VarSet	2026-05-04T04:28:58.941+00:00	queue=	agent=	dial=	state=Down	connected=<unknown>	dest=
AgentCalled	2026-05-04T04:28:58.945+00:00	queue=smoke-3999	agent=PJSIP/3999	dial=	state=Ring	connected=<unknown>	dest=3999
DialBegin	2026-05-04T04:28:58.969+00:00	queue=	agent=	dial=	state=Ring	connected=<unknown>	dest=3999
NewConnectedLine	2026-05-04T04:28:58.971+00:00	queue=	agent=	dial=	state=Ring	connected=3999	dest=
Newstate	2026-05-04T04:28:59.023+00:00	queue=	agent=	dial=	state=Ringing	connected=01011112222	dest=
Newexten	2026-05-04T04:28:59.025+00:00	queue=	agent=	dial=	state=Ringing	connected=01011112222	dest=
NewConnectedLine	2026-05-04T04:28:59.027+00:00	queue=	agent=	dial=	state=Ringing	connected=01011112222	dest=
DialState	2026-05-04T04:28:59.028+00:00	queue=	agent=	dial=RINGING	state=Ring	connected=3999	dest=3999
AgentConnect	2026-05-04T04:28:59.182+00:00	queue=smoke-3999	agent=PJSIP/3999	dial=	state=Ring	connected=3999	dest=3999
DialEnd	2026-05-04T04:28:59.182+00:00	queue=	agent=	dial=ANSWER	state=Ring	connected=3999	dest=3999
QueueCallerLeave	2026-05-04T04:28:59.185+00:00	queue=smoke-3999	agent=	dial=	state=Ring	connected=3999	dest=
VarSet	2026-05-04T04:28:59.186+00:00	queue=	agent=	dial=	state=Ring	connected=3999	dest=
VarSet	2026-05-04T04:28:59.188+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
Newstate	2026-05-04T04:28:59.191+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
MixMonitorStart	2026-05-04T04:28:59.195+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
BridgeEnter	2026-05-04T04:28:59.196+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
BridgeEnter	2026-05-04T04:28:59.212+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
HangupRequest	2026-05-04T04:30:03.183+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
VarSet	2026-05-04T04:30:03.193+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
VarSet	2026-05-04T04:30:03.195+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
BridgeLeave	2026-05-04T04:30:03.197+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
SoftHangupRequest	2026-05-04T04:30:03.201+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
Newexten	2026-05-04T04:30:03.203+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
AgentComplete	2026-05-04T04:30:03.204+00:00	queue=smoke-3999	agent=PJSIP/3999	dial=	state=Up	connected=3999	dest=3999
BridgeLeave	2026-05-04T04:30:03.21+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
Hangup	2026-05-04T04:30:03.215+00:00	queue=	agent=	dial=	state=Up	connected=3999	dest=
Hangup	2026-05-04T04:30:03.22+00:00	queue=	agent=	dial=	state=Up	connected=01011112222	dest=
~~~

## Server Logs

Patterns: Prisma, 25P02, session create raced, Unhandled event, AMI connected, AMI login accepted, AMI socket closed

~~~text
(no matching log lines)
~~~

## Verdict

| Area | Judgment |
| --- | --- |
| Health | PASS: db/redis/ami are healthy |
| PBX server | PASS: SIP call connected with 200 and no failure |
| CTI server | PASS: call session reached ENDED with queue, agent, answer, and talk time |
| DB | PASS: callSessions row found for linkedid 1777868938.24 |
| AMI events | PASS: queue, ringing, connected, and hangup events observed |
| Server logs | PASS: no error patterns found |
| WebSocket | NOT_COLLECTED: WS event capture is not part of this script yet |

Final verdict: PASS

Next action: Promote this smoke to the deployment gate or add WebSocket capture.
