# Agent Desktop Update API

## Purpose

This document defines the server-side update hub that each call-center server exposes for the Windows agent desktop application.

The hub has three responsibilities:

- issue short-lived update sessions for authenticated agents
- serve the approved manifest and download tokens for tenant-scoped releases
- record update activity for audit and troubleshooting

## Base Path

All routes are served under `GET/POST /api/v1/agent-updates/...` through the server's global `api/v1` prefix.

## Authentication

- `POST /agent-updates/session` requires the normal CTI access token.
- `GET /agent-updates/manifest` and `POST /agent-updates/download-init` require `Authorization: Bearer <updateSessionToken>`.
- `GET /agent-updates/artifacts/:artifactId` requires `Authorization: Bearer <downloadToken>`.
- `POST /agent-updates/report` requires the normal CTI access token.

Update session tokens and download tokens are short-lived opaque bearer tokens. The client sends them in the standard `Authorization` header.

## Endpoints

### `POST /agent-updates/session`

Create an update session for the currently authenticated agent.

Request body:

```json
{
  "deviceId": "pc-001",
  "currentVersion": "1.3.2"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "updateSessionToken": "<opaque-token>",
    "expiresIn": 600
  },
  "error": null
}
```

### `GET /agent-updates/manifest`

Return the approved release manifest for the tenant tied to the update session token.

Query parameters:

- `currentVersion` - current desktop app version reported by the client
- `channel` - optional release channel, defaults to `stable`

Response when a release exists:

```json
{
  "success": true,
  "data": {
    "centerId": "tenant-1",
    "channel": "stable",
    "currentVersion": "1.3.2",
    "latestVersion": "1.4.0",
    "mandatory": false,
    "minimumRequiredVersion": "1.2.8",
    "serverCompatibility": {
      "minimumServerVersion": "0.9.0",
      "maximumServerVersion": "0.9.x"
    },
    "artifacts": [
      {
        "artifactId": "agent-win-x64-1.4.0",
        "version": "1.4.0",
        "fileName": "KAsterAgent-1.4.0-Setup.exe",
        "size": 85423104,
        "sha256": "abc123"
      }
    ],
    "notes": "음소거/보류 안정성 개선"
  },
  "error": null
}
```

If no approved release exists for the tenant/channel, `data` is `null`.

### `POST /agent-updates/download-init`

Request a short-lived download token for a specific approved artifact.

Request body:

```json
{
  "artifactId": "agent-win-x64-1.4.0",
  "currentVersion": "1.3.2"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "artifactId": "agent-win-x64-1.4.0",
    "version": "1.4.0",
    "downloadUrl": "/api/v1/agent-updates/artifacts/agent-win-x64-1.4.0",
    "downloadToken": "<opaque-token>",
    "expiresIn": 120,
    "sha256": "abc123"
  },
  "error": null
}
```

### `GET /agent-updates/artifacts/:artifactId`

Stream the approved installation artifact for the tenant.

Rules:

- the bearer token must be a valid download token
- the token's artifactId must match the path parameter
- the artifact must still exist on disk and remain approved for the tenant

The server returns the file with `Content-Type: application/octet-stream` and a download filename derived from the approved release metadata.

### `POST /agent-updates/report`

Record update lifecycle events from the client.

Request body fields:

- `eventType` - required lifecycle event name
- `deviceId` - optional device identifier
- `currentAppVersion` - optional client version at the time of the event
- `targetVersion` - optional version the client is moving toward
- `artifactId` - optional artifact involved in the event
- `metadata` - optional free-form JSON payload

Typical event names:

- `download_started`
- `download_completed`
- `install_scheduled`
- `install_completed`
- `install_failed`
- `rollback_completed`

Response:

```json
{
  "success": true,
  "data": {
    "recorded": true
  },
  "error": null
}
```

## Operational Notes

- Manifest selection is tenant-scoped and channel-scoped.
- Download tokens are one-time use.
- Update audit rows are appended for reporting and incident review; they do not gate client behavior.
- Artifact hosting remains on the call-center server, not a shared operator CDN, so the file path in the release record must be valid on that server.
