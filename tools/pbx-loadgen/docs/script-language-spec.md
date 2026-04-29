# PBX Loadgen Script Language Specification

Status: Draft v1  
Applies to: `tools/pbx-loadgen`  
Last updated: 2026-04-29

## 1. Purpose

This document defines the YAML script language used by the inbound-call test automation tool.

The language has two related document types:

- `scenario`: low-level SIP inbound load execution script.
- `test-plan`: CTI feature test script that can combine SIP inbound calls, CTI API checks, WebSocket observations, result assertions, and feedback generation.

The goal is automatic generation first. When CTI features are added or improved, the generator should create or refresh matching `test-plan` scripts from the current API/controller shape and reusable templates. Manual edits are allowed, but generated source metadata must remain so scripts can be traced and regenerated safely.

## 2. Design Rules

- Scripts are YAML files with `.yaml` or `.yml` extensions.
- Current legacy `scenario` files do not require `scriptVersion` or `kind`.
- New generated files SHOULD include `scriptVersion: "1.0"` and `kind`.
- Secrets MUST be referenced through environment placeholders such as `${CTI_ACCESS_TOKEN}` and MUST NOT be committed as literal values.
- A dry run MUST validate and describe execution without opening SIP, API, AMI, DB, or WebSocket connections.
- A live run MUST fail before the first network step if required environment values are missing.
- Generated scripts MUST keep `source.generatedFrom` and `source.generatorVersion`.
- Script execution MUST produce machine-readable results and enough observations to create improvement requirements.

## 3. Document Types

### 3.1 Scenario Document

`scenario` is the direct SIP load-generation format used by existing commands:

```text
pbx-loadgen validate -f <scenario.yaml>
pbx-loadgen dry-run -f <scenario.yaml>
pbx-loadgen run -f <scenario.yaml>
pbx-loadgen report -f <result.json>
```

Current examples are stored under `tools/pbx-loadgen/scenarios`.

### 3.2 Test Plan Document

`test-plan` is the feature automation format used by:

```text
pbx-loadgen test-plan validate -f <test-plan.yaml>
pbx-loadgen test-plan dry-run -f <test-plan.yaml>
pbx-loadgen test-plan run -f <test-plan.yaml>
pbx-loadgen test-plan feedback -f <test-result.json> --out <feedback.md>
```

Generated plans SHOULD be written under `tools/pbx-loadgen/generated/test-plans`.

## 4. Common Conventions

String interpolation uses environment placeholders only:

```yaml
environment:
  apiBaseUrl: "${CTI_API_BASE_URL}"
  wsUrl: "${CTI_WS_URL}"
  accessToken: "${CTI_ACCESS_TOKEN}"
```

The runner resolves these placeholders at execution time. Reports must redact resolved secret values.

Identifiers use dotted feature ids:

```text
calls.inbound.basic
queues.summary.after-inbound
agents.status.api
asterisk-config.blocklist.api
customers.opt-out.smart080
```

The recommended generated filename is `<feature-id>.yaml`.

## 5. Scenario Schema

Current required structure:

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

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `host` | string | yes | SIP target host or IP. |
| `port` | integer | yes | `1..65535`. |
| `transport` | string | yes | Current implementation supports `udp` only. |
| `requestUriTemplate` | string | yes | MUST contain `{did}`. |

### 5.2 `load`

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `cps` | integer | yes | Calls per second. MUST be positive. |
| `maxConcurrent` | integer | yes | MUST be positive and `<= totalCalls`. |
| `totalCalls` | integer | yes | MUST be positive. |
| `rampUpSeconds` | integer | yes | MUST be `>= 0`. |
| `callStartJitterMs` | integer | yes | MUST be `>= 0`. |

### 5.3 `callFlow`

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `callerIdPool` | string array | yes | MUST contain at least one ANI. |
| `didPool` | string array | yes | MUST contain at least one DID. |
| `answerTimeoutMs` | integer | yes | MUST be positive. |
| `holdSecondsMin` | integer | yes | MUST be `>= 0`. |
| `holdSecondsMax` | integer | yes | MUST be `>= holdSecondsMin`. |
| `disconnectMode.normalPercent` | integer | yes | `0..100`. |
| `dtmf.sequence` | string | no | Only `0-9`, `*`, and `#` are valid. Empty or missing means no DTMF. |
| `dtmf.sendAfterAnswerMs` | integer | no | Default `0`. MUST be `>= 0`. |
| `dtmf.interDigitMs` | integer | no | Default `250`. MUST be `>= 0`. |

DTMF is sent only after the SIP call is answered and media is active. `sendAfterAnswerMs` delays the first digit, and `interDigitMs` delays each following digit.

### 5.4 `media`

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `beepIntervalMs` | integer | yes | MUST be positive. |
| `txGain` | number | yes | `0.0..1.0`. |

### 5.5 `reporting`

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `outputDir` | string | yes | Result artifact directory. |
| `consoleRefreshMs` | integer | yes | MUST be positive. |
| `saveFailureDetails` | boolean | yes | Enables per-failure diagnostic artifacts when supported. |

