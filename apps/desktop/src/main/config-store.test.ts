import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopConfigStore } from './config-store';

const fsState = new Map<string, string>();

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(async () => undefined),
  readFile: vi.fn(async (path: string) => {
    const value = fsState.get(path);
    if (!value) throw Object.assign(new Error('not found'), { code: 'ENOENT' });
    return value;
  }),
  writeFile: vi.fn(async (path: string, value: string) => {
    fsState.set(path, value);
  }),
}));

vi.mock('node:crypto', () => ({
  randomUUID: () => 'device-uuid-1',
}));

describe('DesktopConfigStore', () => {
  beforeEach(() => fsState.clear());

  it('초기 저장 시 deviceId 를 자동 생성한다', async () => {
    const store = new DesktopConfigStore('C:/Users/test/AppData/Roaming/KAster');

    const saved = await store.save({
      serverUrl: 'https://cti-center-a.example.com',
      channel: 'stable',
    });

    expect(saved).toEqual({
      serverUrl: 'https://cti-center-a.example.com',
      channel: 'stable',
      deviceId: 'device-uuid-1',
    });
  });
});
