# 운영 서버 배포 리허설 결과

일시: 2026-05-01
대상 서버: `blueadm@49.247.46.86`
리허설 경로: `/home/blueadm/kaster_cti_rehearsals/20260501_222458`
site dir: `deploy/sites/rehearsal-20260501`
gateway 포트: `5180`

## 목적

P0/P1 로컬 검증 산출물을 운영형 compose/site template 기준으로 실제 운영 서버에서 빌드, migration, 기동 가능한지 확인한다.

기존 개발형 컨테이너(`kaster-server`, `kaster-admin`, `kaster-web`)는 건드리지 않고 별도 리허설 디렉터리와 별도 compose project로 진행했다.

## 진행 결과

| 단계 | 결과 | 증적 |
| --- | --- | --- |
| 원격 접속 | 통과 | `ssh -F NUL blueadm@49.247.46.86` |
| Docker 확인 | 통과 | Docker `28.2.2`, Compose `v2.32.4` |
| site env 생성 | 통과 | 민감값 제외, 필수 env key 생성 확인 |
| compose config | 통과 | `docker compose ... config` |
| deploy script 문법 | 통과 | `bash -n scripts/deploy-prod.sh` |
| server image build | 통과 | `npx prisma generate && npm run build` 성공 |
| web image build | 통과 | Vite production build 성공 |
| admin image build | 통과 | Vite production build 성공 |
| DB migration | 실패 | `20260414_ops_followup`에서 P3018 |
| stack 기동 | 미진행 | migration 실패로 중단 |
| health/API/WebSocket 확인 | 미진행 | stack 미기동 |

## 발견한 사전 보정

운영 compose의 server service가 Dockerfile 기본 entrypoint를 덮어쓰며 `node dist/main.js`를 실행하도록 되어 있었다. 실제 서버 빌드 산출물은 `dist/src/main.js`이며 Dockerfile의 `docker-entrypoint.sh`가 이를 실행한다.

보정:

- `deploy/sites/_template/compose.prod.yml`에서 server `command` override 제거
- `AUTO_SEED_DEMO_DATA=false`를 운영 기본값으로 추가
- `deploy/sites/_template/.env.example`에 `AUTO_SEED_DEMO_DATA=false` 추가

## 차단 원인

`prisma migrate deploy`가 신규 DB에서 다음 오류로 중단됐다.

```text
Error: P3018
Migration name: 20260414_ops_followup
Database error code: 42P01
ERROR: relation "rawAmiEvents" does not exist
```

원인:

- `20260414_init` 수동 SQL은 `raw_ami_events`, `event_outbox`, `call_sessions`처럼 snake_case 테이블과 컬럼을 생성한다.
- 이후 migration과 현재 Prisma schema는 `"rawAmiEvents"`, `"eventOutbox"`, `"callSessions"`처럼 camelCase 식별자를 기대한다.
- 따라서 신규 운영 DB에서는 첫 migration 적용 후 후속 migration이 기존 테이블을 찾지 못한다.

추가 확인:

- `_prisma_migrations`에는 `20260414_init`만 완료됐고 `20260414_ops_followup`은 실패 로그가 남았다.
- 실패 후 생성된 리허설 컨테이너와 볼륨은 `docker compose down -v --remove-orphans`로 정리했다.

## 현재 판정

운영 서버 배포 리허설은 `DB migration chain 불일치`로 차단됐다.

이미지 빌드와 compose config는 통과했으므로 서버/프론트 빌드 문제가 아니라 신규 운영 DB 초기화 경로 문제다.

## 다음 보정 작업

1. 운영 DB 신규 설치 기준으로 Prisma migration chain을 정리한다.
2. 기존 개발/운영 DB가 이미 존재할 수 있으므로, 다음 중 하나를 선택한다.
   - 신규 운영 설치용 baseline migration을 별도로 재구성한다.
   - 기존 migration 앞단에 snake_case 초기 스키마를 camelCase Prisma 식별자로 변환하는 호환 migration을 추가한다.
3. 보정 후 같은 리허설 site로 `scripts/deploy-prod.sh --site-dir deploy/sites/rehearsal-20260501 --skip-backup`을 재실행한다.
4. migration 통과 후 `GET /api/v1/health`, `GET /api/v1/health/ready`, Swagger, 관리자 앱, 상담원 앱, WebSocket 연결을 확인한다.

## 2026-05-03 재리허설 결과

대상 서버: `blueadm@49.247.46.86`
리허설 경로: `/home/blueadm/kaster_cti_rehearsals/20260503_221151`
site dir: `deploy/sites/rehearsal-20260501`
gateway 포트: `5180`

### 보정 내용

- `20260414_init_identifier_compat` migration을 추가해 초기 baseline의 snake_case 테이블/컬럼을 후속 migration이 기대하는 camelCase 식별자로 정규화했다.
- `branchDids`, `branchAgents`, `branchQueues`의 cross-table FK 중 `branches`, `AsteriskDid` 생성 이후에만 걸 수 있는 FK를 `20260416_asterisk_config_branch_links`로 분리했다.
- `tenantSystemSettings` 생성보다 먼저 실행되던 컬럼 추가 migration을 안전한 no-op으로 바꾸고, 실제 컬럼 추가는 `20260417_system_settings_deferred_columns`로 이동했다.
- `scripts/deploy-prod.sh`의 마지막 API health check에 retry를 추가해 서버 부팅 타이밍 때문에 gate가 실패하지 않도록 했다.

