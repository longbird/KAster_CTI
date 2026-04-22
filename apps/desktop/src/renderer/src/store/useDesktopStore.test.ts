import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesktopStore } from './useDesktopStore';

const desktopApi = {
  getConfig: vi.fn().mockResolvedValue(null),
  saveConfig: vi.fn().mockResolvedValue({
    serverUrl: 'https://cti-center-a.example.com',
    channel: 'stable',
    deviceId: 'device-1',
  }),
};

vi.stubGlobal('window', { desktopApi });

describe('useDesktopStore pairing', () => {
  beforeEach(() => {
    useDesktopStore.setState({
      bootstrapped: false,
      pairing: false,
      config: null,
      events: [],
    });
  });

  it('pair 는 config 저장 후 초기 런타임 셸 상태를 준비한다', async () => {
    await useDesktopStore.getState().pair({
      serverUrl: 'cti-center-a.example.com',
      channel: 'stable',
    });

    const state = useDesktopStore.getState();
    expect(state.config?.serverUrl).toBe('https://cti-center-a.example.com');
    expect(state.bootstrapped).toBe(true);
    expect(state.events[0]).toContain('https://cti-center-a.example.com');
  });
});
