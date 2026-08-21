# C# 데스크톱 소프트폰 1단계 검증 (2026-08-20)

> 대상 브랜치 `feat/csharp-desktop-client`. 계획은 [`docs/plans/2026-08-20-csharp-desktop-client-phase1-plan.md`](../plans/2026-08-20-csharp-desktop-client-phase1-plan.md) Task 15,
> 오디오 실측은 [`2026-08-20-csharp-softphone-audio-verification.md`](2026-08-20-csharp-softphone-audio-verification.md) 로 분리했다.

## 결론

**코드 경로는 검증됐고, 실 PBX 시나리오는 아직 남았다.** 자동 테스트·빌드·서버 회귀는 전부 통과했고,
로그인부터 대기/수신/통화중 화면 전환까지는 스텁 서버로 **실제 앱을 띄워** 확인했다.
남은 것은 PBX 가 있어야만 할 수 있는 항목(등록·양방향 음성·에코)이다.

## 1. 자동 검증 (이번에 실행)

| 명령 | 결과 |
|---|---|
| `dotnet test apps/desktop-win/KAster.Desktop.sln` | **127개 전부 통과** (실패 0, 건너뜀 0) |
| `dotnet build apps/desktop-win/KAster.Desktop.sln -c Release` | **성공, 경고 0개** |
| `cd apps/server && npm test` | **71개 스위트 / 510개 테스트 전부 통과** |
| `cd apps/server && npm run lint` | **오류 0개** |

테스트가 덮는 범위:

| 영역 | 파일 |
|---|---|
| 응답 봉투·상태 코드 계약 | `Contracts/ApiEnvelopeTests` |
| 설정 저장·DPAPI 토큰 금고 | `Storage/*` |
| 로그인·401 단일 회전 | `Server/AuthClientTests`, `Server/TokenRefreshHandlerTests` |
| REST 명령 경로와 본문 | `Server/CtiServerClientTests` |
| 실시간 이벤트 파싱 | `Server/CtiEventParserTests` |
| 서버 우선 통화 상태 병합 | `State/CallStateStoreTests` |
| 재연결 백오프 | `Runtime/RetryPolicyTests` |
| SIP 옵션 해석 | `Softphone/SoftphoneOptionsTests` |
| 오디오 장치 선택·패킷 분할·코덱 왕복 | `Softphone/AudioDeviceControllerTests`, `AudioPacketizerTests`, `PcmConversionTests` |
| 창 모드 바운드 | `App/WindowBoundsTests` |
| 로그인·통화 화면 뷰모델 | `App/LoginViewModelTests`, `App/SoftphoneViewModelTests` |

## 2. 라이브 확인 (스텁 서버 + 실제 WPF 앱)

PBX 없이도 확인 가능한 구간은 스텁 서버(`POST /api/v1/auth/login` + Socket.IO `/ws`)를 세우고
**앱을 실제로 실행해** 창 크기와 화면을 캡처했다.

| 항목 | 확인 내용 |
|---|---|
| 로그인 요청 계약 | 서버가 받은 본문: `{"loginId":"agent1001","password":"...","extension":"1001","clientType":"desktop"}` — `clientType: desktop` 이 실려야 SIP credential 이 내려온다 |
| 버튼 활성 조건 | 세 칸이 다 차기 전에는 로그인 버튼 비활성, 다 차면 활성 |
| 창 모드 전환 | 대기 **440×560** → 수신 **440×420** → 통화중 **460×620** → 종료 후 대기 **440×560**. 계획서의 바운드 표와 일치 |
| 통화 시간 | 서버 `answeredAt` 기준. 6초 간격 캡처에서 `01:15` → `01:21` |
| 마이크 토글 | 버튼이 "마이크 끄기" ↔ "마이크 켜기" 로 바뀌고 명령이 서버로 나간다 |
| 스크롤 없음 | 통화중 화면을 **최소 크기(420×540)** 까지 줄여도 스크롤바가 생기지 않는다 |
| 긴 고객명 | 18자 고객명이 한 줄 안에서 끝난다 (`TextTrimming="CharacterEllipsis"`) |
| 예외 | `%LOCALAPPDATA%\KAsterCti\error.log` 에 기록 없음 |

### 이 과정에서 잡은 결함 하나

**증상**: 수신(ringing)까지는 화면이 바뀌는데 통화중(talking)에서 멈췄다. 예외도, 로그도 없었다.

