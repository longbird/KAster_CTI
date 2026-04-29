# PBX Loadgen 스크립트 언어 명세서

상태: Draft v1  
적용 범위: `tools/pbx-loadgen`  
최종 수정일: 2026-04-29

## 1. 목적

이 문서는 호 인입 테스트 자동화 툴이 사용하는 YAML 기반 스크립트 언어를 정의한다.

스크립트는 두 종류로 나뉜다.

- `scenario`: SIP 인입 호를 직접 발생시키는 저수준 부하 실행 스크립트
- `test-plan`: SIP 인입, CTI API 검증, WebSocket 이벤트 확인, 결과 판정, 개선 요구사항 생성을 묶는 기능 테스트 스크립트

핵심 방향은 사람이 매번 테스트 시나리오를 직접 작성하지 않도록 하는 것이다. CTI 기능이 추가되거나 개선되면, 현재 API/컨트롤러 구조와 재사용 가능한 템플릿을 기준으로 `test-plan` 초안을 자동 생성한다. 사람이 검토 후 수정할 수는 있지만, 재생성과 추적을 위해 생성 출처 메타데이터는 유지해야 한다.

## 2. 설계 원칙

- 스크립트 파일은 `.yaml` 또는 `.yml` 확장자를 사용한다.
- 기존 `scenario` 파일은 호환성을 위해 `scriptVersion`과 `kind` 없이도 동작해야 한다.
- 새로 생성되는 파일은 `scriptVersion: "1.0"`과 `kind`를 포함하는 것을 권장한다.
- 토큰, 비밀번호 같은 민감 정보는 `${CTI_ACCESS_TOKEN}` 같은 환경변수 치환식으로만 참조한다.
- 민감 정보 원문은 스크립트나 결과 리포트에 저장하지 않는다.
- `dry-run`은 SIP, API, AMI, DB, WebSocket 연결을 열지 않고 검증과 실행 예정 내용을 출력해야 한다.
- `live run`은 필수 환경변수가 없으면 첫 네트워크 단계 전에 명확히 실패해야 한다.
- 자동 생성된 스크립트는 `source.generatedFrom`과 `source.generatorVersion`을 유지해야 한다.
- 실행 결과는 기계가 읽을 수 있는 JSON과 사람이 읽을 수 있는 Markdown으로 남겨야 한다.
- 실패 결과는 개선 요구사항 문서로 변환할 수 있어야 한다.

## 3. 문서 종류

### 3.1 `scenario`

`scenario`는 SIP 인입 부하를 직접 발생시키는 기존 형식이다.

```text
pbx-loadgen validate -f <scenario.yaml>
pbx-loadgen dry-run -f <scenario.yaml>
pbx-loadgen run -f <scenario.yaml>
pbx-loadgen report -f <result.json>
```

현재 예시는 `tools/pbx-loadgen/scenarios` 아래에 있다.

### 3.2 `test-plan`

`test-plan`은 CTI 기능 검증을 위한 상위 자동화 형식이다.

```text
pbx-loadgen test-plan validate -f <test-plan.yaml>
pbx-loadgen test-plan dry-run -f <test-plan.yaml>
pbx-loadgen test-plan run -f <test-plan.yaml>
pbx-loadgen test-plan feedback -f <test-result.json> --out <feedback.md>
```

자동 생성된 계획은 `tools/pbx-loadgen/generated/test-plans` 아래에 저장하는 것을 권장한다.

## 4. 공통 규칙

환경값은 `${ENV_NAME}` 형식으로 참조한다.

```yaml
environment:
  apiBaseUrl: "${CTI_API_BASE_URL}"
  wsUrl: "${CTI_WS_URL}"
  accessToken: "${CTI_ACCESS_TOKEN}"
```

실행기는 실행 시점에 환경변수를 해석한다. 결과 리포트에는 해석된 토큰 원문을 쓰지 않는다.

기능 식별자는 점으로 구분된 ID를 사용한다.

```text
calls.inbound.basic
queues.summary.after-inbound
agents.status.api
asterisk-config.blocklist.api
customers.opt-out.smart080
```

권장 파일명은 `<feature-id>.yaml`이다.

