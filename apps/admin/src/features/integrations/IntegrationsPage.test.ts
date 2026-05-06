import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveLiveIntegrationHealth } from './IntegrationsPage';

const source = readFileSync(resolve(__dirname, 'IntegrationsPage.tsx'), 'utf8');

describe('resolveLiveIntegrationHealth', () => {
  it('maps the current /health checks shape to connected integration statuses', () => {
    expect(resolveLiveIntegrationHealth({
      checks: { db: 'up', redis: 'up', ami: 'connected' },
    })).toMatchObject({
      ami: 'connected',
      redis: 'connected',
      db: 'connected',
    });
  });

  it('keeps disconnected infrastructure visible as errors', () => {
    expect(resolveLiveIntegrationHealth({
      checks: { db: 'down', redis: 'down', ami: 'disconnected' },
    })).toMatchObject({
      ami: 'error',
      redis: 'error',
      db: 'error',
    });
  });

  it('still supports the previous nested boolean health shape', () => {
    expect(resolveLiveIntegrationHealth({
      ami: { connected: true, lastEventAt: '2026-05-05T16:44:29.207Z' },
      redis: { connected: true },
      db: { connected: true },
    })).toEqual({
      ami: 'connected',
      redis: 'connected',
      db: 'connected',
      lastEventAt: '2026-05-05T16:44:29.207Z',
    });
  });

  it('uses PBX naming in user-facing integration copy', () => {
    expect(source).toContain("name: 'PBX AMI'");
    expect(source).toContain('PBX 관리 인터페이스');
    expect(source).not.toContain("name: 'Asterisk AMI'");
    expect(source).not.toContain('Asterisk Manager Interface');
  });
});