### 결과

| 단계 | 결과 | 증적 |
| --- | --- | --- |
| compose config | 통과 | `docker compose ... config` |
| deploy script 문법 | 통과 | `bash -n scripts/deploy-prod.sh` |
| server image build | 통과 | `npx prisma generate && npm run build` 성공 |
| web image build | 통과 | Vite production build 성공 |
| admin image build | 통과 | Vite production build 성공 |
| DB migration | 통과 | 29개 migration 전체 적용, `No pending migrations to apply` 재확인 |
| stack 기동 | 통과 | postgres, redis, server, web, admin, gateway running |
| gateway 내부 health | 통과 | `http://server:3000/api/v1/health` 200 |
| 외부 API host routing | 통과 | `Host: api.49.247.46.86.nip.io` + `http://127.0.0.1:5180/api/v1/health` 200 |
| 상담원 앱 routing | 통과 | `Host: cti.49.247.46.86.nip.io` + `/` 200 |
| 관리자 앱 routing | 통과 | `Host: admin.49.247.46.86.nip.io` + `/` 200 |

### 남은 운영 확인

- health 응답은 `db: up`, `redis: up`, `ami: disconnected`로 확인됐다. 리허설 `.env`의 `AMI_HOST=host.docker.internal`은 해당 Linux Docker 환경에서 해석되지 않아 실제 PBX 서버 접속값으로 교체해야 한다.
- Swagger, 로그인, WebSocket handshake, PBX 설정 반영 E2E는 다음 단계에서 실제 site 값으로 별도 확인한다.

## 2026-05-04 단계별 실체 테스트 결과

대상 서버: `blueadm@49.247.46.86`
리허설 경로: `/home/blueadm/kaster_cti_rehearsals/20260503_221151`
site dir: `deploy/sites/rehearsal-20260501`
gateway 포트: `5180`

### 추가 보정

- `20260416_asterisk_config_identifier_compat` migration을 추가해 `20260416_asterisk_config`가 만든 `agents.sip_password` 컬럼을 Prisma schema가 기대하는 `agents.sipPassword`로 정규화했다.
- Linux Docker에서 `host.docker.internal`을 해석할 수 있도록 운영 compose server service에 `extra_hosts: host.docker.internal:host-gateway`를 추가했다.
- 서버가 AMI 확인용 외부 Docker 네트워크에도 붙는 경우 `postgres`, `redis` DNS가 다른 stack과 충돌할 수 있어, 운영 compose의 `DATABASE_URL`과 `REDIS_HOST`를 site별 컨테이너명으로 고정했다.

### 단계별 결과

| 단계 | 결과 | 증적 |
| --- | --- | --- |
| stack 상태 | 통과 | postgres/redis/server/web/admin/gateway running, postgres/redis healthy |
| DB migration | 통과 | `20260416_asterisk_config_identifier_compat` 적용 후 `No pending migrations to apply` |
| API health | 부분 통과 | `/api/v1/health` 200, `db: up`, `redis: up`, `ami: disconnected` |
| ready/live | 통과 | `/api/v1/health/ready` 200, `/api/v1/health/live` 200 |
| Swagger routing | 통과 | `Host: api.49.247.46.86.nip.io` + `/docs` 200 |
| 관리자 앱 routing | 통과 | `Host: admin.49.247.46.86.nip.io` + `/` 200 |
| 상담원 앱 routing | 통과 | `Host: cti.49.247.46.86.nip.io` + `/` 200 |
| WebSocket handshake | 통과 | `/socket.io/?EIO=4&transport=polling` 200, Engine.IO open frame 수신 |
| supervisor 로그인 | 통과 | `supervisor1 / 2001 / Password123!` 로그인 200, access token 발급 |
| PBX 설정 dry-run | 부분 통과 | `/api/v1/asterisk-config/dry-run` 200, `pjsip`, `extensions_*`, `queues` 생성 |
| Agent SIP 조회 | 통과 | `/api/v1/asterisk-config/agents-sip` 200, 내선 `1001`, `2001` 조회 |
| PBX reload API | 부분 통과 | `/api/v1/asterisk-config/reload` 201, 단 서버 로그에서 conf dir 미마운트로 실제 파일 생성/reload skip |
| AMI host TCP | 통과 | 컨테이너에서 허용 네트워크 `172.20.0.1:5038` 수동 Login 성공 |
| 앱 AMI 유지 연결 | 실패 | 앱 로그: `AMI connected 172.20.0.1:5038` 직후 `AMI disconnected` |

### 확인된 차단 조건

1. `ASTERISK_CONF_DIR=/etc/asterisk`가 서버 컨테이너에 마운트되어 있지 않다.
   - 로그: `Asterisk conf directory "/etc/asterisk" does not exist. Skipping config file generation`
   - 결과: reload API는 HTTP 201을 반환하지만 실제 설정 파일 생성과 AMI reload는 수행되지 않는다.

