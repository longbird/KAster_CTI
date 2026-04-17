# 2026-04-18 Complete Implementation Plan

## Goal
- Close the remaining gaps between the current Stage 1/Stage 2 implementation and an operations-ready CTI/PBX platform.
- Prioritize correctness and policy enforcement before additional UI breadth.

## Current State
- Admin core menus, PBX settings, branch mapping, dashboard, blocklist, forwarding, announcements, and system settings are implemented at first-pass level.
- Agent app real API mode is wired for login, history, realtime, and call control.
- PBX runtime is attached to the operational server and direct SIP phone registration is working.
- Remaining gaps are concentrated in transfer accuracy, action-level permissions, outbound policy depth, operations automation, and higher-fidelity operational tools.

## Phase Plan

### Phase 1. Transfer Core Completion
- Wire API transfer requests to `attendedTransferCandidates` so request and completion events correlate deterministically.
- Expand transfer lifecycle from `REQUESTED/COMPLETED` to include:
  - `CONSULT_RINGING`
  - `CONSULT_TALKING`
  - `REBRIDGING`
  - `FAILED`
  - `EXPIRED`
- Add timeout and consult-failure tests.
- Completion criteria:
  - Attended transfer has a traceable state path.
  - Blind/attended completion and expiry are covered by automated tests.

### Phase 2. Outbound Policy Completion
- Move allowed outbound caller IDs from multiline text to structured CRUD.
- Support caller ID selection in click-to-call within the allowed set.
- Bind caller ID policy to trunks and roles.
- Enforce the same policy path for PBX direct dial when enabled.
- Completion criteria:
  - Unapproved caller IDs cannot be used through any call path.

### Phase 3. Permission Model 2nd Pass
- Extend menu access rules to action-level permissions:
  - `view`
  - `create`
  - `update`
  - `delete`
  - `operate`
  - `export`
- Use a shared server-side enforcement layer and align button visibility in admin UI.
- Completion criteria:
  - UI exposure and API authorization follow the same rule set.

### Phase 4. Operational Features 2nd Pass
- Forwarding:
  - time window
  - weekday
  - optional caller condition
- Blocklist:
  - pattern rules
  - operator notes
  - history/audit
- Prompt management:
  - operational playback workflow
  - file propagation checks
- Queue/agent operations:
  - drill-down
  - deeper status detail
  - richer supervisory actions
- Completion criteria:
  - Admin can investigate and act without leaving the console.

### Phase 5. Agent App Completion
- Validate end-to-end status, memo, transfer, hangup, and recent history flows in real mode.
- Harden UI recovery for delayed/missed realtime events.
- Finish mini-mode operational QA path.
- Completion criteria:
  - Agent can work full shift in app-only mode without manual refresh or operational workaround.

### Phase 6. PBX Ops Automation
- Add deploy-time smoke checks for:
  - health
  - SIP registration
  - inbound DID routing
  - queue entry
  - click-to-call
  - PBX reload result
- Add safer deployment workflow for multi-file admin/server changes.
- Completion criteria:
  - Runtime verification is script-driven, not manual-only.

### Phase 7. Test Completion
- Add service/integration tests for:
  - transfer state machine
  - action-level permissions
  - outbound caller ID policy
  - PBX config render/reload consistency
  - token rotation/session edges
- Completion criteria:
  - High-risk operational flows are covered by repeatable tests.

## Current Tranche
- Phase 1, tranche 1:
  - transfer request recording at API layer
  - transfer detector integration tests
  - expiry-path regression coverage

## Release Order
1. Transfer core completion
2. Outbound policy completion
3. Permission model 2nd pass
4. Operational feature 2nd pass
5. Agent app completion
6. PBX ops automation
7. Final verification and pilot checklist