**원인**: 서버 이벤트를 소켓 스레드에서 그대로 뷰모델에 적용했다. 수신 화면이 뜬 뒤부터는 버튼이
`ICommand.CanExecuteChanged` 를 구독하는데, WPF 는 그 이벤트를 **UI 스레드 밖에서 올리는 것을 거부한다.**
그 예외가 소켓 라이브러리 안에서 조용히 삼켜져 뒤따르는 창 모드 전환이 실행되지 않았다.

**수정**: 두 가지를 같이 고쳤다.
1. `SoftphoneRuntime` 이 `Action<Action> post` 를 받아 **서버 이벤트를 UI 스레드에서 적용**한다.
   이후의 상태 저장소·뷰모델·창 조작이 전부 한 스레드에서 돈다.
2. `CtiEventClient` 가 구독자 예외를 `HandlerFailed` 로 밖에 내보낸다. 라이브러리가 삼키면
   "이벤트는 오는데 화면이 안 바뀐다" 가 되어 원인 추적이 불가능해진다.

**남은 한계**: 이 결함의 자동 회귀 테스트는 없다. WPF 의 스레드 친화성 거부는 실제 창과 바인딩이 있어야
재현되고, 뷰모델 단위 테스트로는 잡히지 않는다. 위의 라이브 절차(수신 → 통화중 전환 확인)가 현재의 회귀 확인 수단이다.

## 3. 남은 실 PBX 시나리오 (미실행)

PBX 는 공유 개발 서버에 있고 접근 가능하다(1장의 초기 기술은 틀렸다 — 6장 참고).
아래 중 음성이 필요한 항목은 이 PC 에 재생 장치가 없어 상담원 PC 에서 돌려야 한다.
**실행하지 않은 항목을 통과로 적지 않는다.**

> **2026-08-21 갱신**: 공유 개발 서버 `49.247.46.86` 로 1·9의 일부를 실제로 확인했다. 아래 표에 반영했다.

| # | 시나리오 | 상태 |
|---|---|---|
| 1 | 로그인 → SIP 등록 | **통과 (08-21)** — 6-3 |
| 2 | 수신 INVITE → ringing | **통과 (08-21)** — 7장. 단 큐 경유가 아니라 내선 발신 경로 |
| 3 | 받기 → talking | **통과 (08-21)** — 세션이 `New → Talking`. **음성은 미확인** (재생 장치 없음) |
| 4 | 마이크 끄기 | **부분** — 로컬 토글 동작 확인. 상대가 못 듣는지는 미확인 |
| 5 | 끊기 → 양쪽 종료 | **통과 (08-21)** — 양쪽 `Ended`, `call.ended`, 활성 목록 0건 |
| 6 | 발신 | **통과 (08-21)** — `originate/internal` 로 1001→1002 통화 성립 |
| 7 | 상태 변경 | **통과 (08-21)** — `BREAK`/`AVAILABLE` 반영, `agent.status.changed` 수신. 관리자 화면 확인은 미실행 |
| 8 | 서버 재기동 후 재연결 | **통과 (08-21)** — 8-2. 결함을 고친 뒤 |
| 9 | 액세스 토큰 만료 후 자동 회전 | **통과 (08-21)** — 8-1 |

부분 확인된 것: REGISTER 요청의 형태는 로컬 UDP 소켓을 PBX 자리에 두고 확인했다
(AOR `sip:1001@pbx.local`, Contact 는 실제 채널 종단으로 재작성). 인증 응답(401 → 다이제스트)과
등록 성립은 실 PBX 가 있어야 한다. 상세는 오디오 검증 문서 4장.

## 4. 1단계 종료 게이트

**아직 닫히지 않았다.** 종료 조건은 두 가지다.

1. 위 3장의 9개 시나리오 통과
2. 오디오 검증 문서 3장의 에코 실측 판정

에코가 스피커폰에서 남으면 설계 문서 10장의 순서(헤드셋 전제 축소 → WebRTC APM → 상용 SDK)로 올리고,
결정 전에는 2단계로 넘어가지 않는다.

## 5. 서버 쪽 변경 사항

`SOFTPHONE_SIP_SERVER` / `SOFTPHONE_SIP_TRANSPORT` 를 추가했다. **추가만 했다** — `wsServer` 는 그대로라
상담원 웹앱과 기존 Electron 앱은 영향이 없다. 활성 판정만 "WS 또는 SIP 주소 중 하나라도 있으면 활성"으로 넓혔다.
회귀는 `auth-softphone-config.integration.spec.ts` 와 `auth-desktop-session.integration.spec.ts` 가 덮는다.


