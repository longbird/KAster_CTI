# ARS `HTTP_LOOKUP` P2 작업 기록

작성일: 2026-09-02
설계서: [`../design/2026-09-02-ars-http-lookup-design.md`](../design/2026-09-02-ars-http-lookup-design.md)
P1 기록: [`2026-09-02-ars-http-lookup-p1-worklog.md`](2026-09-02-ars-http-lookup-p1-worklog.md)

P2 = 통화 경로 연결. **여기부터 dialplan 이 바뀐다.**

---

## 1. 넣은 것

| 조각 | 파일 |
|---|---|
| AGI 스크립트 | `ars-http-lookup/ars-http-lookup-agi.ts` |
| AGI 가 부르는 내부 엔드포인트 | `ars-http-lookup/ars-http-lookup-internal.controller.ts` |
| `HTTP_LOOKUP` 노드 | `flow-graph.types.ts` + `node-config.parser.ts` |
| 컴파일러 | `renderers/ars-flow.renderer.ts` |
| 검증기 10~14 | `flow-graph.validator.ts` |
| 지표 | `ars-http-lookup.service.ts` (`kaster_ars_http_lookup_*`) |
| 편집기 | `ars-flow-builder/` 노드 카드·속성 패널·간선 규칙 |

컴파일 결과:

```asterisk
 same => n(node-2-lookup),NoOp(ARS node 등급조회)
 same => n,Playback(<조회 중 안내>)                       ; 있을 때만
 same => n,AGI(/var/.../kaster-ars-http-lookup.agi,<endpointId>)
 same => n,GotoIf($["${ARS_LOOKUP_STATUS}"="MATCH"]?node-2-lookup-match)
 same => n,<실패 갈래>
 same => n(node-2-lookup-match),NoOp(ARS lookup matched ${ARS_LOOKUP_VALUE})
 same => n,<성공 갈래>
```

성공 갈래를 **뒤에 라벨로** 둔다. 실패 갈래가 여러 줄로 끝날 수 있어 `GotoIf(...?목적지)`
한 줄에 밀어 넣을 수 없기 때문이다.

---

## 2. 설계에서 온 판단이 코드에 남은 곳

- **AGI 는 실패 시 `ERROR` 다.** `kaster-agent-offer.agi` 는 실패하면 ACCEPT 로 여는데 여기는 반대다.
  조회가 안 됐는데 됐다고 하면 엉뚱한 사람이 VIP 큐로 들어간다.
- **AGI 인자는 `endpointId` 하나뿐이다.** 나머지(테넌트·발신번호·입력값·DID·linkedid)는 채널에서 읽는다.
  dialplan 인자에 값이 늘수록 인용 규칙이 깨지기 쉽다.
- **AGI 가 값을 한 번 더 깎는다.** 서버가 이미 깎아서 주지만, 이 스크립트가 dialplan 변수를
  직접 쓰는 마지막 지점이다.
- **내부 엔드포인트는 던지지 않는다.** 실패도 `{ status: 'ERROR' }` 로 준다 — 5xx 를 내면
  통화 처리가 아니라 스크립트 예외로 새어 나간다.
- **`NOMATCH` 와 `ERROR` 가 같은 `FALSE` 로 간다.** 편집기에서도 오류 전용 간선을 만들 수 없다.

### 2.1 쓰기 저하 모드에서 막지 않는다

내부 조회 엔드포인트는 `INTENTIONALLY_OPEN` 에 넣었다. POST 지만 **우리 설정을 쓰지 않는다** —
진행 중인 통화의 조회다. 막으면 ARS 가 전부 실패 갈래로 떨어진다(제1원칙).

---

## 3. 설계와 달라진 것

**검사 14 를 다르게 구현했다.** 설계서는 "`waitPromptKey` 길이 + `timeoutMs` 합이 5초를 넘으면 경고"
였는데, **프롬프트에 재생 시간이 없다** (`AsteriskPrompt` 에 duration 컬럼이 없다).

대신 **안내를 붙인 채 대기가 3초를 넘으면** 경고한다. 합이 상한에 닿을 수 있다는 사실은 같은 방식으로 알린다.

---

## 4. 함께 고친 것 — `CONDITION` 의 같은 결함

`HTTP_LOOKUP` 의 "여러 줄 목적지" 문제를 풀다가, **`CONDITION` 노드에 같은 결함이 이미 있는 것**을
찾았다. `GotoIfTime` 의 목적지 자리에 애플리케이션을 넣고 있었다.

```asterisk
; 참일 때 목적지가 "안내 후 종료" 면 이렇게 나왔다 — 잘못된 dialplan 이고 Hangup 은 사라진다
same => n,GotoIfTime(09:00-18:00,mon,*,*?Playback(vm-goodbye))
```

`HTTP_LOOKUP` 과 같은 라벨 방식으로 고쳤다. **한 줄짜리 목적지는 예전 그대로 조건 안에 둔다** —
이미 잘 돌던 플로우의 컴파일 결과를 바꾸지 않기 위해서다.

원래 코드에는 같은 내용의 `if/else` 가 있었다(두 갈래가 동일). 고치면서 함께 걷어냈다.

---

## 5. 검증 결과 (2026-09-02 실행)

