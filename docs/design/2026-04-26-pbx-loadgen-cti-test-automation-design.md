# PBX Loadgen CTI Test Automation Design

## Goal

Extend `tools/pbx-loadgen` from a SIP inbound load generator into a CTI feature test automation app.

The app must not require a person to hand-write every scenario. When CTI features are added or improved, the tool should generate a test scenario and executable test script draft from the current server/API shape and reusable CTI test templates. A person may review and adjust the generated draft, but the default workflow is generation first.

## Current Base

`tools/pbx-loadgen` is a standalone native CLI with these commands:

- `validate -f <scenario.yaml>`
- `dry-run -f <scenario.yaml>`
- `run -f <scenario.yaml>`
- `report -f <result.json>`

It already supports SIP inbound execution against the PBX, YAML scenarios, and JSON/CSV result artifacts. The validated durable location remains `tools/pbx-loadgen`.

## Scope

This phase adds a functional test automation layer to the existing CLI.

Included:

- CTI feature inventory generation from `docs/openapi.json` and server controller metadata.
- Test scenario draft generation for existing and newly changed CTI features.
- Executable test script generation from scenario templates.
- Test-plan validation, dry-run, execution, and report commands.
- Result aggregation and automatic improvement requirement drafts.
- Offline-friendly rule-based analysis. No external LLM dependency is required for the first version.

Excluded for this phase:

- Admin UI for managing scenarios.
- Full browser-driven UI tests.
- Automatic production deployment.
- Destructive live PBX changes.

## CLI Shape

Add a `test-plan` command group:

```text
pbx-loadgen test-plan inventory --openapi docs/openapi.json --out tools/pbx-loadgen/generated/feature-inventory.json
pbx-loadgen test-plan generate --feature <feature-id> --out tools/pbx-loadgen/generated/test-plans/<feature-id>.yaml
pbx-loadgen test-plan generate --changed --out tools/pbx-loadgen/generated/test-plans
pbx-loadgen test-plan validate -f <test-plan.yaml>
pbx-loadgen test-plan dry-run -f <test-plan.yaml>
pbx-loadgen test-plan run -f <test-plan.yaml>
pbx-loadgen test-plan report -f <test-result.json>
pbx-loadgen test-plan feedback -f <test-result.json> --out docs/generated-test-feedback
```

`--changed` compares the current git diff against known server/admin/web paths and generates drafts for affected feature areas.

## Feature Inventory

The inventory is the bridge between the CTI codebase and generated tests.

Inputs:

- `docs/openapi.json`
- `apps/server/src/modules/**/**.controller.ts`
- `apps/server/src/modules/**/dto/*.ts`
- Existing load scenarios in `tools/pbx-loadgen/scenarios`
- Optional curated template metadata in `tools/pbx-loadgen/test-templates`

Inventory output:

```json
{
  "features": [
    {
      "id": "calls.inbound.basic",
      "module": "calls",
      "kind": "inbound-call",
      "api": ["GET /calls/active", "GET /calls/{callId}"],
      "events": ["call.updated"],
      "requiresSipInbound": true,
      "templates": ["inbound-basic"]
    }
  ]
}
```

The first implementation uses deterministic rules:

- `calls` routes map to call state and call control templates.
- `queues` routes map to queue summary and inbound queue templates.
- `agents` routes map to agent state templates.
- `asterisk-config` routes map to configuration validation templates.
- `customers`, `sms-templates`, `opt-out`, and admin routes map to API assertion templates unless they also affect inbound routing.

## Test Plan Format

Generated test plans are YAML files that combine human-readable intent with executable steps.

```yaml
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
    port: 48950
    transport: udp
    requestUriTemplate: "sip:{did}@49.247.46.86:48950"
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
  - type: hangup
    callRef: call-1
  - type: assert_result
    expect:
      finalSipCode: 200
```

Generated plans should be editable, but generated metadata must stay present so stale scripts can be regenerated when the feature changes.