## 5. `scenario` 스키마

현재 필수 구조는 다음과 같다.

```yaml
target:
  host: 49.247.46.86
  port: 36070
  transport: udp
  requestUriTemplate: "sip:{did}@49.247.46.86:36070"
load:
  cps: 1
  maxConcurrent: 1
  totalCalls: 1
  rampUpSeconds: 0
  callStartJitterMs: 0
callFlow:
  callerIdPool: ["01011112222"]
  didPool: ["07052346380"]
  answerTimeoutMs: 12000
  holdSecondsMin: 5
  holdSecondsMax: 5
  dtmf:
    sequence: "1#"
    sendAfterAnswerMs: 1000
    interDigitMs: 300
  disconnectMode:
    normalPercent: 100
media:
  beepIntervalMs: 800
  txGain: 0.8
reporting:
  outputDir: "./reports"
  consoleRefreshMs: 500
  saveFailureDetails: true
```

### 5.1 `target`

| 필드 | 타입 | 필수 | 규칙 |
| --- | --- | --- | --- |
| `host` | string | 예 | SIP 대상 호스트 또는 IP |
| `port` | integer | 예 | `1..65535` |
| `transport` | string | 예 | 현재 구현은 `udp`만 지원 |
| `requestUriTemplate` | string | 예 | 반드시 `{did}`를 포함 |

### 5.2 `load`

| 필드 | 타입 | 필수 | 규칙 |
| --- | --- | --- | --- |
| `cps` | integer | 예 | 초당 발생 호 수. 양수 |
| `maxConcurrent` | integer | 예 | 최대 동시 호 수. 양수이며 `totalCalls` 이하 |
| `totalCalls` | integer | 예 | 전체 발생 호 수. 양수 |
| `rampUpSeconds` | integer | 예 | `0` 이상 |
| `callStartJitterMs` | integer | 예 | `0` 이상 |

### 5.3 `callFlow`

| 필드 | 타입 | 필수 | 규칙 |
| --- | --- | --- | --- |
| `callerIdPool` | string array | 예 | ANI 후보. 최소 1개 |
| `didPool` | string array | 예 | DID 후보. 최소 1개 |
| `answerTimeoutMs` | integer | 예 | 응답 대기 시간. 양수 |
| `holdSecondsMin` | integer | 예 | 최소 통화 유지 시간. `0` 이상 |
| `holdSecondsMax` | integer | 예 | 최대 통화 유지 시간. `holdSecondsMin` 이상 |
| `disconnectMode.normalPercent` | integer | 예 | 정상 종료 비율. `0..100` |
| `dtmf.sequence` | string | 아니오 | `0-9`, `*`, `#`만 허용. 없으면 DTMF 미전송 |
| `dtmf.sendAfterAnswerMs` | integer | 아니오 | 응답 후 첫 DTMF 전송 지연. 기본값 `0` |
| `dtmf.interDigitMs` | integer | 아니오 | DTMF 자리 간 지연. 기본값 `250` |

DTMF는 SIP 호가 응답되고 미디어가 연결된 뒤 전송한다. `sendAfterAnswerMs`는 첫 자리 전송 전 지연이고, `interDigitMs`는 각 자리 사이의 지연이다.

### 5.4 `media`

| 필드 | 타입 | 필수 | 규칙 |
| --- | --- | --- | --- |
| `beepIntervalMs` | integer | 예 | RTP 비프 재생 간격. 양수 |
| `txGain` | number | 예 | 송출 게인. `0.0..1.0` |

### 5.5 `reporting`

| 필드 | 타입 | 필수 | 규칙 |
| --- | --- | --- | --- |
| `outputDir` | string | 예 | 결과 산출물 저장 경로 |
| `consoleRefreshMs` | integer | 예 | 콘솔 갱신 주기. 양수 |
| `saveFailureDetails` | boolean | 예 | 실패 상세 산출물 저장 여부 |

## 6. `test-plan` 스키마

현재 필수 구조는 다음과 같다.

