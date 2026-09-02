import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RecordingEncryptionService } from './recording-encryption.service';
import { RecordingFinalizerService } from './recording-finalizer.service';
import { RecordingStorageService } from './recording-storage.service';

function createPrismaMock() {
  const recording = { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() };
  const job = { update: jest.fn() };
  const policy = { findUnique: jest.fn() };
  return {
    callRecordings: recording,
    recordingFinalizeJobs: job,
    recordingRetentionPolicies: policy,
  } as any;
}

function configFromObject(values: Record<string, string>) {
  return {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  } as any;
}

describe('RecordingFinalizerService', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaster-rec-finalizer-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('marks a non-empty recording READY with checksum and retention date', async () => {
    const recFile = '2026/07/27/call.wav';
    const absolute = path.join(tmpDir, recFile);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, 'ready-recording');

    const prisma = createPrismaMock();
    prisma.callRecordings.findFirst.mockResolvedValue(null);
    prisma.callRecordings.create.mockResolvedValue({ recordingId: 'rec-1' });
    prisma.recordingRetentionPolicies.findUnique.mockResolvedValue({ retentionDays: 30, enabled: true });

    const service = new RecordingFinalizerService(
      prisma,
      new RecordingStorageService(configFromObject({ RECORDING_STORAGE_ROOT: tmpDir })),
      new RecordingEncryptionService(configFromObject({ RECORDING_ENCRYPTION_ENABLED: 'false' })),
      {} as any,
      { isEnabled: async () => true } as any,
    );

    await service.finalizeJob({
      recordingFinalizeJobId: 'job-1',
      tenantId: '00000000-0000-0000-0000-000000000001',
      callId: '11111111-1111-1111-1111-111111111111',
      linkedid: 'linked-1',
      recFile,
      attempts: 0,
    });

    expect(prisma.callRecordings.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        recordingStatus: 'READY',
        encryptionStatus: 'NONE',
        fileSizeBytes: BigInt(15),
        checksumSha256: '731888246b5f724a9cc95125c52a2bb5065fb98bd247228ba44f10fa2f34e948',
        retentionUntil: expect.any(Date),
        finalizedAt: expect.any(Date),
      }),
    }));
    expect(prisma.recordingFinalizeJobs.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'COMPLETED' }),
    }));
  });

  it('leaves a missing recording retryable with MISSING status', async () => {
    const prisma = createPrismaMock();
    prisma.callRecordings.findFirst.mockResolvedValue(null);
    prisma.callRecordings.create.mockResolvedValue({ recordingId: 'rec-2' });
    prisma.recordingRetentionPolicies.findUnique.mockResolvedValue(null);

    const service = new RecordingFinalizerService(
      prisma,
      new RecordingStorageService(configFromObject({ RECORDING_STORAGE_ROOT: tmpDir })),
      new RecordingEncryptionService(configFromObject({ RECORDING_ENCRYPTION_ENABLED: 'false' })),
      {} as any,
      { isEnabled: async () => true } as any,
    );

    await service.finalizeJob({
      recordingFinalizeJobId: 'job-2',
      tenantId: '00000000-0000-0000-0000-000000000001',
      callId: '11111111-1111-1111-1111-111111111111',
      linkedid: 'linked-2',
      recFile: 'missing.wav',
      attempts: 1,
    });

    expect(prisma.callRecordings.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        recordingStatus: 'MISSING',
        failureReason: expect.stringContaining('not found'),
      }),
    }));
    expect(prisma.recordingFinalizeJobs.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'RETRY',
        attempts: 2,
        nextAttemptAt: expect.any(Date),
      }),
    }));
  });

  it('creates a playable WAV variant for stereo RAW recordings', async () => {
    const recFile = '2026/08/08/stereo.raw';
    const absolute = path.join(tmpDir, recFile);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]));

    const prisma = createPrismaMock();
    prisma.callRecordings.findFirst.mockResolvedValue(null);
    prisma.callRecordings.create.mockResolvedValue({ recordingId: 'rec-raw-1' });
    prisma.recordingRetentionPolicies.findUnique.mockResolvedValue(null);

    const service = new RecordingFinalizerService(
      prisma,
      new RecordingStorageService(configFromObject({ RECORDING_STORAGE_ROOT: tmpDir })),
      new RecordingEncryptionService(configFromObject({ RECORDING_ENCRYPTION_ENABLED: 'false' })),
      {} as any,
      { isEnabled: async () => true } as any,
    );

    await service.finalizeJob({
      recordingFinalizeJobId: 'job-raw-1',
      tenantId: '00000000-0000-0000-0000-000000000001',
      callId: '11111111-1111-1111-1111-111111111111',
      linkedid: 'linked-raw-1',
      recFile,
      attempts: 0,
    });

    const playbackPath = path.join(tmpDir, '2026', '08', '08', 'stereo.wav');
    expect(fs.readFileSync(playbackPath).subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(prisma.callRecordings.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        fileFormat: 'raw',
        playbackFilePath: playbackPath,
        playbackFileFormat: 'wav',
        playbackFileSizeBytes: BigInt(52),
        encryptedPlaybackFilePath: null,
      }),
    }));
  });

  // 녹취가 준비됐다는 알림이 전 테넌트로 가면 남의 회사 통화 식별자가 보인다.
  it('announces a ready recording only to the tenant that owns it', async () => {
    const recFile = '2026/08/21/scoped.wav';
    const absolute = path.join(tmpDir, recFile);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, 'ready-recording');

    const prisma = createPrismaMock();
    prisma.callRecordings.findFirst.mockResolvedValue(null);
    prisma.callRecordings.create.mockResolvedValue({ recordingId: 'rec-scoped-1' });
    prisma.recordingRetentionPolicies.findUnique.mockResolvedValue(null);

    const eventBus = { publish: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new RecordingFinalizerService(
      prisma,
      new RecordingStorageService(configFromObject({ RECORDING_STORAGE_ROOT: tmpDir })),
      new RecordingEncryptionService(configFromObject({ RECORDING_ENCRYPTION_ENABLED: 'false' })),
      eventBus,
      { isEnabled: async () => true } as any,
    );

    await service.finalizeJob({
      recordingFinalizeJobId: 'job-scoped-1',
      tenantId: '00000000-0000-0000-0000-000000000001',
      callId: '11111111-1111-1111-1111-111111111111',
      linkedid: 'linked-scoped-1',
      recFile,
      attempts: 0,
    });

    expect(eventBus.publish).toHaveBeenCalledWith(
      'recording.ready',
      expect.objectContaining({ recordingId: 'rec-scoped-1' }),
      '00000000-0000-0000-0000-000000000001',
    );
  });
});