## 6. Test Plan Schema

Current required structure:

```yaml
scriptVersion: "1.0"
kind: test-plan
id: calls.inbound.basic
title: Basic inbound call reaches CTI active call state
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

`scriptVersion` and `kind` are recommended for new files. Current parser compatibility does not require them.

### 6.1 Top-Level Fields

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `scriptVersion` | string | no | SHOULD be `"1.0"` for generated files. |
| `kind` | string | no | SHOULD be `test-plan`. |
| `id` | string | yes | Feature id. MUST NOT be empty. |
| `title` | string | yes | Human-readable intent. MUST NOT be empty. |
| `source.generatedFrom` | string array | yes | MUST contain at least one source path. |
| `source.generatorVersion` | integer | yes | Generator contract version. |
| `environment.apiBaseUrl` | string | yes | CTI REST base URL or env placeholder. |
| `environment.wsUrl` | string | yes | CTI WebSocket URL or env placeholder. |
| `environment.accessToken` | string | yes | Token or env placeholder. Prefer env placeholder. |
| `scenario.target` | object | yes | Same target fields as scenario. |
| `scenario.callFlow` | object | yes | Contains `callerIdPool` and `didPool`. |
| `steps` | array | yes | MUST contain at least one step. |

## 7. Step Language

Each step has a `type` and type-specific fields. Unknown step types may be accepted by the parser for forward compatibility, but a live runner MUST fail clearly if it cannot execute a step.

### 7.1 Current Step Types

| Step Type | Purpose | Required Fields | Optional Fields |
| --- | --- | --- | --- |
| `inbound_call` | Creates an inbound SIP call using the embedded scenario target and call flow. | `id` | `answerTimeoutMs`, `holdSeconds` |
| `wait_ws_event` | Waits for a CTI WebSocket event. | `event` | `timeoutMs`, `expect.statusAnyOf` |
| `assert_api` | Calls a CTI REST endpoint and evaluates a simple JSON expectation. | `method`, `path` | `expect.containsDid` |
| `assert_result` | Checks accumulated runner observations. | none | `expect.finalSipCode` |
| `hangup` | Terminates a referenced call when the runner supports it. | `callRef` for live use | none |
| `wait` | Sleeps for a bounded interval. | `timeoutMs` for meaningful use | none |

### 7.2 Step References

`inbound_call.id` creates a local call reference:

```yaml
- type: inbound_call
  id: call-1
```

Later steps refer to it through `callRef`:

```yaml
- type: hangup
  callRef: call-1
```

Generated scripts MUST use stable ids such as `call-1`, `call-2`, or a feature-specific prefix.

### 7.3 API Assertions

Current simple expectations:

```yaml
- type: assert_api
  method: GET
  path: /calls/active
  expect:
    containsDid: "07052346380"
```

`containsDid` means the response body must contain an active or returned call record associated with that DID. The exact JSON traversal is runner-defined, but failure reports MUST include the endpoint and observed response summary.

### 7.4 WebSocket Assertions

Current simple expectations:

```yaml
- type: wait_ws_event
  event: call.updated
  timeoutMs: 10000
  expect:
    statusAnyOf: ["QUEUED", "RINGING_AGENT", "TALKING"]
```

`statusAnyOf` passes when the observed event payload has any listed call state. A timeout MUST be reported as `WS_TIMEOUT`.

### 7.5 SIP Result Assertions

```yaml
- type: assert_result
  expect:
    finalSipCode: 200
