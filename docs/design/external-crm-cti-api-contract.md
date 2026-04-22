# External CRM CTI API Contract

## Purpose

This document defines the minimum contract an external CRM can rely on when integrating with KAster CTI.

All endpoint paths below are relative to the server base path `/api/v1`.

## Authentication

- Primary user authentication happens against KAster CTI.
- Browser CRM clients must not receive long-lived shared refresh tokens.
- Native runtime pairing uses `POST /auth/handoff` and `POST /auth/handoff/exchange`.

## Command Rules

- Every CTI command accepts optional `x-correlation-id`.
- Every CTI command accepts optional `idempotency-key`.
- Every CTI command returns `accepted`, `requestedAt`, and `correlationId`.
- Final call outcome must be confirmed through follow-up events or state refresh.

## Core Command Endpoints

- `POST /calls/originate`
- `POST /calls/originate/internal`
- `POST /calls/:callId/pickup`
- `POST /calls/:callId/transfer`
- `POST /calls/:callId/transfer/attended/cancel`
- `POST /calls/:callId/transfer/attended/complete`
- `POST /calls/:callId/mute`
- `POST /calls/:callId/hold`
- `POST /calls/:callId/resume`
- `POST /calls/:callId/hangup`

## Query Endpoints

- `GET /me/session`
- `GET /calls/active`
- `GET /calls/:callId`
- `GET /calls/history`
- `GET /queues/summary`
- `GET /agents`
