# ARS 플로우 빌더 Phase 3 작업 기록

작성일: 2026-09-02
계획서: [`docs/plans/2026-09-01-ars-flow-builder-plan.md`](../plans/2026-09-01-ars-flow-builder-plan.md) Phase 3
설계서: [`docs/design/2026-09-01-ars-flow-builder-design.md`](../design/2026-09-01-ars-flow-builder-design.md)

Phase 3 의 세 항목 중 **`COLLECT_DIGITS` 와 IVR 메뉴 가져오기**를 넣었다.
Smart ARS·수신거부 가져오기와 `HTTP_LOOKUP` 은 남았고, 남긴 이유를 아래에 적는다.

---

## 1. `COLLECT_DIGITS` (커밋 bd400e4)

숫자 여러 자리를 받아 `SMS`/`OPT_OUT` 의 **대상 번호**로 쓴다. 고객이 *다른 번호*를 눌러 넣는
경로이고, 080 수신거부의 "번호 재입력" 과 같은 시나리오다.

설계서 D3 은 이 노드를 미루면서 "받은 숫자를 무엇에 쓰는지" 를 정하지 않았다.
2026-09-02 에 **대상 번호로 쓴다**로 결정했다(사용자). 통화 세션에 기록해 상담원에게 보여주는
쪽은 UserEvent 저장 경로가 없어 마이그레이션부터 필요해서 고르지 않았다.

- 받은 값은 채널 변수 `ARS_COLLECTED_DIGITS` 하나에 담는다. 한 통화에서 여러 번 받으면 마지막 값이 남는다.
- `SMS`/`OPT_OUT` 의 `targetSource` 가 `CALLER`(기본) / `COLLECTED` 를 고른다.
  **이 필드가 없던 기존 그래프는 전부 `CALLER` 로 읽힌다** — 렌더 결과가 바뀌면 안 된다.
- 훅이 이미 대상 번호를 인자로 받으므로 서버 런타임 변경은 없다.
- 컴파일은 `Read()` + 재시도 라벨이다. guarded digit AGI 는 *한 자리* 전용이라 쓰지 않았다.

검증기에 `DIGITS_NOT_COLLECTED` 를 넣었다. 입력을 받지 않고도 닿을 수 있는 소비 노드는 저장을 막는다.
빈 번호로 수신거부가 등록되면 고객이 전화를 끊은 뒤라 아무도 모른다.
**수집 실패(TIMEOUT) 간선도 '입력 없음'** 이므로 같이 막는다.

---

## 2. IVR 메뉴 가져오기

`importIvrMenu()` — 기존 단층 IVR 메뉴를 DRAFT 플로우로 옮기는 순수 함수.
`POST /admin/ars-flows/import/ivr-menu` 가 이것을 부른다.

**원래 메뉴와 DID 연결은 건드리지 않는다.** 사람이 확인하고 DID 에 붙이기 전까지 통화는 기존 경로로 흐른다.
검증에 걸리면 만들었던 빈 플로우를 지우고 오류를 그대로 올린다 — 껍데기를 남기지 않는다.

변환 규칙:

| 원본 | 그래프 |
|---|---|
| `welcomePrompt` | `PLAY` 노드 (있을 때만, 진입) |
| `menuPrompt` + `timeoutSecs` | `MENU` 노드, **`maxRetries: 0`** |
| `entries[]` (digit → queue) | `QUEUE` 노드 + `DIGIT` 간선 |
| `exten => t,1,Playback(vm-goodbye)` | `HANGUP` 노드(`vm-goodbye`) + `TIMEOUT` 간선 |

`maxRetries` 가 0 인 것이 중요하다. 기존 단층 IVR 은 시간초과에 **다시 묻지 않는다.**
0 이 아니면 통화가 다르게 흐른다.

---

## 3. 가져오기를 만들다가 드러난 결함 4개

가져온 그래프가 원래와 같게 흐르는지 맞춰보는 과정에서 **기존 구현의 결함이 넷** 나왔다.
넷 다 가져오기와 무관하게 이미 틀려 있던 것이다.

### 3.1 메뉴의 '재시도 횟수' 가 아무 일도 하지 않았다

`MenuConfig.maxRetries` 는 파서·DTO·편집기 화면에 다 있는데 **컴파일러가 읽지 않았다.**
관리자가 화면에서 3회로 설정해도 첫 시간초과에 바로 나갔다.

고쳤다. 재시도가 있으면 안내부터 다시 튼다(`n(prompt)` 라벨로 되돌아간다).
재시도가 0 이면 카운터 자체를 만들지 않아 기존 단층 IVR 과 같은 모양을 지킨다.

### 3.2 안내 파일 경로가 상대경로로 나갔다

플로우 컴파일러는 `Playback(custom/welcome)` 를 냈지만 기존 렌더러는
`Playback(/var/lib/asterisk/sounds/custom/welcome)` 를 낸다. 상대경로로 두면 Asterisk 가
**채널 언어 하위 디렉터리에서 먼저 찾다가 못 찾고 조용히 넘어간다** — 고객에게는 무음이다.

`toPlaybackTarget()` 을 `renderer-utils.ts` 로 옮겨 두 렌더러가 같이 쓰게 했다.

### 3.3 진입에서 채널 언어를 비우지 않았다

기존 Smart ARS 는 `Set(CHANNEL(language)=)` 를 넣는다. 플로우 컴파일러는 빠뜨렸다. 3.2 와 같은 뿌리다. 넣었다.