```yaml
scriptVersion: "1.0"
kind: test-plan
id: calls.inbound.basic
title: 기본 인입 호가 CTI 활성 통화 상태로 반영된다
source:
  generatedFrom:
    - docs/openapi.json
    - apps/server/src/modules/calls/calls.controller.ts
  generatorVersion: 1
environment:
  apiBaseUrl: "${CTI_API_BASE_URL}"
  wsUrl: "${CTI_WS_URL}"
  accessToken: "${CTI_ACCESS_TOKEN}"
scenario:
  target:
    host: 49.247.46.86
    port: 36070
    transport: udp
    requestUriTemplate: "sip:{did}@49.247.46.86:36070"
  callFlow:
    callerIdPool: ["01011112222"]
    didPool: ["07052346380"]
steps:
  - type: inbound_call
    id: call-1
    answerTimeoutMs: 12000
    holdSeconds: 5
  - type: wait_ws_event
    event: call.updated
    timeoutMs: 10000
    expect:
      statusAnyOf: ["QUEUED", "RINGING_AGENT", "TALKING"]
  - type: assert_api
    method: GET
    path: /calls/active
    expect:
      containsDid: "07052346380"
  - type: assert_result
    expect:
      finalSipCode: 200
```

`scriptVersion`과 `kind`는 새 파일에서는 권장하지만, 현재 파서 호환성을 위해 필수는 아니다.

### 6.1 최상위 필드

| 필드 | 타입 | 필수 | 규칙 |
| --- | --- | --- | --- |
| `scriptVersion` | string | 아니오 | 생성 파일은 `"1.0"` 권장 |
| `kind` | string | 아니오 | `test-plan` 권장 |
| `id` | string | 예 | 기능 ID. 빈 값 불가 |
| `title` | string | 예 | 테스트 의도 설명. 빈 값 불가 |
| `source.generatedFrom` | string array | 예 | 생성 근거 파일. 최소 1개 |
| `source.generatorVersion` | integer | 예 | 생성기 계약 버전 |
| `environment.apiBaseUrl` | string | 예 | CTI REST API Base URL 또는 환경변수 치환식 |
| `environment.wsUrl` | string | 예 | CTI WebSocket URL 또는 환경변수 치환식 |
| `environment.accessToken` | string | 예 | 인증 토큰 또는 환경변수 치환식 |
| `scenario.target` | object | 예 | `scenario`의 target 구조와 동일 |
| `scenario.callFlow` | object | 예 | `callerIdPool`, `didPool` 포함 |
| `steps` | array | 예 | 최소 1개 step |

## 7. Step 언어

각 step은 `type`을 가지며, 타입별 필드를 사용한다. 알 수 없는 step 타입은 향후 호환성을 위해 파서가 읽을 수는 있지만, 실제 실행기가 지원하지 않으면 `RUNNER_UNSUPPORTED`로 명확히 실패해야 한다.

### 7.1 현재 지원 step 타입

| Step 타입 | 목적 | 필수 필드 | 선택 필드 |
| --- | --- | --- | --- |
| `inbound_call` | 내장된 scenario target/callFlow를 이용해 SIP 인입 호를 생성 | `id` | `answerTimeoutMs`, `holdSeconds` |
| `wait_ws_event` | CTI WebSocket 이벤트 수신 대기 | `event` | `timeoutMs`, `expect.statusAnyOf` |
| `assert_api` | CTI REST API 호출 후 단순 JSON 기대값 검증 | `method`, `path` | `expect.containsDid` |
| `assert_result` | 앞선 실행 결과 누적값 검증 | 없음 | `expect.finalSipCode` |
| `hangup` | 참조된 통화 종료 | live 실행 시 `callRef` | 없음 |
| `wait` | 지정 시간 대기 | 의미 있는 실행을 위해 `timeoutMs` 필요 | 없음 |

### 7.2 Step 참조

`inbound_call.id`는 이후 step에서 참조할 수 있는 로컬 통화 ID를 만든다.

```yaml
- type: inbound_call
  id: call-1
```

이후 step은 `callRef`로 참조한다.

```yaml
- type: hangup
  callRef: call-1
```

자동 생성기는 `call-1`, `call-2`처럼 안정적인 ID를 사용해야 한다.

### 7.3 API 검증