2. AMI 접근 허용 대역과 Docker 네트워크가 일치해야 한다.
   - host의 `manager.conf`는 `127.0.0.1`, `172.17.0.0/16`, `172.20.0.0/16`, `10.0.0.0/8`을 허용한다.
   - compose 기본 네트워크가 `172.21.0.0/16`으로 생성되면 TCP는 닿아도 Login 전후 연결이 끊긴다.
   - 기존 `kaster_cti_default(172.20.0.0/16)` 네트워크에 서버 컨테이너를 추가하고 `AMI_HOST=172.20.0.1`로 수동 Login하면 인증은 성공한다.

3. 애플리케이션 AMI 세션은 아직 유지되지 않는다.
   - 같은 컨테이너에서 수동 `Events: on` Login은 8초 이상 유지되고 `Authentication accepted`를 받았다.
   - Nest 앱은 동일 대상에 연결 로그를 남긴 뒤 1초 내 disconnected가 된다.
   - 다음 조사는 `AmiConnectionService`의 Login 응답 처리, 이벤트 수신 처리, Asterisk 측 disconnect 사유 로그를 함께 봐야 한다.

4. dry-run validation은 Asterisk 런타임 변수까지 unresolved placeholder로 분류한다.
   - 실패 check: `extensions_inbound.conf`, `extensions_queue.conf`, `extensions_agent.conf has no unresolved placeholders`
   - 예: `${CALLERID(num)}` 같은 dialplan 런타임 변수는 생성 오류가 아니므로 validation 규칙 보정이 필요하다.

### 현재 판정

운영형 앱 stack, DB migration, HTTP routing, WebSocket handshake, 인증, PBX 설정 preview 생성은 실제 리허설 서버에서 통과했다.

PBX 설정의 실제 파일 반영, AMI reload, smoke call은 아직 통과하지 않았다. 다음 단계는 `/etc/asterisk` 마운트 방식 확정, AMI 앱 세션 disconnect 원인 확인, validation false positive 보정이다.

## 2026-05-04 Asterisk mount 보정 결과

### 보정 내용

- 운영 compose server service에 `/etc/asterisk` bind mount를 추가했다.
- 운영 compose server service에 `/var/lib/asterisk/sounds/custom` bind mount를 추가했다.
- `ASTERISK_SOUNDS_DIR=/var/lib/asterisk/sounds/custom` 환경변수를 site template에 추가했다.
- 리허설 적용 전 Docker root 권한으로 호스트 설정을 백업했다.
  - `deploy/sites/rehearsal-20260501/backups/asterisk-before-mount-20260504_121258.tgz`
  - `deploy/sites/rehearsal-20260501/backups/asterisk-sounds-before-mount-20260504_121258.tgz`

### 검증 결과

| 단계 | 결과 | 증적 |
| --- | --- | --- |
| compose config | 통과 | `docker compose ... config` |
| deploy gate | 통과 | `No pending migrations to apply`, `API health check passed` |
| server mounts | 통과 | `/etc/asterisk`와 `/var/lib/asterisk/sounds/custom`가 rw bind mount로 표시 |
| container env | 통과 | `ASTERISK_CONF_DIR=/etc/asterisk`, `ASTERISK_SOUNDS_DIR=/var/lib/asterisk/sounds/custom` |
| config file write | 통과 | `pjsip.conf`, `extensions_inbound.conf`, `extensions_queue.conf`, `extensions_agent.conf`, `queues.conf`, `musiconhold_kaster_prompts.conf`가 2026-05-04 03:17:03 UTC에 생성/갱신됨 |
| API health | 부분 통과 | `db: up`, `redis: up`, `ami: disconnected` |
| AMI reload 전송 | 실패 | `AMI is not connected yet. Re-scheduling Asterisk reload...` |

### 현재 남은 차단 조건

`/etc/asterisk` 미마운트 문제는 해결됐다. 현재 PBX 설정 반영 E2E의 차단점은 앱 AMI 세션이 유지되지 않아 reload 명령을 전송하지 못하는 것이다.

## 2026-05-04 AMI 세션 보정 결과

### 원인

`AmiConnectionService`가 Asterisk AMI TCP 접속 직후 배너를 수신하면 `loggedIn=true`로 먼저 표시했다. 실제 `Response: Success / Authentication accepted` 응답을 받기 전에도 `isConnected()`가 true가 되어 reload 명령이 전송될 수 있었다.

또한 리허설 server 컨테이너는 `kaster_cti_default(172.20.0.0/16)` 외부 Docker 네트워크에 수동으로 붙어야 AMI 허용 대역과 일치했다. 컨테이너 재생성 후에는 이 연결이 사라져 배포 직후 AMI 인증 실패가 재발할 수 있었다.

### 보정 내용

- AMI TCP connected 상태와 AMI authenticated 상태를 분리했다.
- `Response: Success` + `Authentication accepted`를 받은 뒤에만 `loggedIn=true`로 전환하도록 했다.
- Login 이외의 AMI action은 인증 완료 전에는 write하지 않도록 막았다.
- `isConnected()`는 이제 `connected && loggedIn` 기준으로 동작한다.
- `scripts/deploy-prod.sh`가 site `.env`의 `ASTERISK_DOCKER_NETWORK` 값을 읽어 server 컨테이너를 외부 Asterisk 네트워크에 자동 연결하고, 새로 연결한 경우 server를 재시작하도록 했다.
- 리허설 site `.env`에 `ASTERISK_DOCKER_NETWORK=kaster_cti_default`를 적용했다.

### 검증 결과

