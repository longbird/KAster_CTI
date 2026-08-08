# Agent Desktop Runtime Kickoff

## Purpose

This note is the short handoff for the separate desktop-app session.

Use it together with:

- `docs/plans/2026-04-22-agent-desktop-runtime.md`
- `docs/design/agent-desktop-update-api.md`
- `docs/design/external-crm-cti-api-contract.md`

## Current Server Status

The server-side prerequisites for the desktop runtime are already implemented in this repo.

### Auth / Handoff

- `POST /api/v1/auth/handoff`
- `POST /api/v1/auth/handoff/exchange`

Notes:

- handoff token is one-time use
- handoff token is short-lived
- exchanged access token is bound to an active refresh session via `sid`

Relevant files:

- `apps/server/src/modules/auth/auth.controller.ts`
- `apps/server/src/modules/auth/auth.service.ts`
- `apps/server/src/modules/auth/jwt.strategy.ts`

### Command Ack Contract

Call-control endpoints now return consistent metadata:

- `accepted`
- `requestedAt`
- `correlationId`
- optional `idempotencyKey`

Relevant files:

- `apps/server/src/common/command-meta.util.ts`
- `apps/server/src/common/dto/command-ack-response.dto.ts`
- `apps/server/src/modules/calls/calls.controller.ts`
- `apps/server/src/modules/calls/calls.service.ts`

### Update Hub

The call-center server now exposes the desktop update hub:

- `POST /api/v1/agent-updates/session`
- `GET /api/v1/agent-updates/manifest`
- `POST /api/v1/agent-updates/download-init`
- `GET /api/v1/agent-updates/artifacts/:artifactId`
- `POST /api/v1/agent-updates/report`

Relevant files:

- `apps/server/src/modules/agent-updates/agent-updates.controller.ts`
- `apps/server/src/modules/agent-updates/agent-updates.service.ts`
- `apps/server/prisma/schema.prisma`
- `apps/server/prisma/migrations/20260422_agent_updates_hub/migration.sql`

## Desktop Session Scope

The next session should implement only the Windows desktop runtime in `apps/desktop`.

Start with the plan's Task 1 and proceed in order:

1. scaffold `apps/desktop`
2. add config store and preload IPC
3. add handoff exchange and token vault
4. add CTI runtime bridge
5. add renderer pairing + softphone shell
6. add update client integration

## Guardrails

- Do not rework the server update hub unless the desktop client finds a real contract mismatch.
- Do not change the web app as part of the desktop session unless a shared type must be aligned.
- Keep long-lived tokens in the Electron main process, not in the renderer.
- Renderer should only talk through typed preload IPC.
- Treat `apps/desktop` as Windows-only.

## First Validation Target

The separate desktop session is considered properly started once these are true:

- `apps/desktop` exists with Electron + React + TypeScript scaffold
- `src/shared/center-config.test.ts` passes
- `src/main/config-store.test.ts` passes
- no server files were changed unnecessarily

## Suggested Opening Prompt For The Separate Session

Implement `docs/plans/2026-04-22-agent-desktop-runtime.md` starting from Task 1. Server prerequisites are already complete, especially auth handoff, command ack metadata, and the call-center update hub. Work only in `apps/desktop` unless a real server contract mismatch is discovered, and verify each task before moving to the next.
