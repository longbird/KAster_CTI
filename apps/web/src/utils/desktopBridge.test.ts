import { describe, expect, it } from 'vitest';
import { buildDesktopConnectUrl, deriveCenterServerUrl } from './desktopBridge';

describe('desktopBridge', () => {
  it('strips /api/v1 suffix when deriving center server url', () => {
    expect(deriveCenterServerUrl('https://cti.example.com/api/v1')).toBe('https://cti.example.com');
    expect(deriveCenterServerUrl('https://cti.example.com/edge/api/v1')).toBe('https://cti.example.com/edge');
  });

  it('builds desktop connect protocol url', () => {
    expect(
      buildDesktopConnectUrl({
        serverUrl: 'https://cti.example.com',
        handoffToken: 'handoff-1',
        channel: 'stable',
      }),
    ).toBe(
      'kaster-agent://connect?serverUrl=https%3A%2F%2Fcti.example.com&handoffToken=handoff-1&channel=stable',
    );
  });
});
