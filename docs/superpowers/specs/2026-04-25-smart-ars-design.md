# Smart ARS Design

## Goal

Add branch-level Smart ARS configuration based on the VIX reference guides, replacing the existing branch ARS menu selector in the admin branch settings flow.

## Scope

This phase stores, validates, loads, and edits Smart ARS configuration. It does not implement live Asterisk DTMF execution yet because the current KAster runtime does not have a SipServer-style DTMF action loop. Runtime execution can consume the saved `settingsProfile.smartArs` contract in a later phase.

## Data Contract

Smart ARS lives in `branches.settingsProfile.smartArs`:

```json
{
  "enabled": true,
  "guidePromptId": "prompt-guide",
  "timeoutSeconds": 5,
  "maxRetries": 2,
  "failPromptId": "prompt-fail",
  "invalidPromptId": "prompt-invalid",
  "actions": [
    {
      "digit": "0",
      "actionType": "QUEUE_ROUTE",
      "queueId": "queue-1",
      "transferNumber": null,
      "smsTemplateId": null,
      "promptId": null
    }
  ]
}
```

Supported action types:

- `QUEUE_ROUTE`: connect to a branch-assigned queue.
- `TRANSFER`: transfer to a normalized external phone number.
- `SEND_SMS`: send an active tenant SMS template to the caller.
- `OPT_OUT`: register the caller for SMS opt-out.
- `PLAY_PROMPT`: play a selected prompt and end the call.

DTMF digits are `0-9`, `*`, and `#`. Duplicate digits are rejected.

## Server Behavior

`AdminService` normalizes `smartArs`, clamps timeout to `1..15`, clamps retries to `0..10`, removes irrelevant action fields, and validates required action fields only when Smart ARS is enabled. Queue actions must reference queues assigned to the branch. SMS actions must reference active tenant SMS templates.

Existing `settingsProfile.ars` is normalized to disabled/empty for backward compatibility but no longer drives the branch settings UI.

## Admin UI

The existing branch settings `ARS` section becomes `스마트 ARS`. It provides:

- Enable switch.
- Guide, invalid-key, failure prompt selectors.
- Timeout and retry numeric inputs.
- A dynamic action list where each row has digit, action type, and one relevant target input.

The old "사용할 ARS 메뉴" multi-select is removed from `BranchEditModal`.

## Testing

Server tests cover Smart ARS normalization, duplicate digit rejection, queue scope validation, SMS template validation, and persistence shape. Admin verification covers TypeScript build for the updated form.