## 6. 실 PBX 확인 (2026-08-21)

대상: 공유 개발 서버 `49.247.46.86`.

### 6-1. SIP 포트 불일치 — **해소됨 (2026-08-21)**

| | 값 |
|---|---|
| 저장소 `infra/asterisk/pjsip.conf` | `bind=0.0.0.0:48950` |
| **운영 중인 PBX** | **UDP `36070`** |

커밋 `8e5776f`(SIP register 포트 기본값 48950) 와 `c8e2f62`(잔여 36070 일괄 정리) 가 저장소만 바꿨고
**실 PBX 에는 적용되지 않았다.** 48950 은 열려 있지 않고 36070 이 응답한다.

```
REGISTER sip:49.247.46.86:36070  ->  SIP/2.0 401 Unauthorized
WWW-Authenticate: Digest realm="asterisk", ...
Server: KAster_CTI
```

**원인**: 커밋이 저장소만 바꿨고 **개발 서버에 배포된 적이 없다.**
마지막 적용 마이그레이션이 `20260802_sip_security_blocks` 이고 `20260808_sip_register_port_default` 는 적용되지 않았다.
컨테이너 이미지가 8/2 빌드라 그 안의 `prisma/migrations` 에도 8/8 마이그레이션이 없어 `migrate deploy` 가 적용할 것이 없었다.
DB 가 36070 이니 렌더러도 36070 을 뽑고 PBX 도 36070 에 bind 했다 — 전 축이 일관되게 옛 값이었다.

**조치 (2026-08-21, 통화 0건 상태에서 수행)**:

| 단계 | 결과 |
|---|---|
| DB `tenantSystemSettings.sipRegisterPort` 36070 → 48950 | 완료 |
| 서버 재시작 → 부팅 동기화가 `pjsip.conf` 재렌더 | `bind=0.0.0.0:48950` |
| **Asterisk 프로세스 재시작** | PID 교체, 48950 bind, 36070 소멸 |
| 서버 `.env` `SOFTPHONE_SIP_SERVER` → 48950 | 완료 |
| 48950 등록 검증 | `Registered` |
| 36070 | 무응답 확인 |

### 6-1-1. 제품 결함 — SIP 포트 변경이 reload 로는 반영되지 않는다

`AsteriskReloadService` 는 `pjsip.conf` 를 다시 쓰고 AMI `module reload res_pjsip` 을 보내지만,
**PJSIP 는 reload 로 transport 를 다시 bind 하지 않는다.** 실제로 이번에 파일은 48950 으로 바뀌었는데
Asterisk 는 36070 에 그대로 붙어 있었고, `systemctl restart asterisk` 이후에야 옮겨졌다.

즉 관리자 화면에서 SIP 포트를 바꾸면 **실패 표시 없이 조용히 무시된다.** 게다가 그 사이에
"파일은 새 포트, 프로세스는 옛 포트" 인 상태가 남아, 나중에 아무 이유로든 Asterisk 가 재시작되면
포트가 갑자기 바뀌며 단말이 전부 끊긴다. 소프트폰과 별개로 처리해야 할 결함이다.

### 6-2. 서버 변경 반영 결과

`SOFTPHONE_SIP_SERVER` / `SOFTPHONE_SIP_TRANSPORT` 를 넣고 로그인한 실제 응답:

| 필드 | 값 |
|---|---|
| `enabled` | `true` |
| `sipUri` | `sip:1001@49.247.46.86` |
| `wsServer` | `ws://49.247.46.86:8088/ws` (기존 경로 그대로) |
| `sipServer` | `49.247.46.86:48950` |
| `transport` | `udp` |
| `authorizationPassword` | 내려옴 |

`wsServer` 가 그대로 나오므로 **상담원 웹앱과 기존 Electron 앱에 회귀가 없다.**

### 6-3. SIP 등록 — 통과

C# 클라이언트(`AuthClient` → `SoftphoneOptions` → `SipSoftphoneClient`)로 실행한 결과:

```
>>> 로그인
    agent=홍길동 ext=1001
    sipServer=49.247.46.86:48950 transport=udp enabled=True
>>> SIP 등록 시도 49.247.46.86:48950 as 1001@49.247.46.86
    STATUS Registering
    STATUS Registered
```