## Step Runner

The test runner interprets test-plan steps and maps them to existing or new runner components.

Initial step types:

- `inbound_call`: execute one or more SIP inbound calls using existing PJSIP runner behavior.
- `wait`: sleep for a bounded interval.
- `assert_api`: call CTI REST API and evaluate simple JSON expectations.
- `wait_ws_event`: connect to `/ws` and wait for an event matching expected fields.
- `hangup`: terminate a call when supported by the runner or API.
- `assert_result`: assert SIP result and accumulated observations.
- `collect_report`: write explicit observation artifacts.

The first version should support dry-run without network access and live-run with environment variables. Missing optional environment values should fail clearly before the first network step.

## Automatic Scenario Generation

Feature changes should produce test script drafts without manual authoring.

Generation modes:

- `inventory`: rebuild the known feature list from current API/controller metadata.
- `generate --feature`: generate or refresh one feature test plan.
- `generate --changed`: inspect git changes and generate plans for affected modules.
- `generate --all`: refresh all generated plans.

Changed-file mapping:

- `apps/server/src/modules/calls/**` -> `calls.*`
- `apps/server/src/modules/queues/**` -> `queues.*`
- `apps/server/src/modules/agents/**` -> `agents.*`
- `apps/server/src/modules/asterisk-config/**` -> `asterisk-config.*`
- `apps/admin/src/**` -> API-backed admin feature smoke plans when mapped permissions/routes exist.
- `tools/pbx-loadgen/test-templates/**` -> regenerate dependent plans.

Generated output should not silently overwrite reviewed custom edits. If a target plan already exists and has manual changes, write a sibling `.generated.yaml` or require `--force`.

## Result and Feedback Artifacts

Each run writes:

- `test-result-<run-id>.json`: machine-readable summary.
- `test-result-<run-id>.md`: human-readable report.
- Existing call detail CSV when enabled.

Result JSON includes:

- Plan id and source files.
- Step-level pass/fail status.
- SIP final code and failure code.
- API/WS observations.
- Timing and timeout data.
- Environment redaction status.

Feedback generation writes Markdown files under `docs/generated-test-feedback`.

Feedback examples:

- `calls.inbound.basic` failed at `wait_ws_event`: "Inbound call reached SIP 200 but CTI did not emit `call.updated` within 10000 ms. Investigate AMI normalization, event outbox, and WS broadcast path."
- `queues.summary.after-inbound` failed at `assert_api`: "Queue summary did not reflect the inbound call. Investigate queue event ingestion or summary query filters."

## Error Handling

- Invalid generated plans fail validation with the feature id and missing field.
- Missing API base URL, token, or WS URL fails before network execution.
- SIP failure, API failure, and WS timeout are separate failure categories.
- Secrets from environment variables are never written to reports.
- Live PBX destructive changes are never made by generated plans.

## Verification

Spec-level verification:

- Existing `validate` and `dry-run` behavior remains unchanged.
- New `test-plan validate` accepts generated plans and rejects malformed plans.
- `test-plan dry-run` prints planned steps without opening SIP/API/WS connections.
- `test-plan generate --changed` maps changed server module files to expected feature ids.
- Result feedback generation creates actionable Markdown from known failure categories.

Live verification later:

- Run a smoke inbound test against the validated PBX target.
- Confirm SIP result, CTI API observation, and WS event observation are represented in the same result file.

## Implementation Notes

Keep the implementation conservative:

- Add new headers and source files under `tools/pbx-loadgen/native/include/loadgen` and `tools/pbx-loadgen/native/src`.
- Keep existing scenario parsing intact for backward compatibility.
- Reuse `nlohmann/json` and `yaml-cpp`; avoid adding a second config parser.
- Prefer rule-based generation before considering any AI-assisted authoring.
- Add tests in `tools/pbx-loadgen/native/tests` for generator mapping, test-plan parsing, dry-run formatting, and feedback generation.