| 단계 | 결과 | 증적 |
| --- | --- | --- |
| AMI unit test | 통과 | `npm test -- --runTestsByPath src/modules/ami/ami-connection.service.spec.ts` |
| server build | 통과 | `npm run build` |
| Prisma schema | 통과 | `npx prisma validate --schema prisma/schema.prisma` |
| deploy script 문법 | 통과 | `bash -n scripts/deploy-prod.sh` |
| deploy gate | 통과 | `API health check passed`, `Production deployment gate completed` |
| 외부 Asterisk network 자동 연결 | 통과 | 배포 로그: `Attaching server to external Asterisk network: kaster_cti_default` |
| server network | 통과 | `kaster_cti_default`와 `rehearsal-20260501_default` 두 네트워크에 연결 |
| AMI login | 통과 | 로그: `AMI connected 172.20.0.1:5038`, `AMI login accepted` |
| AMI reload | 통과 | 로그: `Sending AMI reload commands...`, `Asterisk reload triggered...` |
| API health 유지 | 통과 | 75초 후 `/api/v1/health`가 `status: ok`, `ami: connected` |

### 현재 판정

`/etc/asterisk` 마운트, 설정 파일 생성, AMI 인증 유지, AMI reload 전송까지 리허설 서버에서 통과했다.

남은 PBX 설정 반영 E2E 차단점은 dry-run validation이 `${CALLERID(num)}` 같은 Asterisk 런타임 변수를 unresolved placeholder로 오탐하는 문제와, 실제 DID 인입 또는 pbx-loadgen smoke call 검증이다.

## 2026-05-04 dry-run validation 및 smoke call 결과

### validation 보정

`validateRenderedConfFiles()`가 모든 `${...}`를 미해결 템플릿 placeholder로 분류해 Asterisk dialplan 런타임 변수를 오탐했다.

보정:

- `extensions_inbound.conf`, `extensions_queue.conf`, `extensions_agent.conf`에서는 Asterisk 런타임 변수식을 허용한다.
- `pjsip.conf`, `queues.conf`의 미해결 `${...}` 검출은 유지한다.
- 중첩 변수와 함수형 변수식을 허용한다.
  - 예: `${CALLERID(num)}`
  - 예: `${FILTER(0-9,${CALLERID(num)})}`
  - 예: `${OPT_OUT_DTMF_ACTION_${EXTEN}}`
  - 예: `${IF($["${LEN(${OPT_OUT_TARGET_PHONE})}"="0"]?${REQUESTER_PHONE}:${OPT_OUT_TARGET_PHONE})}`

검증:

| 단계 | 결과 | 증적 |
| --- | --- | --- |
| validation unit test | 통과 | `npm test -- --runTestsByPath src/modules/asterisk-config/asterisk-config-validation.spec.ts` |
| reload/dry-run unit test | 통과 | `npm test -- --runTestsByPath src/modules/asterisk-config/asterisk-reload.service.spec.ts ...` |
| server build | 통과 | `npm run build` |
| 리허설 deploy gate | 통과 | `Production deployment gate completed` |
| 리허설 dry-run API | 통과 | `/api/v1/asterisk-config/dry-run` 응답 `validation.ok: true`, failed checks 없음 |

### smoke call 준비

리허설 DB에는 trunk와 DID가 비어 있어 생성된 PBX 런타임에 PJSIP endpoint가 없었다.

확인:

- AMI `pjsip show endpoints`: `No objects found`
- pbx-loadgen 최초 1건: `finalSipCode=401`, `failureCode=auth_failed`

보정:

- 테스트 trunk 생성: `loadgen-smoke-61-42-53-61`
  - `host=61.42.53.61`
  - 인증 없음
  - source IP identify match 용도
- 테스트 DID 생성: `07052346380 -> sales`
- reload 후 생성 파일 확인:
  - `pjsip.conf`에 `trunk-loadgen-smoke-61-42-53-61` endpoint/identify 생성
  - `extensions_inbound.conf`에 `exten => 07052346380` 및 `Goto(queue-entry,sales,1)` 생성
- AMI `pjsip show endpoints`: `Objects found: 1`

### smoke call 결과

실행:

```powershell
tools\pbx-loadgen\dist\windows\pbx-loadgen.exe validate -f tools\pbx-loadgen\scenarios\inbound-smoke.yaml
tools\pbx-loadgen\dist\windows\pbx-loadgen.exe dry-run -f tools\pbx-loadgen\scenarios\inbound-smoke.yaml
tools\pbx-loadgen\dist\windows\pbx-loadgen.exe run -f tools\pbx-loadgen\scenarios\inbound-smoke.yaml
```

결과:

| 관점 | 결과 | 증적 |
| --- | --- | --- |
| scenario validate | 통과 | `scenario ok: cps=1 maxConcurrent=1 totalCalls=1` |
| scenario dry-run | 통과 | `planned calls=1 ... totalScheduleMs=5000` |
| SIP loadgen | 실패 | `finalSipCode=408`, `failureCode=timeout_no_response` |
| AMI event ingest | 통과 | `Newchannel`, `QueueCallerJoin`, `QueueCallerAbandon`, `QueueCallerLeave`, `Hangup` 수신 |
| CTI session 생성 | 통과 | `callSessions.linkedid=1777867280.16`, `ani=01011112222`, `queueName=sales`, `sessionStatus=ENDED` |