```

`finalSipCode` checks the final SIP result accumulated by previous `inbound_call` steps. SIP failures MUST be reported separately from API and WebSocket assertion failures.

## 8. Automatic Generation Contract

The generator maps current CTI features to deterministic templates.

Current feature mapping:

| Feature Id | Template Intent |
| --- | --- |
| `calls.inbound.basic` | SIP inbound call, WebSocket `call.updated`, `GET /calls/active`, SIP 200 assertion. |
| `calls.transfer.control` | SIP inbound precondition and transfer API smoke assertion. |
| `queues.summary.after-inbound` | SIP inbound precondition and `GET /queues/summary` assertion. |
| `agents.status.api` | Agent status API smoke assertion. |
| `asterisk-config.blocklist.api` | Blocklist API smoke assertion. |

Recommended future feature ids for recent Smart ARS and opt-out work:

| Feature Id | Template Intent |
| --- | --- |
| `smart-ars.dtmf.menu` | Inbound call answers Smart ARS, sends configured DTMF, verifies routing or result event. |
| `customers.opt-out.smart080` | Smart 080 inbound call sends DTMF, verifies opt-out registration through API. |
| `calls.concurrent.50-with-media` | Generates 50 concurrent inbound calls with media and validates active-call visibility. |

Generation inputs:

- `docs/openapi.json`
- `apps/server/src/modules/**/**.controller.ts`
- `apps/server/src/modules/**/dto/*.ts`
- `tools/pbx-loadgen/test-templates`
- Existing scenario defaults from `tools/pbx-loadgen/scenarios`

Generated files MUST NOT silently overwrite reviewed custom edits. If the target file has manual changes, the generator SHOULD write `<feature-id>.generated.yaml` unless `--force` is provided.

## 9. Execution Semantics

For `scenario` execution:

1. Build a schedule from `load.cps`, `load.totalCalls`, `load.maxConcurrent`, `load.rampUpSeconds`, and `load.callStartJitterMs`.
2. Allocate ANI and DID values from `callerIdPool` and `didPool`.
3. Create SIP INVITE requests using `target.requestUriTemplate`.
4. After answer, optionally send DTMF from `callFlow.dtmf`.
5. Hold each call for the configured duration range.
6. Disconnect according to `disconnectMode`.
7. Write result artifacts to `reporting.outputDir`.

For `test-plan` execution:

1. Resolve environment placeholders.
2. Validate all required step fields.
3. Execute steps in declared order.
4. Record step status, failure code, and observation.
5. Write JSON and Markdown result artifacts.
6. Generate improvement requirements from failed step categories when requested.

## 10. Result and Feedback Contract

Result JSON contains:

```json
{
  "planId": "calls.inbound.basic",
  "title": "Basic inbound call reaches CTI active call state",
  "status": "FAIL",
  "steps": [
    {
      "stepType": "wait_ws_event",
      "status": "FAIL",
      "failureCode": "WS_TIMEOUT",
      "observation": "No call.updated event within 10000 ms"
    }
  ]
}
```

Standard failure categories:

| Failure Code | Meaning |
| --- | --- |
| `SIP_FAILED` | Inbound SIP call failed or did not reach the expected final SIP code. |
| `WS_TIMEOUT` | Expected WebSocket event was not observed within the timeout. |
| `API_ASSERT_FAILED` | REST response did not match the expectation. |
| `VALIDATION_FAILED` | Script structure or required values are invalid. |
| `ENV_MISSING` | Required environment placeholder could not be resolved. |
| `RUNNER_UNSUPPORTED` | Step type is valid syntax but not supported by the current runner. |

Feedback Markdown MUST convert failed categories into actionable improvement requirements. Example:

```text
Automated test `calls.inbound.basic` failed at `wait_ws_event`.
SIP completed but CTI did not emit `call.updated` within 10000 ms.
Investigate AMI normalization, event outbox, and WS broadcast path.
```

## 11. Examples

### 11.1 Basic Inbound Scenario With DTMF

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

### 11.2 Smart 080 Opt-Out Test Plan

```yaml
scriptVersion: "1.0"
kind: test-plan
id: customers.opt-out.smart080
title: Smart 080 DTMF opt-out registration is reflected in customer management
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

Note: step-level `dtmf` is reserved for feature-specific overrides. Current low-level scenario DTMF support is implemented under `callFlow.dtmf`; runners that do not support step-level DTMF MUST reject it with `RUNNER_UNSUPPORTED` rather than ignore it.

### 11.3 50 Concurrent Calls With Media

```yaml
scriptVersion: "1.0"
kind: test-plan
id: calls.concurrent.50-with-media
title: Fifty concurrent inbound calls keep media active and remain visible to CTI
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

Note: step-level `load` and `minVisibleCalls` are reserved v1 extensions for the concurrent-call test-plan runner. Current parser support is limited to the implemented fields listed in section 7.1.

## 12. Compatibility Matrix

| Capability | Current Support |
| --- | --- |
| Legacy `scenario` parse/validate/dry-run/run | Supported. |
| `scenario.callFlow.dtmf` validation | Supported. |
| `test-plan` parse/validate/dry-run | Supported. |
| `test-plan` result and feedback rendering | Supported. |
| `test-plan` inventory/generate commands | Supported by deterministic feature mapping. |
| Live API/WebSocket assertions | Runner-dependent; scripts must remain explicit enough for live execution. |
| Step-level `dtmf`, step-level `load`, `minVisibleCalls` | Reserved extension; must fail clearly if unsupported. |
| `scriptVersion` and `kind` enforcement | Not enforced in current parser; recommended for generated files. |

## 13. Validation Checklist

Before a script is accepted:

- YAML must parse successfully.
- Required top-level sections must exist.
- Ports must be within `1..65535`.
- `transport` must be `udp` for current live SIP support.
- `requestUriTemplate` must contain `{did}`.
- Load values must be positive and internally consistent.
- DTMF must contain only `0-9`, `*`, or `#`.
- Hold ranges must be valid.
- `test-plan.steps` must not be empty.
- `inbound_call` must have `id`.
- `assert_api` must have `method` and `path`.
- `wait_ws_event` must have `event`.

## 14. Versioning

`scriptVersion: "1.0"` means:

- YAML syntax.
- Current `scenario` schema from section 5.
- Current `test-plan` schema from section 6.
- Step language from section 7.
- Forward-compatible acceptance of reserved fields only when the runner explicitly supports them.

Breaking changes require `scriptVersion: "2.0"` and a migration path. The v1 runner should continue accepting existing scenario files that omit `scriptVersion` and `kind`.