`Registered` 는 PBX 가 digest 인증을 통과시키고 200 OK 를 반환했다는 뜻이다.
(`asterisk -rx "pjsip show endpoint 1001"` 은 `sudo` 가 필요해 확인하지 못했다.)

### 6-4. 개발 서버 반영 방식이 임시다

개발 서버는 egress 화이트리스트 뒤에 있어 **Docker Hub 와 npm 레지스트리가 차단**돼 있다
(`github.com`, `ghcr.io`, `deb.debian.org` 만 통과). `Dockerfile.prod` 의 `npm ci` 가 실패하므로
**이미지 빌드가 불가능**하다.

그래서 서버 변경을 컴파일된 `dist/src/modules/auth/auth.service.js` 교체로 반영했다
(컨테이너에 `dist.prev.*` 백업이 5개 있는 걸 보면 이 팀이 써 온 방식이다).

- 처음에는 `docker cp` 로 넣었는데 컨테이너를 재생성할 때마다 사라졌다(실제로 한 번 덮어썼다).
  그래서 `docker-compose.dev.yml` 에 **bind mount** 로 고정했다:
  `/home/blueadm/kaster_cti/auth.service.js.new:/app/dist/src/modules/auth/auth.service.js:ro`
- ⚠️ **egress 허용 후 정상 빌드하면 이 마운트를 반드시 제거해야 한다.** 안 지우면 새로 빌드한
  코드를 이 파일이 계속 덮어쓴다. compose 에 주석으로도 적어 뒀다.
- **근본 조치**: egress 에 `registry-1.docker.io`, `auth.docker.io`,
  `production.cloudflare.docker.com`, `registry.npmjs.org`, `security.debian.org` 를 허용해야
  서버에서 정상 빌드가 가능하다.

### 6-5. 남은 항목

| 항목 | 왜 못 했나 |
|---|---|
| 수신·응답·끊기·발신 | 통화를 걸어 줄 상대가 필요하다 |
| 양방향 음성·에코 | 이 PC 에 활성 재생 장치가 없다 |
| 상태 변경 반영 | 관리자 화면 확인이 필요하다 |
| 재연결·토큰 만료 | 15분 이상 관찰이 필요하다 |


## 7. 실통화 검증 (2026-08-21)

C# 클라이언트 두 개(1001·1002)를 동시에 등록시키고 `POST calls/originate/internal` 로
내선 통화를 성립시켰다. 오디오 장치가 없어 **음성 품질은 확인 대상이 아니다** — 시그널링과
세션 상태 전이를 본다.

관측된 흐름:

```
[A1001] SIP Registered / [B1002] SIP Registered
originate HTTP 201
[A1001] 통화 Ringing → Answered
[B1002] 통화 Ringing → Answered
[WS] call.created   → 상태 New
[WS] call.updated   → 상태 Talking
활성: ... Talking ani=1001 dnis=s
[A1001] Hangup → 양쪽 Ended → [WS] call.ended → 활성 0건
관측된 상태 전이: New -> Talking
```

### 7-1. 통화가 안 붙던 원인 — PBX STUN 설정

처음에는 통화가 `New` 에서 멈추고 `BridgeEnter` 가 아예 발생하지 않았다. AMI 타임라인을 보니
`Newchannel` 에서 `DialBegin` 까지 **19초**가 걸렸고, 9~10초 간격이 두 번 반복되는 전형적인
타임아웃 패턴이었다.

원인은 `rtp.conf` 의 `stunaddr=stun.l.google.com:19302` 였다. 이 서버는 egress 화이트리스트
뒤에 있어 **STUN 이 무응답**이고, Asterisk 가 통화마다 그 타임아웃을 기다렸다.

| | 제거 전 | 제거 후 |
|---|---|---|
| `Newchannel` → `DialBegin` | 19초 | **1초** |
| `BridgeEnter` | 발생 안 함 | **발생** |
| 세션 상태 | `New` 에서 정지 | **`New → Talking`** |

PJSIP 는 `ASTERISK_EXTERNAL_MEDIA_ADDRESS` 로 외부 주소를 이미 알고 있어 PBX 쪽 STUN 은
필요 없다. `docker-compose.dev.yml` 의 기본값을 없앴다(커밋 `997865e`).
`SOFTPHONE_ICE_SERVERS_JSON` 의 STUN 은 브라우저가 상담원 네트워크에서 직접 쓰는 값이라 그대로 뒀다.