```yaml
- type: assert_api
  method: GET
  path: /calls/active
  expect:
    containsDid: "07052346380"
```

`containsDid`는 응답 본문 안에 해당 DID와 관련된 통화 또는 조회 결과가 있어야 함을 의미한다. 정확한 JSON 순회 방식은 실행기가 정의하지만, 실패 리포트에는 호출 endpoint와 관측된 응답 요약이 포함되어야 한다.

### 7.4 WebSocket 검증

```yaml
- type: wait_ws_event
  event: call.updated
  timeoutMs: 10000
  expect:
    statusAnyOf: ["QUEUED", "RINGING_AGENT", "TALKING"]
```

`statusAnyOf`는 이벤트 payload의 통화 상태가 목록 중 하나이면 통과한다. 제한 시간 내 이벤트를 받지 못하면 `WS_TIMEOUT`으로 기록한다.

### 7.5 SIP 결과 검증

```yaml
- type: assert_result
  expect:
    finalSipCode: 200
```

`finalSipCode`는 앞선 `inbound_call` step에서 누적된 최종 SIP 결과를 검증한다. SIP 실패는 API 실패, WebSocket 실패와 별도 분류로 기록해야 한다.

## 8. 자동 생성 규칙

자동 생성기는 현재 CTI 기능을 결정적 템플릿에 매핑한다.

현재 기능 매핑은 다음과 같다.

| 기능 ID | 템플릿 의도 |
| --- | --- |
| `calls.inbound.basic` | SIP 인입, WebSocket `call.updated`, `GET /calls/active`, SIP 200 검증 |
| `calls.transfer.control` | SIP 인입 전제 조건과 전환 API 기본 검증 |
| `queues.summary.after-inbound` | SIP 인입 후 `GET /queues/summary` 검증 |
| `agents.status.api` | 상담원 상태 API 기본 검증 |
| `asterisk-config.blocklist.api` | 블랙리스트 API 기본 검증 |

최근 Smart ARS와 수신거부 기능을 위한 권장 확장 ID는 다음과 같다.

| 기능 ID | 템플릿 의도 |
| --- | --- |
| `smart-ars.dtmf.menu` | Smart ARS 응답 후 DTMF 전송, 라우팅 또는 결과 이벤트 검증 |
| `customers.opt-out.smart080` | Smart 080 인입 후 DTMF 전송, 수신거부 등록 API 검증 |
| `calls.concurrent.50-with-media` | 미디어가 연결된 50개 동시 인입 호 생성, 활성 통화 가시성 검증 |

생성 입력은 다음을 사용한다.

- `docs/openapi.json`
- `apps/server/src/modules/**/**.controller.ts`
- `apps/server/src/modules/**/dto/*.ts`
- `tools/pbx-loadgen/test-templates`
- `tools/pbx-loadgen/scenarios`의 기존 scenario 기본값

자동 생성기는 사용자가 검토한 파일을 조용히 덮어쓰면 안 된다. 대상 파일에 수동 수정이 있으면 `--force`가 없는 한 `<feature-id>.generated.yaml` 같은 별도 파일을 생성해야 한다.

## 9. 실행 의미

### 9.1 `scenario` 실행 순서

1. `load.cps`, `load.totalCalls`, `load.maxConcurrent`, `load.rampUpSeconds`, `load.callStartJitterMs`로 호출 스케줄을 만든다.
2. `callerIdPool`과 `didPool`에서 ANI/DID를 배정한다.
3. `target.requestUriTemplate`으로 SIP INVITE를 만든다.
4. 응답 후 `callFlow.dtmf`가 있으면 DTMF를 전송한다.
5. 설정된 hold 시간 동안 통화를 유지한다.
6. `disconnectMode` 규칙에 따라 통화를 종료한다.
7. `reporting.outputDir`에 결과 산출물을 저장한다.

### 9.2 `test-plan` 실행 순서

1. 환경변수 치환식을 해석한다.
2. 모든 필수 step 필드를 검증한다.
3. 선언된 순서대로 step을 실행한다.
4. step별 상태, 실패 코드, 관측 내용을 기록한다.
5. JSON과 Markdown 결과 파일을 저장한다.
6. 요청 시 실패 유형을 개선 요구사항 문서로 변환한다.