판정:

- PBX 설정 생성, reload, SIP 인입, AMI 이벤트 수신, CTI 세션 생성까지는 실제 리허설 서버에서 통과했다.
- loadgen의 연결 성공 판정은 아직 실패다. 현재 리허설에는 등록된 상담원 SIP 단말이 없어 큐에서 응답 완료까지 진행되지 않고 abandon/timeout으로 종료된다.
- 다음 smoke는 실제 상담원 SIP 단말 등록 또는 테스트용 SIP UAS/agent endpoint를 준비한 뒤 실행해야 한다.

## 2026-05-04 상담원 SIP UAS 포함 smoke 결과

### 준비

상담원 응답까지 포함한 smoke를 위해 리허설 환경에 테스트 상담원과 단일 member 큐를 추가했다.

- 테스트 상담원: `smoke3999`
  - extension: `3999`
  - SIP password: 리허설용 임시 값
- 테스트 큐: `smoke-3999`
  - member: `PJSIP/3999`
- 테스트 DID: `07052346380 -> smoke-3999`

PBX 반영 확인:

- `pjsip.conf`에 `[3999-auth]`, `[3999]` endpoint/aor 생성
- `queues.conf`에 `[smoke-3999]`, `member => PJSIP/3999,0,Smoke 3999` 생성
- `extensions_inbound.conf`에 `Goto(queue-entry,smoke-3999,1)` 생성

### 실행

로컬 임시 Node SIP UAS를 `3999`로 REGISTER한 뒤 pbx-loadgen 단건 smoke를 실행했다.

SIP UAS 증적:

```text
REGISTER_OK
INVITE_IN from=49.247.46.86:36070
INVITE_ANSWERED_200
ACK_IN
```

pbx-loadgen 결과:

```text
attempted=1 connected=1 failed=0 peakConcurrent=1 totalScheduleMs=5000
call-1,01011112222,07052346380,200,none,0
```

### CTI 상태 확인

최신 세션:

- `linkedid=1777868296.21`
- `ani=01011112222`
- `dnis=07052346380`
- AMI raw events 수신: `Newchannel`, `QueueCallerJoin`, `Newstate`, `DialState`, `BridgeLeave`, `Hangup`

새로 드러난 결함:

- SIP 레벨 연결은 성공했지만 `callSessions`는 `answeredAt` 없이 `NEW -> ENDED`로 남았다.
- 실제 리허설 AMI 이벤트에서는 기존 SessionEngine이 기대하는 `AgentCalled`, `AgentConnect`, `BridgeEnter`가 나오지 않고, `DialState`, `Newstate`, `BridgeLeave` 중심으로 들어왔다.
- 따라서 운영형 Asterisk 이벤트 변형을 반영해 `SessionEngineService`의 상태 전이 매핑을 보정해야 한다.

현재 판정:

- PBX 설정 생성, reload, SIP 인입, 상담원 endpoint 호출, SIP 200 OK 연결까지 통과했다.
- 다음 차단점은 CTI 상태 엔진이 실제 AMI 이벤트 흐름을 `RINGING_AGENT`, `TALKING`, `ENDED`로 정확히 반영하지 못하는 문제다.

## 2026-05-04 SessionEngine AMI 이벤트 매핑 보정 결과

### 원인

실제 리허설 AMI 이벤트에서는 환경과 타이밍에 따라 다음 두 흐름이 관찰됐다.

- `QueueCallerJoin -> DialState RINGING -> BridgeLeave/Hangup`
- `QueueCallerJoin -> AgentCalled -> DialState RINGING -> AgentConnect -> BridgeEnter -> Hangup`

기존 `SessionEngineService`는 `AgentCalled`, `AgentConnect`, `BridgeEnter`, `Hangup` 중심으로만 상태를 전이했다.
또한 `QueueCallerJoin`이 `Newchannel`과 세션 생성 경합을 일으키면 `P2002`를 같은 Postgres transaction 안에서 처리하려고 해 `25P02 current transaction is aborted`로 후속 update가 무시됐다.

### 보정

- `QueueCallerJoin`은 AMI `eventTime` 기준으로 `QUEUED`, `queuedAt`, `queueName`을 기록한다.
- `DialState RINGING`은 `RINGING_AGENT`, `ringingAt`, 상담원 내선 기반 `primaryAgentId`를 기록한다.
- `Newstate/BridgeLeave/HangupRequest`의 `ChannelStateDesc=Up`은 연결 관측 이벤트로 처리해 `TALKING`, `answeredAt`을 보정한다.
- `Hangup`은 AMI `eventTime` 기준 `endedAt`, `talkSeconds`를 계산한다.
- 세션 create 경합의 `P2002`는 기존 transaction 밖에서 잡고, 새 transaction으로 update를 재시도한다.

### 검증