| 항목 | 명령 | 결과 |
|---|---|---|
| 조회 모듈 | `npx jest src/modules/ars-http-lookup` | 98 passed / 8 suites |
| 플로우 | `npx jest src/modules/ars-flow` | 108 passed |
| 렌더러 전체 | `npx jest src/modules/asterisk-config` | 259 passed |
| 서버 전체 | `npm test` | **1504 passed / 160 suites, 실패 0** |
| 서버 린트·빌드 | `npm run lint` / `npm run build` | 0 error / exit 0 |
| 관리자 | `npx vitest run` + `npx tsc -b` + `vite build` | 313 passed / 57 files, 오류 0, 빌드 성공 |
| OpenAPI | `npm run openapi:export` | 반영 |

---

## 5.1 실 왕복 검증 (2026-09-02, 로컬)

Docker 를 띄우고 마이그레이션을 적용한 뒤, **서버·DB·HTTP·AGI 를 전부 진짜로** 한 번씩 돌렸다.

| 확인 | 결과 |
|---|---|
| 마이그레이션 적용 | `npm run prisma:sync` → `arsHttpEndpoints` 생성 확인 |
| 엔드포인트 등록 | 성공. 응답에 `hasSecret:true` 만 있고 암호문·평문 없음 |
| DB 의 시크릿 | `yu5u/9Sl...` 암호문. 평문 없음 |
| 조회 성공 | `status=MATCH value='VIP' 53ms`, 스텁이 복호된 `x-api-key` 를 받음 |
| 조회 불일치 | `status=NOMATCH value=''` |
| 엔드포인트 중지 | 5회 연속 `TRANSPORT_ERROR` 각 **2004~2017ms**(타임아웃 실측) |
| 차단기 | 6·7번째 `BREAKER_OPEN` **1ms** — 통화당 2초를 아낀다 |
| AGI 내부 경로 | 시크릿 맞으면 `MATCH`, 틀리면 401 |
| **AGI 스크립트 실행** | AGI 프로토콜 하네스로 실제 실행 — MATCH/NOMATCH/ERROR 3케이스 모두 정확, `exit=0` |

### SSRF 가드가 실제로 막았다

스텁을 `127.0.0.1` 에 두고 등록하니 거부됐다:
`endpoint host resolves to a blocked address: 127.0.0.1`. 사설 대역(`192.168.0.210`)으로 옮겨서야 등록됐다.

### 실 왕복이 아니면 못 잡았을 결함

**`@IsUUID()` 가 이 시스템의 테넌트 id 를 거부했다.** AGI 가 보내는 모든 요청이 400 이었다.

class-validator 0.14 의 `isUUID` 는 버전 니블(3번째 묶음 첫 글자 1~8, 4번째 8/9/a/b)을 요구하는데,
시드가 만든 `00000000-0000-0000-0000-000000000001` 은 그걸 통과하지 못한다. AGI 는 채널에서 읽은
그 값을 그대로 보낸다. **단위 테스트는 DTO 계층을 건너뛰므로 잡히지 않았다.**

UUID **모양**만 보는 정규식으로 바꾸고 회귀 spec 을 붙였다.
저장소를 훑어본 결과 `tenantId` 를 `@IsUUID()` 로 받는 DTO 는 이것 하나뿐이었다 —
나머지는 전부 DB 가 만든 v4 만 받는다.

## 5.2 개발서버 배포 (2026-09-02)

| 확인 | 결과 |
|---|---|
| 마이그레이션 | 컨테이너 부팅 시 적용됨 (`arsHttpEndpoints` 조회 성공) |
| 자격 끈 상태 | `GET /admin/ars-http-endpoints` → **403** "이 테넌트에는 ARS 외부 조회 기능이 열려 있지 않습니다" |
| 자격 켠 뒤 | **200** `[]` |
| 역할 게이트 | supervisor 는 목록 O, 등록 X (`required roles: admin`) |
| AGI 내부 경로 | 살아 있고 잘못된 시크릿을 401 로 거절 |
| 관리자 번들 | `index-BfAXwtgr.js` — 방금 만든 해시와 일치 |

원격 `docker-compose.dev.yml` 에 `ARS_HTTP_LOOKUP_ENABLED` / `ARS_HTTP_SECRET_KEY` 두 줄을 추가했다.
그 파일이 env 를 **하나씩 명시적으로** 넘기는 구조라 `.env` 만 고쳐서는 컨테이너에 닿지 않는다.
compose 를 고쳤으므로 `restart` 가 아니라 `up -d --no-build` 로 재생성했다.

개발서버에 `ars-http-lookup` 자격을 **켜 둔 채로 남겼다** (`ars-flow-builder` 와 같은 상태).

## 6. 남은 것

### P3 — 파일럿 DID 실통화 (사람이 해야 한다)

확인할 것:
1. 조회가 성공했을 때 맞는 큐로 가는가
2. **엔드포인트를 꺼두고** 걸었을 때 실패 갈래로 가는가 (설계의 핵심 약속)
3. 차단기가 열린 동안 통화가 빨리 실패 갈래로 떨어지는가
4. 조회 중 안내가 들리는가, 무음 구간이 견딜 만한가

### 아직 못 한 것

- ~~마이그레이션 미적용~~ → 로컬·개발서버 모두 적용 완료 (§5.1, §5.2)
- ~~AGI 실행 미검증~~ → 하네스로 실제 실행 확인 (§5.1). 다만 **실 Asterisk 가 부른 적은 없다** —
  dialplan 에서의 인자 전달과 `Playback` 타이밍은 P3 에서 처음 확인한다
- 동시 실행 상한 20은 **노드 프로세스 안의 카운터**다. 멀티노드면 노드 수만큼 곱해진다.
