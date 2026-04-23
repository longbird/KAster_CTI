import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPreferencesStore } from './audio-preferences-store';

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

describe('AudioPreferencesStore', () => {
  beforeEach(() => fsState.clear());

  it('설정이 없으면 기본 오디오 기본값을 반환한다', async () => {
    const store = new AudioPreferencesStore('C:/Users/test/AppData/Roaming/KAster');

    await expect(store.load()).resolves.toEqual({
      inputDeviceId: null,
      outputDeviceId: null,
      ringDeviceId: null,
      echoCancellation: true,
      noiseSuppression: true,
    });
  });

  it('저장 후 다시 읽으면 마지막 선택값을 유지한다', async () => {
    const store = new AudioPreferencesStore('C:/Users/test/AppData/Roaming/KAster');

    await store.save({
      inputDeviceId: 'mic-1',
      outputDeviceId: 'speaker-1',
      ringDeviceId: 'ring-1',
      echoCancellation: false,
      noiseSuppression: true,
    });

    await expect(store.load()).resolves.toEqual({
      inputDeviceId: 'mic-1',
      outputDeviceId: 'speaker-1',
      ringDeviceId: 'ring-1',
      echoCancellation: false,
      noiseSuppression: true,
    });
  });
});