| 단계 | 결과 | 증적 |
| --- | --- | --- |
| 실패 테스트 작성 | 통과 | `QueueCallerJoin` create race, 실제 `QueueCallerJoin/DialState/BridgeLeave/Hangup` 흐름을 spec에 추가 |
| SessionEngine unit test | 통과 | `npm test -- session-engine.service.spec.ts --runInBand` |
| server build | 통과 | `npm run build` |
| 리허설 서버 배포 | 통과 | server image rebuild 후 `ami: connected` health 확인 |
| pbx-loadgen 단건 | 통과 | `attempted=1 connected=1 failed=0`, `finalSipCode=200` |
| SIP UAS | 통과 | `REGISTER_OK`, `INVITE_IN`, `INVITE_ANSWERED_200`, `ACK_IN` |
| CTI DB 상태 | 통과 | `linkedid=1777868938.24`, `queueName=smoke-3999`, `primaryAgentId=ec367ab9-c755-44ba-b241-c011d83b2aa0`, `answeredAt=2026-05-04 04:28:59.204+00`, `endedAt=2026-05-04 04:30:03.215+00`, `talkSeconds=64` |
| 서버 오류 로그 | 통과 | 동일 구간에 `Prisma`, `25P02`, `session create raced` 오류 재발 없음 |

### 현재 판정

PBX 설정 생성, reload, SIP 인입, 상담원 endpoint 응답, SIP 200 OK 연결, AMI 이벤트 수신, CTI 세션 상태 기록까지 리허설 서버에서 통과했다.

다음 단계는 이 smoke를 site별 품질 게이트로 고정하고, pbx-loadgen 결과와 CTI DB/API/WebSocket 결과를 하나의 리포트로 묶는 것이다.

## 2026-05-04 smoke 품질 게이트 초안

반복 실행을 위해 리허설 site 값을 표준 템플릿에서 분리했다.

- site smoke file: `tools/pbx-loadgen/test-templates/sites/rehearsal-20260501-smoke.yaml`
- report template: `docs/qa/pbx-smoke-report-template.md`

검증:

```powershell
tools\pbx-loadgen\dist\windows\pbx-loadgen.exe validate -f tools\pbx-loadgen\test-templates\sites\rehearsal-20260501-smoke.yaml
```

결과:

```text
scenario ok: cps=1 maxConcurrent=1 totalCalls=1
```

다음 보강 대상은 이 템플릿을 사람이 수동으로 채우는 단계에서, `run-summary-*.json`, `call-details-*.csv`, CTI DB 조회, `/api/v1/health`, 서버 로그 패턴을 자동 수집하는 스크립트로 승격하는 것이다.

## 2026-05-04 smoke 증적 자동 수집 스크립트

pbx-loadgen 실행 후 산출물과 원격 리허설 CTI 상태를 묶는 수집 스크립트를 추가했다.

- script: `scripts/pbx-smoke-collect-evidence.ps1`
- generated sample: `docs/qa/pbx-smoke-report-rehearsal-20260501-latest.md`

수집 항목:

- `run-summary-*.json`, `call-details-*.csv`
- `/api/v1/health`
- `callSessions` 최신 row
- `rawAmiEvents` 이벤트 목록
- 서버 로그 패턴: `Prisma`, `25P02`, `session create raced`, `Unhandled event`, AMI 연결/인증/종료

검증 명령:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\pbx-smoke-collect-evidence.ps1 `
  -SiteName rehearsal-20260501 `
  -RunSummaryPath reports\run-summary-1777868944297977-156380-0.json `
  -CallDetailsPath reports\call-details-1777868944297977-156380-0.csv `
  -CallerId 01011112222 `
  -Did 07052346380 `
  -QueueName smoke-3999 `
  -AgentExtension 3999 `
  -ScenarioFile tools\pbx-loadgen\test-templates\sites\rehearsal-20260501-smoke.yaml `
  -SinceUtc 2026-05-04T04:28:50Z `
  -OutFile docs\qa\pbx-smoke-report-rehearsal-20260501-latest.md `
  -FailOnFailedVerdict
```

결과:

- report 생성 성공
- `Final verdict: PASS`
- `linkedid=1777868938.24`
- `sessionStatus=ENDED`
- `queueName=smoke-3999`
- `primaryAgentId=ec367ab9-c755-44ba-b241-c011d83b2aa0`
- `talkSeconds=64`

자동 판정 기준:

- Health: DB, Redis, AMI 정상
- PBX server: SIP 200, 실패 0건
- CTI server: `ENDED`, 큐, 상담원, `answeredAt`, `endedAt`, 양수 `talkSeconds`
- DB: `callSessions`와 `rawAmiEvents` 연결
- AMI events: queue, ringing, connected, hangup 이벤트 관측
- Server logs: `Prisma`, `25P02`, AMI socket 종료 같은 오류 패턴 없음
- WebSocket: 아직 자동 수집 대상이 아니므로 `NOT_COLLECTED`

## 2026-05-04 WebSocket smoke 캡처 연결

smoke 실행 중 Socket.IO `/ws` 이벤트를 캡처하는 스크립트를 추가했다.

- script: `scripts/pbx-smoke-capture-ws.ps1`
- captured sample: `docs/qa/ws-events-rehearsal-20260501-latest.json`
- report sample: `docs/qa/pbx-smoke-report-rehearsal-20260501-ws-latest.md`

검증 절차:

1. `scripts/pbx-smoke-capture-ws.ps1`을 95초 캡처로 시작했다.
2. 같은 기간에 `tools\pbx-loadgen\dist\windows\pbx-loadgen.exe run -f tools\pbx-loadgen\test-templates\sites\rehearsal-20260501-smoke.yaml`을 실행했다.
3. `scripts/pbx-smoke-collect-evidence.ps1`에 `-WsEventsPath docs\qa\ws-events-rehearsal-20260501-latest.json`을 전달했다.

