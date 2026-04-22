import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./download-store', () => ({
  persistArtifact: vi.fn(async (_dir: string, _fileName: string) => 'C:/temp/KAsterAgent-1.4.0-Setup.exe'),
  verifySha256: vi.fn(async () => true),
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      post: vi.fn(),
      get: vi.fn(),
    })),
  },
}));

import axios from 'axios';
import { persistArtifact, verifySha256 } from './download-store';
import { UpdateClient } from './update-client';

describe('UpdateClient', () => {
  const create = vi.mocked(axios.create);
  const persistArtifactMock = vi.mocked(persistArtifact);
  const verifySha256Mock = vi.mocked(verifySha256);
  let post: ReturnType<typeof vi.fn>;
  let get: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    post = vi.fn();
    get = vi.fn();
    create.mockReset();
    create.mockReturnValue({ post, get } as never);
    persistArtifactMock.mockClear();
    verifySha256Mock.mockClear();
  });

  it('pollManifest 는 update session token 으로 manifest 를 조회한다', async () => {
    post.mockResolvedValueOnce({
      data: {
        data: {
          updateSessionToken: 'update-session-1',
          expiresIn: 600,
        },
      },
    });
    get.mockResolvedValueOnce({
      data: {
        data: {
          latestVersion: '1.4.0',
          mandatory: false,
          artifacts: [],
        },
      },
    });

    const client = new UpdateClient('https://cti-center-a.example.com', 'access-1');
    const manifest = await client.pollManifest({
      deviceId: 'device-1',
      currentVersion: '1.3.2',
      channel: 'stable',
    });

    expect(post).toHaveBeenCalledWith('/agent-updates/session', {
      deviceId: 'device-1',
      currentVersion: '1.3.2',
    });
    expect(get).toHaveBeenCalledWith('/agent-updates/manifest', {
      headers: {
        Authorization: 'Bearer update-session-1',
      },
      params: {
        currentVersion: '1.3.2',
        channel: 'stable',
      },
    });
    expect(manifest?.latestVersion).toBe('1.4.0');
  });

  it('prepareUpdate 는 download-init 후 파일을 저장하고 sha256 을 검증한다', async () => {
    post
      .mockResolvedValueOnce({
        data: {
          data: {
            updateSessionToken: 'update-session-1',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            updateSessionToken: 'update-session-2',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            artifactId: 'agent-win-x64-1.4.0',
            version: '1.4.0',
            downloadUrl: '/agent-updates/artifacts/agent-win-x64-1.4.0',
            downloadToken: 'download-token-1',
            sha256: 'abc123',
          },
        },
      })
      .mockResolvedValueOnce({ data: { data: { recorded: true } } })
      .mockResolvedValueOnce({ data: { data: { recorded: true } } });

    get
      .mockResolvedValueOnce({
        data: {
          data: {
            latestVersion: '1.4.0',
            mandatory: true,
            artifacts: [
              {
                artifactId: 'agent-win-x64-1.4.0',
                version: '1.4.0',
                fileName: 'KAsterAgent-1.4.0-Setup.exe',
                size: 123,
                sha256: 'abc123',
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: new ArrayBuffer(16),
      });

    const client = new UpdateClient(
      'https://cti-center-a.example.com',
      'access-1',
      'C:/temp/kaster-agent-updates',
    );
    const prepared = await client.prepareUpdate({
      deviceId: 'device-1',
      currentVersion: '1.3.2',
      channel: 'stable',
    });

    expect(post).toHaveBeenNthCalledWith(3, '/agent-updates/download-init', {
      artifactId: 'agent-win-x64-1.4.0',
      currentVersion: '1.3.2',
    }, {
      headers: {
        Authorization: 'Bearer update-session-2',
      },
    });
    expect(get).toHaveBeenNthCalledWith(2, '/agent-updates/artifacts/agent-win-x64-1.4.0', {
      headers: {
        Authorization: 'Bearer download-token-1',
      },
      responseType: 'arraybuffer',
    });
    expect(persistArtifactMock).toHaveBeenCalledWith(
      'C:/temp/kaster-agent-updates',
      'KAsterAgent-1.4.0-Setup.exe',
      expect.any(Uint8Array),
    );
    expect(verifySha256Mock).toHaveBeenCalledWith('C:/temp/KAsterAgent-1.4.0-Setup.exe', 'abc123');
    expect(prepared).toEqual({
      version: '1.4.0',
      fileName: 'KAsterAgent-1.4.0-Setup.exe',
      filePath: 'C:/temp/KAsterAgent-1.4.0-Setup.exe',
      verified: true,
      mandatory: true,
    });
  });
});