### 3.4 검증기가 Asterisk 기본 안내를 "없는 프롬프트" 로 봤다

테넌트가 올린 안내는 항상 `custom/` 로 시작한다(`prompt-tts.service` 가 그렇게 만든다).
`vm-goodbye`·`beep` 같은 기본 제공 사운드는 등록 테이블에 없지만 렌더러는 그대로 재생한다.

검증기는 그 구분 없이 전부 등록을 요구해서, **기존 IVR 과 같은 안내를 쓰는 플로우는 저장 자체가 불가능**했다.
`custom/` 로 시작하는 키만 등록을 검사하도록 고쳤다 — `toPlaybackTarget()` 의 분기와 같은 규칙이다.

---

## 4. 설계서 §4.4 조건 2 는 지금 표현으로는 달성 불가능하다

> 2. 가져오기 변환기가 기존 설정 → 그래프 → conf 를 돌렸을 때 **기존 conf 와 바이트 단위로 같다**

두 렌더러는 컨텍스트 이름부터 다르다 — `[ivr-menu-main-menu]` vs `[ars-flow-main-menu]`.
구조도 다르다(플로우는 메뉴마다 별도 컨텍스트를 만든다). 바이트 동등은 설계상 나올 수 없다.

**제안하는 대체 표현**: "가져온 그래프를 컴파일한 결과가 기존 conf 와 **관찰 동등**하다 —
같은 안내 파일, 같은 대기 시간, 같은 디지트→목적지 매핑, 같은 종료 동작."

IVR 메뉴에 대해서는 이 판정을 spec 으로 고정했다
(`ivr-menu.importer.spec.ts` 의 "기존 렌더 결과와의 동등성" 4건 — 환영 안내 유무, `custom/` 안내, 단일 디지트).

---

## 5. 남은 것과 남긴 이유

### 5.1 Smart ARS 가져오기 — 모델이 아직 못 담는다

디지트→액션 매핑 자체는 옮길 수 있다(5종 모두 대응 노드가 있다). 막히는 것은 셋이다.

1. **잘못된 입력 처리에 한도가 없다.** 기존 Smart ARS 는 잘못된 디지트에 안내를 틀고 `maxRetries` 까지
   다시 묻는다. 그래프의 `INVALID` 간선은 다른 노드로 보낼 뿐이라, 메뉴로 되돌리면 재시도 카운터가
   초기화돼 **무한 반복**이 된다. `MenuConfig` 에 잘못된 입력 안내를 넣고 3.1 의 카운터를 공유해야 한다.
2. **훅 실패 분기가 없다.** 기존은 `SYSTEMSTATUS != SUCCESS` 면 실패 안내 컨텍스트로 보낸다.
   플로우의 `SMS`/`OPT_OUT` 노드는 성공/실패를 구분하지 않는다.
3. **관측 이벤트가 빠진다.** 기존은 단계마다 `UserEvent` 를 심는다(설계서 0.6 이 플로우에도 넣기로 했는데
   Phase 0 에서 빠졌다). 지금 옮기면 Smart ARS 통화의 관측이 통째로 사라진다.

### 5.2 수신거부 가져오기 — 옮기면 데이터가 달라진다

1. **`SMART_OPT_OUT` 은 표현 자체가 안 된다.** 번호 입력은 `COLLECT_DIGITS` 로 되지만,
   받은 번호를 `SayDigits()` 로 되읽어 확인받는 단계가 그래프에 없다.
2. **`DTMF_MENU` 의 `SEND_SMS` 는 다른 훅을 탄다.** 기존은 수신거부 훅(`action=sms`)이고
   플로우의 `SMS` 노드는 Smart ARS 훅이다. 도착하는 NestJS 엔드포인트가 다르다.
3. **수신거부 출처가 바뀐다.** 기존은 `OPT_OUT_080_IMMEDIATE` / `_DTMF` / `_SMART` 로 기록되고
   플로우는 `ARS_FLOW` 로 기록된다. 옮기는 순간 **과거 기록과 통계가 갈린다.**

셋 다 "조용히 조금 다르게 동작" 하는 종류라 자동 변환으로 넘기지 않았다.

### 5.3 `HTTP_LOOKUP` — 별도 설계서가 먼저다

계획서 Phase 3 와 설계서 §5.2 가 명시한 대로다. 통화 경로 한가운데의 외부 HTTP 는
타임아웃·재시도·실패 폴백·시크릿 보관을 전부 설계해야 한다. 아직 쓰지 않았다.

---

## 6. 검증 결과 (2026-09-02 실행)

| 항목 | 명령 | 결과 |
|---|---|---|
| ARS 플로우 단위 | `npx jest src/modules/ars-flow` | 94 passed / 4 suites |
| 렌더러 전체 | `npx jest src/modules/asterisk-config` | 250 passed |
| 서버 전체 | `npm test` | **1372 passed / 151 suites, 실패 0** |
| 서버 린트 | `npm run lint` | 0 error |
| 서버 빌드 | `npm run build` | exit 0 |
| 관리자 테스트 | `npx vitest run` | 300 passed / 56 files |
| 관리자 타입체크 | `npx tsc -b` | 오류 0 |
| OpenAPI | `npm run openapi:export` | 가져오기 엔드포인트 반영 |

**실 PBX 반영은 하지 않았다.** 3.1~3.3 은 컴파일 결과가 바뀌는 변경이라
파일럿 DID 로 실제 통화를 걸어봐야 완료로 적을 수 있다 (계획서 1.4·1.5 의 규칙).
