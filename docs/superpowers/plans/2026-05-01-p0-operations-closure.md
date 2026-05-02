# P0 Operations Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining P0 operational readiness gaps for PBX config validation, production deployment/migration runbooks, and desktop live-test verification.

**Architecture:** Keep existing server/admin/deployment structure intact. Add a server-side PBX config dry-run result that reuses current renderers, then document the real-environment steps that cannot be honestly completed without live PBX and agent PC access.

**Tech Stack:** NestJS, Jest, Prisma renderers, existing docs/runbooks, PowerShell/Bash operational scripts.

---

## Task 1: PBX Config Dry-Run Result

**Files:**
- Create: `apps/server/src/modules/asterisk-config/asterisk-config-validation.ts`
- Create: `apps/server/src/modules/asterisk-config/asterisk-config-validation.spec.ts`
- Modify: `apps/server/src/modules/asterisk-config/asterisk-reload.service.ts`
- Modify: `apps/server/src/modules/asterisk-config/asterisk-config.controller.ts`

- [ ] Write failing tests for rendered config validation and diff summaries.
- [ ] Implement validation and diff helpers.
- [ ] Add `dryRunConfFiles(tenantId)` service method returning preview, validation, diff, reload commands, and generated timestamp.
- [ ] Add `GET /api/v1/asterisk-config/dry-run`.
- [ ] Run targeted server tests and TypeScript check.

## Task 2: P0 Runbook Closure

**Files:**
- Create: `docs/operations/p0-readiness-checklist.md`
- Modify: `docs/project-next-tasks.md`

- [ ] Document PBX config preview, dry-run, reload, smoke test, and rollback steps.
- [ ] Document production deploy and DB migration gating steps.
- [ ] Document desktop live SIP/media verification prerequisites and pass/fail evidence.
- [ ] Mark completed repo-backed P0 items and leave live-environment items as execution gates.

## Task 3: Verification

**Commands:**
- `cd apps/server && npm test -- asterisk-config-validation.spec.ts asterisk-reload.service.spec.ts`
- `cd apps/server && npx tsc --noEmit`