## 10. 결과 및 피드백 계약

결과 JSON은 다음 구조를 따른다.

```json
{
  "planId": "calls.inbound.basic",
  "title": "기본 인입 호가 CTI 활성 통화 상태로 반영된다",
  "status": "FAIL",
  "steps": [
    {
      "stepType": "wait_ws_event",
      "status": "FAIL",
      "failureCode": "WS_TIMEOUT",
      "observation": "10000 ms 안에 call.updated 이벤트를 받지 못함"
    }
  ]
}
```

표준 실패 코드는 다음과 같다.

| 실패 코드 | 의미 |
| --- | --- |
| `SIP_FAILED` | 인입 SIP 호가 실패했거나 기대한 최종 SIP 코드에 도달하지 못함 |
| `WS_TIMEOUT` | 기대한 WebSocket 이벤트를 제한 시간 안에 받지 못함 |
| `API_ASSERT_FAILED` | REST 응답이 기대값과 일치하지 않음 |
| `VALIDATION_FAILED` | 스크립트 구조 또는 필수값이 유효하지 않음 |
| `ENV_MISSING` | 필수 환경변수 치환식을 해석하지 못함 |
| `RUNNER_UNSUPPORTED` | 문법상 유효하지만 현재 실행기가 지원하지 않는 step |

피드백 Markdown은 실패 유형을 실행 가능한 개선 요구사항으로 바꿔야 한다.

예:

```text
자동 테스트 `calls.inbound.basic`이 `wait_ws_event` 단계에서 실패했다.
SIP는 완료되었지만 CTI가 10000 ms 안에 `call.updated`를 발행하지 않았다.
AMI 정규화, event outbox, WebSocket broadcast 경로를 점검해야 한다.
```

## 11. 예시

### 11.1 DTMF 포함 기본 인입 scenario

```yaml
target:
  host: 49.247.46.86
  port: 36070
  transport: udp
  requestUriTemplate: "sip:{did}@49.247.46.86:36070"
load:
  cps: 1
  maxConcurrent: 1
  totalCalls: 1
  rampUpSeconds: 0
  callStartJitterMs: 0
callFlow:
  callerIdPool: ["01011112222"]
  didPool: ["07052346380"]
  answerTimeoutMs: 12000
  holdSecondsMin: 8
  holdSecondsMax: 8
  dtmf:
    sequence: "1#"
    sendAfterAnswerMs: 1000
    interDigitMs: 300
  disconnectMode:
    normalPercent: 100
media:
  beepIntervalMs: 800
  txGain: 0.8
reporting:
  outputDir: "./reports"
  consoleRefreshMs: 500
  saveFailureDetails: true
```

### 11.2 Smart 080 수신거부 test-plan

```yaml
scriptVersion: "1.0"
kind: test-plan
id: customers.opt-out.smart080
title: Smart 080 DTMF 수신거부 등록이 고객 관리에 반영된다
source:
  generatedFrom:
    - docs/openapi.json
    - apps/server/src/modules/customers/customers.controller.ts
  generatorVersion: 1
environment:
  apiBaseUrl: "${CTI_API_BASE_URL}"
  wsUrl: "${CTI_WS_URL}"
  accessToken: "${CTI_ACCESS_TOKEN}"
scenario:
  target:
    host: 49.247.46.86
    port: 36070
    transport: udp
    requestUriTemplate: "sip:{did}@49.247.46.86:36070"
  callFlow:
    callerIdPool: ["01033334444"]
    didPool: ["0800000000"]
steps:
  - type: inbound_call
    id: optout-call-1
    answerTimeoutMs: 12000
    holdSeconds: 8
    dtmf:
      sequence: "1#"
      sendAfterAnswerMs: 1000
      interDigitMs: 300
  - type: wait_ws_event
    event: call.updated
    timeoutMs: 10000
    expect:
      statusAnyOf: ["TALKING", "AFTER_CALL_WORK", "ENDED"]
  - type: assert_api
    method: GET
    path: /customers/opt-outs
    expect:
      containsDid: "0800000000"
  - type: assert_result
    expect:
      finalSipCode: 200
```