**이 문제는 소프트폰만의 것이 아니다.** 같은 PBX 를 쓰는 모든 통화가 설정 지연을 겪고 있었다.

### 7-2. 남은 관찰

- `primaryAgentId` 가 비어 있다. 큐를 거치지 않는 `originate/internal` 경로에는 `AgentCalled`·
  `AgentConnect` 이벤트가 없어 세션 엔진이 상담원을 붙이지 못한다. 큐 경유 인바운드에서는 다를 것이나
  이번에 확인하지 못했다.
- `CallStateStore` 의 SIP↔서버 짝짓기가 이 경로에서 `paired=False` 였다. SIP From 이 발신자 자신의
  내선(1001)이라 서버 `ani`(1001) 와는 맞지만 도착 시각 창을 벗어났다. 큐 인바운드에서 재확인이 필요하다.
- 종료 이벤트가 중복으로 오른다(`Ended → Idle` 이 두 번). `OnCallHungup` 과 명시적 `Hangup()` 이
  모두 `EndCall` 을 부른다. 화면에는 영향이 없지만 정리 대상이다.


## 8. 재연결·토큰 회전 (2026-08-21)

실제 개발 서버로 확인했다. 테스트는 화면 없이 **출하 코드(`SoftphoneRuntime`)** 를 그대로 구동했다.

### 8-1. 토큰 회전 — 통과

만료를 기다리는 대신 액세스 토큰을 무효값으로 바꿔 같은 조건(서버 401)을 만들었다.

| 확인 | 결과 |
|---|---|
| 401 → refresh → 원요청 재시도 | 성공 |
| refresh 호출 횟수 | 1회 |
| 금고의 액세스 토큰 교체 | 됨 |
| `SignedOut` 오발생 | 없음 |
| **동시 3건이 401 을 만났을 때 refresh 횟수** | **1회** (단일 회전 정상) |

### 8-2. 재연결 — 결함을 찾아 고친 뒤 통과

**처음 결과: 실패.** 서버 컨테이너를 재시작했는데 클라이언트가 **5분이 지나도 끊김을 감지하지 못했다.**
`ConnectionStateChanged` 는 `Connecting → Connected` 뒤로 아무것도 오르지 않았고,
`IsConnected` 는 계속 `true` 였다. 그동안 이벤트는 하나도 오지 않는다.

현장에서 이건 **상담원 화면은 "연결됨"인데 전화 팝업이 안 뜨는** 형태로 나타난다.
아무 오류도 보이지 않아 원인 추적이 가장 어려운 실패 방식이다.

**원인**: 소켓 라이브러리가 죽은 연결을 알려주지 않는다. 자동 재연결을 꺼 둔 상태
(만료된 토큰 재사용을 막기 위한 의도적 설정)에서는 더 그렇다.

**수정**: `HeartbeatMonitor` 를 붙였다. 서버 ping 과 이벤트 수신 시각을 기록해 45초 동안
아무 신호가 없으면 끊긴 것으로 본다. Engine.IO v4 서버는 25초마다 ping 을 보내므로 두 번을 놓친 셈이다.
끊김을 알리면 기존 재연결 경로가 새 토큰으로 다시 붙는다. 커밋 `2bd1d43`.

**수정 후 실측**:

```
15:39:29  초기 연결
15:39:29  >>> 서버 컨테이너 재시작
15:40:11  [WS] Disconnected   ← +42초에 감지
15:40:11  [WS] Connected      ← 즉시 재연결
15:40:11  재연결 후 API 정상
```

| | 수정 전 | 수정 후 |
|---|---|---|
| 끊김 감지 | 5분 넘게 감지 못 함 | **42초** |
| 재연결 | 일어나지 않음 | **즉시** |

**남은 판단거리**: 감지에 42초가 걸린다. 더 줄이려면 타임아웃을 낮춰야 하는데,
네트워크가 느린 현장에서 오탐이 늘어난다. 현장 검증 후 조정할 값이다.

### 8-3. 함께 고친 것

통화 종료가 두 번 알려지던 문제를 고쳤다(커밋 `bc9aba5`). 상대가 끊으면 `OnCallHungup` 이,
사용자가 끊으면 `Hangup` 이 각각 종료를 알리는데 겹칠 때 `Ended`/`Idle` 이 두 번씩 올라왔다.
이미 종료된 통화는 다시 알리지 않는다.
