# PBX Smoke Report

createdAt: 2026-05-04 18:22:02
site: rehearsal-20260501-existing-check

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
                 "timestamp":  "2026-05-04T09:22:01.866Z",
                 "instanceId":  "09748339-d8d5-4af1-801f-abcb651d94af",
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

~~~

## AMI Events

~~~text
(no events found)
~~~

## Server Logs

Patterns: Prisma, 25P02, session create raced, Unhandled event, AMI connected, AMI login accepted, AMI socket closed

~~~text
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:19:12 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newstate[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:19:12 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newexten[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:19:12 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:19:12 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event NewConnectedLine[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:19:12 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event DialEnd[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:19:12 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event QueueCallerLeave[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:19:12 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | `)}var co=({clientMethod:e,activeProvider:t})=>r=>{let n="",i;if(pa(r))n=r.sql,i={values:jt(r.values),__prismaRawParameters__:!0};else if(Array.isArray(r)){let[o,...s]=r;n=o,i={values:jt(s||[]),__prismaRawParameters__:!0}}else switch(t){case"sqlite":case"mysql":{n=r.sql,i={values:jt(r.values),__prismaRawParameters__:!0};break}case"cockroachdb":case"postgresql":case"postgres":{n=r.text,i={values:jt(r.values),__prismaRawParameters__:!0};break}case"sqlserver":{n=bl(r),i={values:jt(r.values),__prismaRawParameters__:!0};break}default:throw new Error(`The ${t} provider does not support ${e}`)}return i?.values?Tl(`prisma.${e}(${n}, ${i.values})`):Tl(`prisma.${e}(${n})`),{query:n,parameters:i}},Rl={requestArgsToMiddlewareArgs(e){return[e.strings,...e.values]},middlewareArgsToRequestArgs(e){let[t,...r]=e;return new oe(t,r)}},Cl={requestArgsToMiddlewareArgs(e){return[e]},middlewareArgsToRequestArgs(e){return e[0]}};function po(e){return function(r){let n,i=(o=e)=>{try{return o===void 0||o?.kind==="itx"?n??=Sl(r(o)):Sl(r(o))}catch(s){return Promise.reject(s)}};return{then(o,s){return i().then(o,s)},catch(o){return i().catch(o)},finally(o){return i().finally(o)},requestTransaction(o){let s=i(o);return s.requestTransaction?s.requestTransaction(o):s},[Symbol.toStringTag]:"PrismaPromise"}}}function Sl(e){return typeof e.then=="function"?e:Promise.resolve(e)}var Al={isEnabled(){return!1},getTraceParent(){return"00-10-10-00"},async createEngineSpan(){},getActiveContext(){},runInChildSpan(e,t){return t()}},mo=class{isEnabled(){return this.getGlobalTracingHelper().isEnabled()}getTraceParent(t){return this.getGlobalTracingHelper().getTraceParent(t)}createEngineSpan(t){return this.getGlobalTracingHelper().createEngineSpan(t)}getActiveContext(){return this.getGlobalTracingHelper().getActiveContext()}runInChildSpan(t,r){return this.getGlobalTracingHelper().runInChildSpan(t,r)}getGlobalTracingHelper(){return globalThis.PRISMA_INSTRUMENTATION?.helper??Al}};function Il(e){return e.includes("tracing")?new mo:Al}function Ol(e,t=()=>{}){let r,n=new Promise(i=>r=i);return{then(i){return--e===0&&r(t()),i?.(n)}}}function kl(e){return typeof e=="string"?e:e.reduce((t,r)=>{let n=typeof r=="string"?r:r.level;return n==="query"?t:t&&(r==="info"||t==="info")?"info":n},void 0)}var Ln=class{constructor(){this._middlewares=[]}use(t){this._middlewares.push(t)}get(t){return this._middlewares[t]}has(t){return!!this._middlewares[t]}length(){return this._middlewares.length}};var Fl=k(bi());function Nn(e){return typeof e.batchRequestIdx=="number"}function Dl(e){if(e.action!=="findUnique"&&e.action!=="findUniqueOrThrow")return;let t=[];return e.modelName&&t.push(e.modelName),e.query.arguments&&t.push(fo(e.query.arguments)),t.push(fo(e.query.selection)),t.join("")}function fo(e){return`(${Object.keys(e).sort().map(r=>{let n=e[r];return typeof n=="object"&&n!==null?`(${r} ${fo(n)})`:r}).join(" ")})`}var wm={aggregate:!1,aggregateRaw:!1,createMany:!0,createManyAndReturn:!0,createOne:!0,deleteMany:!0,deleteOne:!0,executeRaw:!0,findFirst:!1,findFirstOrThrow:!1,findMany:!1,findRaw:!1,findUnique:!1,findUniqueOrThrow:!1,groupBy:!1,queryRaw:!1,runCommandRaw:!0,updateMany:!0,updateOne:!0,upsertOne:!0};function go(e){return wm[e]}var Mn=class{constructor(t){this.options=t;this.tickActive=!1;this.batches={}}request(t){let r=this.options.batchBy(t);return r?(this.batches[r]||(this.batches[r]=[],this.tickActive||(this.tickActive=!0,process.nextTick(()=>{this.dispatchBatches(),this.tickActive=!1}))),new Promise((n,i)=>{this.batches[r].push({request:t,resolve:n,reject:i})})):this.options.singleLoader(t)}dispatchBatches(){for(let t in this.batches){let r=this.batches[t];delete this.batches[t],r.length===1?this.options.singleLoader(r[0].request).then(n=>{n instanceof Error?r[0].reject(n):r[0].resolve(n)}).catch(n=>{r[0].reject(n)}):(r.sort((n,i)=>this.options.batchOrder(n.request,i.request)),this.options.batchLoader(r.map(n=>n.request)).then(n=>{if(n instanceof Error)for(let i=0;i<r.length;i++)r[i].reject(n);else for(let i=0;i<r.length;i++){let o=n[i];o instanceof Error?r[i].reject(o):r[i].resolve(o)}}).catch(n=>{for(let i=0;i<r.length;i++)r[i].reject(n)}))}}get[Symbol.toStringTag](){return"DataLoader"}};function pt(e,t){if(t===null)return t;switch(e){case"bigint":return BigInt(t);case"bytes":return Buffer.from(t,"base64");case"decimal":return new xe(t);case"datetime":case"date":return new Date(t);case"time":return new Date(`1970-01-01T${t}Z`);case"bigint-array":return t.map(r=>pt("bigint",r));case"bytes-array":return t.map(r=>pt("bytes",r));case"decimal-array":return t.map(r=>pt("decimal",r));case"datetime-array":return t.map(r=>pt("datetime",r));case"date-array":return t.map(r=>pt("date",r));case"time-array":return t.map(r=>pt("time",r));default:return t}}function _l(e){let t=[],r=xm(e);for(let n=0;n<e.rows.length;n++){let i=e.rows[n],o={...r};for(let s=0;s<i.length;s++)o[e.columns[s]]=pt(e.types[s],i[s]);t.push(o)}return t}function xm(e){let t={};for(let r=0;r<e.columns.length;r++)t[e.columns[r]]=null;return t}var Pm=L("prisma:client:request_handler"),$n=class{constructor(t,r){this.logEmitter=r,this.client=t,this.dataloader=new Mn({batchLoader:Ma(async({requests:n,customDataProxyFetch:i})=>{let{transaction:o,otelParentCtx:s}=n[0],a=n.map(p=>p.protocolQuery),l=this.client._tracingHelper.getTraceParent(s),u=n.some(p=>go(p.protocolQuery.action));return(await this.client._engine.requestBatch(a,{traceparent:l,transaction:vm(o),containsWrite:u,customDataProxyFetch:i})).map((p,d)=>{if(p instanceof Error)return p;try{return this.mapQueryEngineResult(n[d],p)}catch(f){return f}})}),singleLoader:async n=>{let i=n.transaction?.kind==="itx"?Ll(n.transaction):void 0,o=await this.client._engine.request(n.protocolQuery,{traceparent:this.client._tracingHelper.getTraceParent(),interactiveTransaction:i,isWrite:go(n.protocolQuery.action),customDataProxyFetch:n.customDataProxyFetch});return this.mapQueryEngineResult(n,o)},batchBy:n=>n.transaction?.id?`transaction-${n.transaction.id}`:Dl(n.protocolQuery),batchOrder(n,i){return n.transaction?.kind==="batch"&&i.transaction?.kind==="batch"?n.transaction.index-i.transaction.index:0}})}async request(t){try{return await this.dataloader.request(t)}catch(r){let{clientMethod:n,callsite:i,transaction:o,args:s,modelName:a}=t;this.handleAndLogRequestError({error:r,clientMethod:n,callsite:i,transaction:o,args:s,modelName:a,globalOmit:t.globalOmit})}}mapQueryEngineResult({dataPath:t,unpacker:r},n){let i=n?.data,o=n?.elapsed,s=this.unpack(i,t,r);return process.env.PRISMA_CLIENT_GET_TIME?{data:s,elapsed:o}:s}handleAndLogRequestError(t){try{this.handleRequestError(t)}catch(r){throw this.logEmitter&&this.logEmitter.emit("error",{message:r.message,target:t.clientMethod,timestamp:new Date}),r}}handleRequestError({error:t,clientMethod:r,callsite:n,transaction:i,args:o,modelName:s,globalOmit:a}){if(Pm(t),Tm(t,i)||t instanceof Le)throw t;if(t instanceof V&&Rm(t)){let u=Nl(t.meta);wn({args:o,errors:[u],callsite:n,errorFormat:this.client._errorFormat,originalMethod:r,clientVersion:this.client._clientVersion,globalOmit:a})}let l=t.message;if(n&&(l=Tt({callsite:n,originalMethod:r,isPanic:t.isPanic,showColors:this.client._errorFormat==="pretty",message:l})),l=this.sanitizeMessage(l),t.code){let u=s?{modelName:s,...t.meta}:t.meta;throw new V(l,{code:t.code,clientVersion:this.client._clientVersion,meta:u,batchRequestIdx:t.batchRequestIdx})}else{if(t.isPanic)throw new le(l,this.client._clientVersion);if(t instanceof B)throw new B(l,{clientVersion:this.client._clientVersion,batchRequestIdx:t.batchRequestIdx});if(t instanceof R)throw new R(l,this.client._clientVersion);if(t instanceof le)throw new le(l,this.client._clientVersion)}throw t.clientVersion=this.client._clientVersion,t}sanitizeMessage(t){return this.client._errorFormat&&this.client._errorFormat!=="pretty"?(0,Fl.default)(t):t}unpack(t,r,n){if(!t||(t.data&&(t=t.data),!t))return t;let i=Object.keys(t)[0],o=Object.values(t)[0],s=r.filter(u=>u!=="select"&&u!=="include"),a=Gi(o,s),l=i==="queryRaw"?_l(a):wt(a);return n?n(l):l}get[Symbol.toStringTag](){return"RequestHandler"}};function vm(e){if(e){if(e.kind==="batch")return{kind:"batch",options:{isolationLevel:e.isolationLevel}};if(e.kind==="itx")return{kind:"itx",options:Ll(e)};Fe(e,"Unknown transaction kind")}}function Ll(e){return{id:e.id,payload:e.payload}}function Tm(e,t){return Nn(e)&&t?.kind==="batch"&&e.batchRequestIdx!==t.index}function Rm(e){return e.code==="P2009"||e.code==="P2012"}function Nl(e){if(e.kind==="Union")return{kind:"Union",errors:e.errors.map(Nl)};if(Array.isArray(e.selectionPath)){let[,...t]=e.selectionPath;return{...e,selectionPath:t}}return e}var Ml="5.22.0";var $l=Ml;var Ul=k(Ai());var F=class extends Error{constructor(t){super(t+`
kaster-rehearsal-20260501-server  | PrismaClientKnownRequestError:
kaster-rehearsal-20260501-server  | Prisma schema loaded from prisma/schema.prisma
kaster-rehearsal-20260501-server  | [32m[Nest] 1  - [39m05/04/2026, 9:19:14 AM [32m    LOG[39m [38;5;3m[AmiConnectionService] [39m[32mAMI connected 172.20.0.1:5038[39m
kaster-rehearsal-20260501-server  | [32m[Nest] 1  - [39m05/04/2026, 9:19:14 AM [32m    LOG[39m [38;5;3m[AmiConnectionService] [39m[32mAMI login accepted[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:19:35 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:20:16 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:20:16 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event VarSet[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:20:16 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event SoftHangupRequest[39m
kaster-rehearsal-20260501-server  | [95m[Nest] 1  - [39m05/04/2026, 9:20:16 AM [95m  DEBUG[39m [38;5;3m[SessionEngineService] [39m[95mUnhandled event Newexten[39m
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
| CTI server | FAIL: callSessions row not found |
| DB | FAIL: no callSessions row matched caller/DID criteria |
| AMI events | FAIL: missing Newchannel, AgentConnect, BridgeEnter, or Up connection event, Hangup |
| Server logs | FAIL: fatal server log pattern found |
| WebSocket | PASS: call.created, call.updated, and call.ended observed |

Final verdict: FAIL

Next action: Investigate failed areas before deployment.