주의: step 단위 `dtmf`는 기능별 override를 위한 예약 확장이다. 현재 저수준 DTMF 구현은 `callFlow.dtmf`에 있다. step 단위 DTMF를 지원하지 않는 실행기는 이를 무시하지 말고 `RUNNER_UNSUPPORTED`로 실패해야 한다.

### 11.3 미디어 연결 포함 50개 동시호 test-plan

```yaml
scriptVersion: "1.0"
kind: test-plan
id: calls.concurrent.50-with-media
title: 50개 동시 인입 호가 미디어 연결 상태로 유지되고 CTI에 표시된다
source:
  generatedFrom:
    - docs/openapi.json
    - tools/pbx-loadgen/scenarios/inbound-30cps-300concurrent.yaml
  generatorVersion: 1
environment:
  apiBaseUrl: "${CTI_API_BASE_URL}"
  wsUrl: "${CTI_WS_URL}"
  accessToken: "${CTI_ACCESS_TOKEN}"
scenario:
  target:
    host: 49.247.46.86
    port: 36070
    transport: udp
    requestUriTemplate: "sip:{did}@49.247.46.86:36070"
  callFlow:
    callerIdPool: ["01011112222", "01011112223", "01011112224"]
    didPool: ["07052346380", "07052346381", "07052346382"]
steps:
  - type: inbound_call
    id: batch-50
    answerTimeoutMs: 12000
    holdSeconds: 20
    load:
      cps: 10
      maxConcurrent: 50
      totalCalls: 50
  - type: assert_api
    method: GET
    path: /calls/active
    expect:
      minVisibleCalls: 50
  - type: assert_result
    expect:
      finalSipCode: 200
```

주의: step 단위 `load`와 `minVisibleCalls`는 동시호 test-plan 실행기를 위한 v1 예약 확장이다. 현재 파서 지원 범위는 7.1의 구현된 필드로 제한된다.

## 12. 호환성 표

| 기능 | 현재 지원 상태 |
| --- | --- |
| 기존 `scenario` parse/validate/dry-run/run | 지원 |
| `scenario.callFlow.dtmf` 검증 | 지원 |
| `test-plan` parse/validate/dry-run | 지원 |
| `test-plan` 결과 및 피드백 렌더링 | 지원 |
| `test-plan` inventory/generate 명령 | 결정적 기능 매핑 기반 지원 |
| live API/WebSocket assertion | 실행기 구현 범위에 따름 |
| step 단위 `dtmf`, step 단위 `load`, `minVisibleCalls` | 예약 확장. 미지원 시 명확히 실패해야 함 |
| `scriptVersion`, `kind` 강제 검증 | 현재 파서에서는 강제하지 않음. 생성 파일에 권장 |

## 13. 검증 체크리스트

스크립트는 최소한 다음 조건을 만족해야 한다.

- YAML 문법이 유효해야 한다.
- 필수 최상위 섹션이 있어야 한다.
- 포트는 `1..65535` 범위여야 한다.
- 현재 SIP live 실행의 `transport`는 `udp`여야 한다.
- `requestUriTemplate`에는 `{did}`가 있어야 한다.
- load 값은 양수이고 서로 모순되지 않아야 한다.
- DTMF는 `0-9`, `*`, `#`만 포함해야 한다.
- hold 시간 범위가 유효해야 한다.
- `test-plan.steps`는 비어 있으면 안 된다.
- `inbound_call`은 `id`가 있어야 한다.
- `assert_api`는 `method`와 `path`가 있어야 한다.
- `wait_ws_event`는 `event`가 있어야 한다.

## 14. 버전 정책

`scriptVersion: "1.0"`은 다음을 의미한다.

- YAML 기반 문법
- 5장의 `scenario` 스키마
- 6장의 `test-plan` 스키마
- 7장의 step 언어
- 실행기가 명시적으로 지원하는 경우에만 예약 확장 필드 사용 가능

호환성을 깨는 변경은 `scriptVersion: "2.0"`과 마이그레이션 경로가 필요하다. v1 실행기는 `scriptVersion`과 `kind`가 없는 기존 scenario 파일을 계속 받아들여야 한다.
