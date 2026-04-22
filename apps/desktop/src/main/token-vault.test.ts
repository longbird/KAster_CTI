import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fsState, encryptString, decryptString } = vi.hoisted(() => {
  const fsState = new Map<string, Buffer>();
  const encryptString = vi.fn((value: string) => Buffer.from(`enc:${value}`, 'utf8'));
  const decryptString = vi.fn((value: Buffer) => value.toString('utf8').replace(/^enc:/, ''));

  return { fsState, encryptString, decryptString };
});

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString,
    decryptString,
  },
}));

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(async () => undefined),
  readFile: vi.fn(async (path: string) => {
    const value = fsState.get(path);
    if (!value) {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    }
    return value;
  }),
  rm: vi.fn(async (path: string) => {
    fsState.delete(path);
  }),
  writeFile: vi.fn(async (path: string, value: Buffer) => {
    fsState.set(path, Buffer.from(value));
  }),
}));

import { TokenVault } from './token-vault';

describe('TokenVault', () => {
  beforeEach(() => {
    fsState.clear();
    encryptString.mockClear();
    decryptString.mockClear();
  });

  it('세션을 safeStorage 로 암호화해 저장하고 다시 복호화한다', async () => {
    const vault = new TokenVault('C:/Users/test/AppData/Roaming/KAster');
    const session = {
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      agent: {
        agentId: 'agent-1',
        agentName: '상담원1',
        extension: '1001',
        role: 'agent',
      },
    };

    await vault.save(session);
    const loaded = await vault.load();

    expect(encryptString).toHaveBeenCalledWith(JSON.stringify(session));
    expect(decryptString).toHaveBeenCalled();
    expect(loaded).toEqual(session);
    expect(Array.from(fsState.values())[0]?.toString('utf8')).toContain('enc:');
  });

  it('세션 파일이 없으면 null 을 반환한다', async () => {
    const vault = new TokenVault('C:/Users/test/AppData/Roaming/KAster');

    await expect(vault.load()).resolves.toBeNull();
  });
});