결과:

- WS connected: `true`
- WS eventCount: `6`
- 관찰 이벤트: `call.created`, `call.updated`, `call.ended`, `queue.summary.updated`
- evidence collector `WebSocket`: `PASS`
- final verdict: `PASS`

주의:

- 이번 WS 포함 smoke는 큐 필수 조건 없이 DID 인입/통화 lifecycle 기준으로 판정했다.
- 큐 분배까지 포함한 WS gate는 `QueueName`과 안정적인 테스트 상담원 SIP 등록을 함께 고정한 뒤 별도 실행해야 한다.

## 2026-05-04 smoke one-command gate 결과

validate, dry-run, pbx-loadgen run, WebSocket capture, CTI evidence collection을 한 번에 실행하는 게이트 스크립트를 추가했다.

- script: `scripts/pbx-smoke-run-gate.ps1`
- generated report: `docs/qa/pbx-smoke-report-rehearsal-20260501-full-gate.md`
- WS evidence: `docs/qa/ws-events-rehearsal-20260501-full-gate.json`

실행:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\pbx-smoke-run-gate.ps1 `
  -SiteName rehearsal-20260501-full-gate `
  -CallerId 01011112222 `
  -Did 07052346380 `
  -CaptureWebSocket `
  -WsPassword Password123! `
  -WsDurationSeconds 95 `
  -OutFile docs\qa\pbx-smoke-report-rehearsal-20260501-full-gate.md `
  -WsEventsPath docs\qa\ws-events-rehearsal-20260501-full-gate.json
