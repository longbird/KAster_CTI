import { describe, expect, it, vi } from 'vitest';

describe('asteriskConfigApi', () => {
  it('loads PBX configuration rows from the backend API', async () => {
    vi.resetModules();
    vi.doMock('../../../config', () => ({
      API_BASE_URL: 'http://localhost:3000/api/v1',
      ACCESS_TOKEN_KEY: 'kaster.access_token',
    }));
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => 'token') });
    const get = vi.fn((url: string) => {
      const data = [{ id: url }];
      return Promise.resolve({ data: { data } });
    });
    vi.doMock('axios', () => ({ default: { get } }));

    const { getTrunks, getDids, getIvrMenus, getAgentSip } = await import('./asteriskConfigApi');

    await expect(getTrunks()).resolves.toEqual([{ id: 'http://localhost:3000/api/v1/asterisk-config/trunks' }]);
    await expect(getDids()).resolves.toEqual([{ id: 'http://localhost:3000/api/v1/asterisk-config/dids' }]);
    await expect(getIvrMenus()).resolves.toEqual([{ id: 'http://localhost:3000/api/v1/asterisk-config/ivr-menus' }]);
    await expect(getAgentSip()).resolves.toEqual([{ id: 'http://localhost:3000/api/v1/asterisk-config/agents-sip' }]);
    expect(get).toHaveBeenCalledTimes(4);
    expect(get).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/asterisk-config/trunks',
      { headers: { Authorization: 'Bearer token' } },
    );
  });
});
