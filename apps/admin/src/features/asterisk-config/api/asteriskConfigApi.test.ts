import { describe, expect, it, vi } from 'vitest';

describe('asteriskConfigApi mock mode', () => {
  it('returns built-in PBX configuration rows without calling the backend', async () => {
    vi.resetModules();
    vi.doMock('../../../config', () => ({
      API_BASE_URL: 'http://localhost:3000/api/v1',
      ACCESS_TOKEN_KEY: 'kaster.access_token',
      USE_MOCK: true,
    }));
    const get = vi.fn();
    vi.doMock('axios', () => ({ default: { get } }));

    const { getTrunks, getDids, getIvrMenus, getAgentSip } = await import('./asteriskConfigApi');

    expect((await getTrunks()).length).toBeGreaterThan(0);
    expect((await getDids()).length).toBeGreaterThan(0);
    expect((await getIvrMenus()).length).toBeGreaterThan(0);
    expect((await getAgentSip()).length).toBeGreaterThan(0);
    expect(get).not.toHaveBeenCalled();
  });
});