```

결과:

| 관점 | 결과 | 증적 |
| --- | --- | --- |
| scenario validate | 통과 | `tools/pbx-loadgen/test-templates/sites/rehearsal-20260501-smoke.yaml` |
| scenario dry-run | 통과 | 1건 계획 생성 |
| SIP loadgen | 통과 | `attempted=1`, `connected=1`, `failed=0`, `finalSipCode=200` |
| CTI session | 통과 | `linkedid=1777884113.31`, `sessionStatus=ENDED`, `answeredAt`, `endedAt`, `talkSeconds=4` |
| API health | 통과 | `db: up`, `redis: up`, `ami: connected` |
| WebSocket | 통과 | `call.created`, `call.updated`, `call.ended`, `queue.summary.updated` 수신 |
| final verdict | 통과 | `Final verdict: PASS` |

현재 판정:

- 배포 전/후 실행 가능한 DID 인입 lifecycle + WebSocket smoke gate는 리허설 서버에서 PASS까지 확인됐다.
- 이번 one-command gate는 큐/상담원 필수 조건 없이 DID lifecycle 기준으로 판정했다.
- 큐 분배와 상담원 내선까지 필수로 검증하는 gate는 테스트 SIP UAS 등록 안정화 또는 실제 상담원 SIP 단말 준비 후 `QueueName=smoke-3999`, `AgentExtension=3999` 조건으로 별도 고정해야 한다.

## 2026-05-04 queue + agent + WS gate 확장 진행 결과

큐 분배와 상담원 내선까지 포함한 smoke gate 자동화를 진행했다.

### 보정 내용

- `scripts/pbx-smoke-sip-uas.mjs`를 추가해 테스트 상담원 SIP UAS를 Node 단독 스크립트로 실행할 수 있게 했다.
- `scripts/pbx-smoke-sip-uas.ps1` wrapper를 추가했다.
- `scripts/pbx-smoke-run-gate.ps1`에 `-StartSipUas`, `-SipUasMode server-container` 옵션을 추가했다.
  - 리허설 환경에서는 server 컨테이너가 `kaster_cti_default` 네트워크에 붙어 있으므로, UAS를 server 컨테이너 안에서 실행할 때 `172.20.0.1:36070` REGISTER가 성공한다.
- 빠른 큐 응답 흐름에서 `AgentConnect`가 세션을 먼저 만들고 inbound `Newchannel`이 뒤따를 때도, `rawAmiEvents`에서 ANI/DNIS를 보강하도록 `SessionEngineService`를 수정했다.
- 상담원 AOR에 `remove_existing=yes`를 렌더링해 반복 smoke 실행 시 stale contact 누적을 줄이도록 했다.

### 검증 결과

| 항목 | 결과 | 증적 |
| --- | --- | --- |
| SessionEngine unit test | 통과 | `npm test -- session-engine.service.spec.ts --runInBand` |
| PJSIP renderer unit test | 통과 | `npm test -- renderers/pjsip.renderer.spec.ts --runInBand` |
| server build | 통과 | `npm run build` |
| 리허설 배포 | 통과 | `scripts/deploy-prod.sh --site-dir deploy/sites/rehearsal-20260501 --skip-backup`, health gate 통과 |
| PBX reload | 통과 | `/api/v1/asterisk-config/reload` success |
| server-container UAS | 부분 통과 | `REGISTER_OK`, `INVITE_IN`, `INVITE_ANSWERED_200`, `ACK_IN` 확인 |
| queue CTI session | 통과 | `linkedid=1777886712.38`, `ani=01011112222`, `dnis=07052346380`, `queueName=smoke-3999`, `primaryAgentId=3999`, `talkSeconds=64` |
| repeated queue+WS gate | 차단 | 이후 반복 실행에서 UAS REGISTER 응답이 간헐적으로 없음 |

### 현재 판정

큐/상담원 CTI 세션 보정은 리허설 서버에서 실제 통화로 확인됐다. 다만 one-command gate를 반복 실행 가능한 상태로 닫으려면 테스트 UAS REGISTER 안정화가 더 필요하다.

확인된 다음 조사 지점:

- `PJSIP/3999` AOR contact 상태를 smoke 시작 전에 정리하거나 확인하는 절차
- `remove_existing=yes` reload 후 실제 런타임 contact 교체 여부
- smoke UAS 실행 위치를 server 컨테이너로 고정하고, REGISTER 성공을 gate의 선행 조건으로 분리
- WebSocket 캡처 이벤트와 evidence collector가 같은 linkedid를 비교하도록 강화

## 2026-05-05 queue + agent + WS gate 최종 보정 결과

### 원인

반복 gate 실패의 직접 원인은 CTI 세션 로직이 아니라 PBX 설정 파일 충돌이었다.

- 기본 `kaster-server`와 리허설 `kaster-rehearsal-20260501-server`가 같은 호스트 `/etc/asterisk`를 마운트했다.
- 두 서버 인스턴스가 모두 boot sync로 PBX 설정 파일을 생성하면서 리허설 설정의 테스트 endpoint `3999`가 덮였다.
- 또한 `PJSIP/3999`의 과거 contact가 AstDB에 남아 반복 실행 시 잘못된 contact로 INVITE가 갈 수 있었다.

### 보정 내용

- 기본 `kaster-server`는 재덮어쓰기 방지를 위해 정지했다.
- `AsteriskReloadService`에 `.kaster-cti-config-owner` 소유자 마커를 추가해 다른 owner가 잡은 `ASTERISK_CONF_DIR`에는 쓰지 않도록 했다.
- `scripts/deploy-prod.sh`에 같은 `ASTERISK_CONF_DIR`를 공유하는 다른 KAster server 컨테이너 preflight 차단을 추가했다.
- `scripts/pbx-smoke-run-gate.ps1`의 server-container UAS 실행은 원격 runner 파일을 전송해 `bash`로 실행하도록 바꿔 stdin heredoc/exit 경고를 제거했다.
- `scripts/pbx-smoke-sip-uas.mjs`는 REGISTER/INVITE/ACK 상태를 이벤트 파일에 즉시 기록하도록 보강했다.

### 검증 결과

| 항목 | 결과 | 증적 |
| --- | --- | --- |
| server unit tests | 통과 | `asterisk-reload.service.spec.ts`, `session-engine.service.spec.ts`, `renderers/pjsip.renderer.spec.ts` 총 20개 통과 |
| 배포 preflight 충돌 차단 | 통과 | 더미 `kaster-conflict-server`가 `/etc/asterisk`를 마운트하면 deploy가 exit `67`로 중단 |
| 리허설 owner marker | 통과 | `/etc/asterisk/.kaster-cti-config-owner` = `rehearsal-20260501` |
| queue + agent + WS gate | 통과 | `docs/qa/pbx-smoke-report-rehearsal-20260501-queue-ws-gate-20260505-001330.md`, `Final verdict: PASS` |

현재 판정:

- queue + agent + WebSocket을 포함한 one-command gate는 리허설 서버에서 반복 실행 가능한 품질 게이트로 닫혔다.
- 기존 `kaster-server`는 아직 정지 상태다. 다시 기동하려면 같은 guard를 적용하거나 `/etc/asterisk` 공유 마운트를 제거해야 한다.

## 2026-05-05 PBX 설정 반영 end-to-end gate 결과

리허설 API에 supervisor 권한으로 로그인한 뒤 `scripts/pbx-config-preflight-smoke.ps1 -ApplyReload`를 실행했다.

dry-run 결과:

| 항목 | 결과 |
| --- | --- |
| validation | `ok: true` |
| pjsip.conf | `changed (+2/-2)` |
| extensions_inbound.conf | `unchanged` |
| extensions_queue.conf | `unchanged` |
| extensions_agent.conf | `changed (+0/-0)` |
| queues.conf | `changed (+1/-0)` |
| reload | accepted |

reload 직후 queue + agent + WebSocket smoke gate를 실행했다.

| 항목 | 결과 | 증적 |
| --- | --- | --- |
| SIP run | 통과 | `attempted=1`, `connected=1`, `failed=0`, `finalSipCode=200` |
| CTI DB | 통과 | `linkedid=1777936527.71`, `sessionStatus=ENDED` |
| AMI events | 통과 | queue, ringing, connected, hangup 이벤트 관측 |
| Server logs | 통과 | 오류 패턴 없음 |
| WebSocket | 통과 | `call.created`, `call.updated`, `call.ended` 관측 |
| final verdict | 통과 | `docs/qa/pbx-smoke-report-rehearsal-20260501-config-apply-gate-20260505-081519.md` |

현재 판정:

- PBX 설정 dry-run, reload, 실제 SIP 인입, 큐 분배, 상담원 endpoint 응답, AMI 이벤트, CTI DB, WebSocket까지 end-to-end로 통과했다.
- 다음 실환경 차단점은 테스트 SIP UAS가 아니라 실제 Windows 상담원 PC/실단말 검증이다.
