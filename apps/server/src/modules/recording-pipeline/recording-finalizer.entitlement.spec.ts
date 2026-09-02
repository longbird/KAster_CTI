import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RecordingEncryptionService } from './recording-encryption.service';
import { RecordingFinalizerService } from './recording-finalizer.service';
import { RecordingStorageService } from './recording-storage.service';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const CALL_ID = '11111111-1111-1111-1111-111111111111';
const KEY = 'a'.repeat(64); // 32바이트 hex

function configFromObject(values: Record<string, string>) {
  return { get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback) } as any;
}

function createPrismaMock() {
  return {
    callRecordings: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ recordingId: 'rec-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    recordingFinalizeJobs: { update: jest.fn().mockResolvedValue({}) },
    recordingRetentionPolicies: { findUnique: jest.fn().mockResolvedValue(null) },
    callSessions: { update: jest.fn().mockResolvedValue({}) },
  } as any;
}

describe('녹취 암호화 자격', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaster-rec-entitlement-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function finalize(options: { envEnabled: boolean; entitled: boolean }) {
    const recFile = '2026/09/02/call.wav';
    const absolute = path.join(tmpDir, recFile);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, 'recording-bytes');

    const prisma = createPrismaMock();
    const env = {
      RECORDING_STORAGE_ROOT: tmpDir,
      RECORDING_ENCRYPTION_ENABLED: options.envEnabled ? 'true' : 'false',
      RECORDING_ENCRYPTION_KEY: KEY,
    };
    const encryption = new RecordingEncryptionService(configFromObject(env));
    const service = new RecordingFinalizerService(
      prisma,
      new RecordingStorageService(configFromObject(env)),
      encryption,
      { publish: jest.fn() } as any,
      { isEnabled: async () => options.entitled } as any,
    );

    await service.finalizeJob({
      recordingFinalizeJobId: 'job-1',
      tenantId: TENANT_ID,
      callId: CALL_ID,
      linkedid: 'linked-1',
      recFile,
      attempts: 0,
    });

    return { prisma, encryption, absolute, saved: prisma.callRecordings.create.mock.calls[0]?.[0]?.data };
  }

  it('자격과 env 가 모두 켜져 있으면 암호화한다', async () => {
    const { saved, absolute } = await finalize({ envEnabled: true, entitled: true });

    expect(saved.encryptionStatus).toBe('ENCRYPTED');
    expect(saved.encryptedFilePath).toBe(`${absolute}.enc`);
    // 암호화는 평문을 지운다. 이것이 되돌릴 수 없는 이유다.
    expect(fs.existsSync(absolute)).toBe(false);
  });

  it('자격이 없으면 env 가 켜져 있어도 암호화하지 않는다', async () => {
    const { saved, absolute } = await finalize({ envEnabled: true, entitled: false });

    expect(saved.encryptionStatus).toBe('NONE');
    expect(saved.encryptedFilePath).toBeNull();
    expect(fs.existsSync(absolute)).toBe(true);
  });

  // env 가 최종 거부권을 갖는다. 서버에 키가 없으면 자격이 있어도 암호화할 수 없다.
  it('자격이 있어도 env 가 꺼져 있으면 암호화하지 않는다', async () => {
    const { saved } = await finalize({ envEnabled: false, entitled: true });

    expect(saved.encryptionStatus).toBe('NONE');
  });

  it('둘 다 꺼져 있으면 평문 그대로다', async () => {
    const { saved, absolute } = await finalize({ envEnabled: false, entitled: false });

    expect(saved.encryptionStatus).toBe('NONE');
    expect(fs.existsSync(absolute)).toBe(true);
  });

  it('자격 판정을 그 통화의 테넌트로 묻는다', async () => {
    const isEnabled = jest.fn().mockResolvedValue(false);
    const recFile = '2026/09/02/tenant.wav';
    const absolute = path.join(tmpDir, recFile);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, 'bytes');
    const env = { RECORDING_STORAGE_ROOT: tmpDir, RECORDING_ENCRYPTION_ENABLED: 'true', RECORDING_ENCRYPTION_KEY: KEY };

    const service = new RecordingFinalizerService(
      createPrismaMock(),
      new RecordingStorageService(configFromObject(env)),
      new RecordingEncryptionService(configFromObject(env)),
      { publish: jest.fn() } as any,
      { isEnabled } as any,
    );

    await service.finalizeJob({
      recordingFinalizeJobId: 'job-2',
      tenantId: TENANT_ID,
      callId: CALL_ID,
      linkedid: 'linked-2',
      recFile,
      attempts: 0,
    });

    expect(isEnabled).toHaveBeenCalledWith(TENANT_ID, 'recording-encryption');
  });

  /**
   * 자격은 "새 녹취를 암호화할 것인가" 에만 쓴다.
   * "이미 암호화된 것을 읽을 것인가" 에 쓰면, 언젠가 기존 녹취를 못 듣게 된다.
   */
  describe('복호 경로는 자격을 보지 않는다', () => {
    it('env 를 끈 뒤에도 이미 암호화된 녹취를 복호할 수 있다', async () => {
      const plain = path.join(tmpDir, 'old.wav');
      fs.writeFileSync(plain, 'old-recording-bytes');

      const encryptingService = new RecordingEncryptionService(
        configFromObject({ RECORDING_ENCRYPTION_ENABLED: 'true', RECORDING_ENCRYPTION_KEY: KEY }),
      );
      const encrypted = await encryptingService.encryptFile(plain);

      // 나중에 env 를 껐다고 가정한다. 키는 남아 있다.
      const laterService = new RecordingEncryptionService(
        configFromObject({ RECORDING_ENCRYPTION_ENABLED: 'false', RECORDING_ENCRYPTION_KEY: KEY }),
      );

      const buffer = await laterService.decryptFileToBuffer(encrypted.encryptedFilePath as string);
      expect(buffer.toString()).toBe('old-recording-bytes');
    });

    it('암호화 서비스는 자격을 아예 주입받지 않는다', () => {
      // 생성자 인자가 ConfigService 하나뿐이라는 사실 자체가 계약이다.
      expect(RecordingEncryptionService.length).toBe(1);
    });
  });
});
