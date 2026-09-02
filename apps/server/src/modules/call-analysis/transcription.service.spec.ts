import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildMonoWav } from './audio/wav-channels.util';
import { TranscriptionService } from './transcription.service';
import { SttProvider, SttTranscribeInput } from './providers/stt.provider';
import { CallAnalysisProviderFactory } from './providers/provider.factory';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const CALL_ID = '00000000-0000-0000-0000-0000000000c1';
const RECORDING_ID = '00000000-0000-0000-0000-0000000000r1'.replace('r', 'a');

function buildStereoWav(frames: Array<[number, number]>, sampleRate = 8000): Buffer {
  const pcm = Buffer.alloc(frames.length * 4);
  frames.forEach(([left, right], index) => {
    pcm.writeInt16LE(left, index * 4);
    pcm.writeInt16LE(right, index * 4 + 2);
  });
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

class RecordingStt implements SttProvider {
  readonly name = 'recording';
  readonly calls: SttTranscribeInput[] = [];
  constructor(private readonly textBySpeaker: Record<string, string> = {}) {}

  async transcribe(input: SttTranscribeInput) {
    this.calls.push(input);
    const text = this.textBySpeaker[input.speaker] ?? `${input.speaker} 발화`;
    return {
      text,
      segments: [{ speaker: input.speaker, startMs: 0, endMs: 500, text, confidence: 0.9 }],
      confidence: 0.9,
      modelName: 'recording-stt',
    };
  }
}

function buildPrisma(recording: Record<string, unknown> | null) {
  const state = {
    upserted: [] as any[],
    deletedFor: [] as any[],
    createdSegments: [] as any[],
    recordingUpdates: [] as any[],
  };
  const prisma: any = {
    callRecordings: {
      findFirst: jest.fn().mockResolvedValue(recording),
      update: jest.fn().mockImplementation(async (args: any) => {
        state.recordingUpdates.push(args);
        return args;
      }),
    },
    callTranscripts: {
      upsert: jest.fn().mockImplementation(async (args: any) => {
        state.upserted.push(args);
        return { transcriptId: 'transcript-1' };
      }),
    },
    callTranscriptSegments: {
      deleteMany: jest.fn().mockImplementation(async (args: any) => {
        state.deletedFor.push(args);
        return { count: 0 };
      }),
      createMany: jest.fn().mockImplementation(async (args: any) => {
        state.createdSegments.push(...args.data);
        return { count: args.data.length };
      }),
    },
  };
  return { prisma, state };
}

function buildService(options: {
  recording: Record<string, unknown> | null;
  stt?: SttProvider;
  env?: Record<string, string>;
  decryptToBuffer?: jest.Mock;
}) {
  const { prisma, state } = buildPrisma(options.recording);
  const stt = options.stt ?? new RecordingStt();
  const env = options.env ?? {};
  const config = { get: (key: string, fallback?: string) => env[key] ?? fallback } as unknown as ConfigService;
  const encryption = {
    decryptFileToBuffer: options.decryptToBuffer ?? jest.fn(),
  } as any;
  const providers = { stt: () => stt } as unknown as CallAnalysisProviderFactory;
  const service = new TranscriptionService(prisma, config, encryption, providers);
  return { service, state, stt, encryption, prisma };
}

describe('TranscriptionService', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kaster-transcribe-'));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeWav(name: string, buffer: Buffer) {
    const filePath = path.join(tmpDir, name);
    await fs.writeFile(filePath, buffer);
    return filePath;
  }

  it('스테레오 녹취는 좌=고객 우=상담원으로 두 번 STT 를 부른다', async () => {
    const filePath = await writeWav('stereo.wav', buildStereoWav([[1, -1], [2, -2]]));
    const stt = new RecordingStt({ CUSTOMER: '배송 언제 오나요', AGENT: '내일 도착합니다' });
    const { service, state } = buildService({
      stt,
      recording: {
        recordingId: RECORDING_ID,
        tenantId: TENANT_ID,
        callId: CALL_ID,
        filePath,
        playbackFilePath: null,
        encryptionStatus: 'NONE',
        encryptedFilePath: null,
        encryptedPlaybackFilePath: null,
      },
    });

    const result = await service.transcribe({ tenantId: TENANT_ID, callId: CALL_ID, recordingId: RECORDING_ID });

    expect(stt.calls.map((call) => call.speaker)).toEqual(['CUSTOMER', 'AGENT']);
    expect(stt.calls[0].bitsPerSample).toBe(16);
    expect(stt.calls[0].sampleRate).toBe(8000);
    expect(result.segmentCount).toBe(2);
    expect(state.upserted[0].create.fullText).toContain('고객: 배송 언제 오나요');
    expect(state.upserted[0].create.fullText).toContain('상담원: 내일 도착합니다');
  });

  it('고객 채널을 오른쪽으로 바꿀 수 있다', async () => {
    const filePath = await writeWav('stereo-swapped.wav', buildStereoWav([[1, -1]]));
    const stt = new RecordingStt();
    const { service } = buildService({
      stt,
      env: { CALL_ANALYSIS_CUSTOMER_CHANNEL: 'right' },
      recording: {
        recordingId: RECORDING_ID,
        tenantId: TENANT_ID,
        callId: CALL_ID,
        filePath,
        encryptionStatus: 'NONE',
      },
    });

    await service.transcribe({ tenantId: TENANT_ID, callId: CALL_ID, recordingId: RECORDING_ID });

    expect(stt.calls.map((call) => call.speaker)).toEqual(['AGENT', 'CUSTOMER']);
  });

  it('모노 녹취는 UNKNOWN 화자로 한 번만 부른다', async () => {
    const filePath = await writeWav('mono.wav', buildMonoWav(Buffer.alloc(8), { sampleRate: 8000, bitsPerSample: 16 }));
    const stt = new RecordingStt();
    const { service, state } = buildService({
      stt,
      recording: {
        recordingId: RECORDING_ID,
        tenantId: TENANT_ID,
        callId: CALL_ID,
        filePath,
        encryptionStatus: 'NONE',
      },
    });

    await service.transcribe({ tenantId: TENANT_ID, callId: CALL_ID, recordingId: RECORDING_ID });

    expect(stt.calls).toHaveLength(1);
    expect(stt.calls[0].speaker).toBe('UNKNOWN');
    expect(state.recordingUpdates[0].data.speakerSeparationStatus).toBe('NOT_APPLICABLE');
  });

  it('스테레오면 화자분리 상태를 SEPARATED 로 남긴다', async () => {
    const filePath = await writeWav('stereo-status.wav', buildStereoWav([[1, -1]]));
    const { service, state } = buildService({
      recording: {
        recordingId: RECORDING_ID,
        tenantId: TENANT_ID,
        callId: CALL_ID,
        filePath,
        encryptionStatus: 'NONE',
      },
    });

    await service.transcribe({ tenantId: TENANT_ID, callId: CALL_ID, recordingId: RECORDING_ID });

    expect(state.recordingUpdates[0].data.speakerSeparationStatus).toBe('SEPARATED');
  });

  it('재생용 변환본이 있으면 그쪽을 먼저 읽는다', async () => {
    const rawPath = await writeWav('origin.raw', Buffer.alloc(8));
    const playbackPath = await writeWav('origin.wav', buildMonoWav(Buffer.alloc(8), { sampleRate: 8000, bitsPerSample: 16 }));
    const { service } = buildService({
      recording: {
        recordingId: RECORDING_ID,
        tenantId: TENANT_ID,
        callId: CALL_ID,
        filePath: rawPath,
        playbackFilePath: playbackPath,
        encryptionStatus: 'NONE',
      },
    });

    await expect(
      service.transcribe({ tenantId: TENANT_ID, callId: CALL_ID, recordingId: RECORDING_ID }),
    ).resolves.toBeDefined();
  });

  it('암호화된 녹취는 복호해서 읽는다', async () => {
    const wav = buildMonoWav(Buffer.alloc(8), { sampleRate: 8000, bitsPerSample: 16 });
    const decryptToBuffer = jest.fn().mockResolvedValue(wav);
    const { service } = buildService({
      decryptToBuffer,
      recording: {
        recordingId: RECORDING_ID,
        tenantId: TENANT_ID,
        callId: CALL_ID,
        filePath: '/no/such/plain.wav',
        encryptionStatus: 'ENCRYPTED',
        encryptedPlaybackFilePath: '/enc/playback.wav.enc',
        encryptedFilePath: '/enc/origin.wav.enc',
      },
    });

    await service.transcribe({ tenantId: TENANT_ID, callId: CALL_ID, recordingId: RECORDING_ID });

    expect(decryptToBuffer).toHaveBeenCalledWith('/enc/playback.wav.enc');
  });

  it('전문과 세그먼트에 개인정보 마스킹을 적용한다', async () => {
    const filePath = await writeWav('pii.wav', buildMonoWav(Buffer.alloc(8), { sampleRate: 8000, bitsPerSample: 16 }));
    const stt = new RecordingStt({ UNKNOWN: '제 번호는 010-1234-5678 입니다' });
    const { service, state } = buildService({
      stt,
      recording: {
        recordingId: RECORDING_ID,
        tenantId: TENANT_ID,
        callId: CALL_ID,
        filePath,
        encryptionStatus: 'NONE',
      },
    });

    await service.transcribe({ tenantId: TENANT_ID, callId: CALL_ID, recordingId: RECORDING_ID });

    expect(state.upserted[0].create.fullText).toContain('010-****-5678');
    expect(state.upserted[0].create.fullText).not.toContain('010-1234-5678');
    expect(state.createdSegments[0].text).toContain('010-****-5678');
  });

  it('다시 돌리면 기존 세그먼트를 지우고 다시 쓴다', async () => {
    const filePath = await writeWav('idempotent.wav', buildMonoWav(Buffer.alloc(8), { sampleRate: 8000, bitsPerSample: 16 }));
    const { service, state } = buildService({
      recording: {
        recordingId: RECORDING_ID,
        tenantId: TENANT_ID,
        callId: CALL_ID,
        filePath,
        encryptionStatus: 'NONE',
      },
    });

    await service.transcribe({ tenantId: TENANT_ID, callId: CALL_ID, recordingId: RECORDING_ID });

    expect(state.deletedFor[0].where.transcriptId).toBe('transcript-1');
  });

  it('녹취 행이 없으면 던진다', async () => {
    const { service } = buildService({ recording: null });

    await expect(
      service.transcribe({ tenantId: TENANT_ID, callId: CALL_ID, recordingId: RECORDING_ID }),
    ).rejects.toThrow(/recording/i);
  });

  it('읽을 파일 경로가 없으면 던진다', async () => {
    const { service } = buildService({
      recording: {
        recordingId: RECORDING_ID,
        tenantId: TENANT_ID,
        callId: CALL_ID,
        filePath: null,
        encryptionStatus: 'NONE',
      },
    });

    await expect(
      service.transcribe({ tenantId: TENANT_ID, callId: CALL_ID, recordingId: RECORDING_ID }),
    ).rejects.toThrow(/file path/i);
  });

  it('테넌트 조건 없이 녹취를 찾지 않는다', async () => {
    const filePath = await writeWav('tenant.wav', buildMonoWav(Buffer.alloc(8), { sampleRate: 8000, bitsPerSample: 16 }));
    const { service, prisma } = buildService({
      recording: {
        recordingId: RECORDING_ID,
        tenantId: TENANT_ID,
        callId: CALL_ID,
        filePath,
        encryptionStatus: 'NONE',
      },
    });

    await service.transcribe({ tenantId: TENANT_ID, callId: CALL_ID, recordingId: RECORDING_ID });

    expect(prisma.callRecordings.findFirst.mock.calls[0][0].where).toMatchObject({
      tenantId: TENANT_ID,
      callId: CALL_ID,
      recordingId: RECORDING_ID,
    });
  });
});
