import { Test, TestingModule } from '@nestjs/testing';
import { Readable } from 'node:stream';
import { PrismaService } from '../src/common/prisma.service';
import { CallsService } from '../src/modules/calls/calls.service';
import { EventBusService } from '../src/modules/events/event-bus.service';
import { AsteriskManagerService } from '../src/modules/calls/asterisk-manager.service';
import { TransferDetectorService } from '../src/modules/calls/transfer-detector.service';
import { RedisService } from '../src/modules/redis/redis.service';
import { REALTIME_EVENTS } from '../src/modules/realtime/realtime-events';
import { RecordingEncryptionService } from '../src/modules/recording-pipeline/recording-encryption.service';

function ReadableFromString(value: string) {
  return Readable.from([Buffer.from(value)]);
}

describe('CallsService branch filter integration', () => {
  let service: CallsService;
  const prisma = {
    asteriskDid: {
      findMany: jest.fn(),
    },
    tenantSystemSettings: {
      findUnique: jest.fn(),
    },
    attendedTransferCandidates: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    branchAgents: {
      findMany: jest.fn(),
    },
    branchQueues: {
      findMany: jest.fn(),
    },
    callSessions: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    callTransfers: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    callRecordings: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    callRecordingAccessAuditLogs: {
      create: jest.fn(),
    },
    agents: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    queueAgentMembers: {
      findFirst: jest.fn(),
    },
    queues: {
      findMany: jest.fn(),
    },
  };
  const eventBus = {
    publish: jest.fn(),
  };
  const asteriskManager = {
    originate: jest.fn(),
    originateInternal: jest.fn(),
    blindTransfer: jest.fn(),
    attendedTransfer: jest.fn(),
    cancelAttendedTransfer: jest.fn(),
    completeAttendedTransfer: jest.fn(),
    pickup: jest.fn(),
    muteAudio: jest.fn(),
    sendFeatureCode: jest.fn(),
    hangup: jest.fn(),
  };
  const transferDetector = {
    recordRequest: jest.fn(),
  };
  const redisClient = {
    mget: jest.fn(),
    set: jest.fn(),
  };
  const redis = {
    getClient: jest.fn(() => redisClient),
  };
  const recordingEncryption = {
    openDecryptedReadStream: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.asteriskDid.findMany.mockResolvedValue([]);
    prisma.queues.findMany.mockResolvedValue([]);
    prisma.agents.findMany.mockResolvedValue([]);
    prisma.agents.findFirst.mockResolvedValue({
      agentId: 'agent-1',
      agentGroupId: 'group-1',
    });
    prisma.queueAgentMembers.findFirst.mockResolvedValue({
      agentId: 'agent-1',
    });
    redisClient.mget.mockResolvedValue([]);
    redisClient.set.mockResolvedValue('OK');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CallsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: EventBusService, useValue: eventBus },
        { provide: AsteriskManagerService, useValue: asteriskManager },
        { provide: TransferDetectorService, useValue: transferDetector },
        { provide: RecordingEncryptionService, useValue: recordingEncryption },
      ],
    }).compile();

    service = module.get(CallsService);
  });

  it('getActiveCalls 는 branchId 기준 agent/queue scope 를 OR 필터로 적용한다', async () => {
    prisma.branchAgents.findMany.mockResolvedValue([{ agentId: 'agent-1' }]);
    prisma.branchQueues.findMany.mockResolvedValue([{ queueId: 'queue-1' }]);
    prisma.callSessions.findMany.mockResolvedValue([
      {
        callId: 'call-1',
        linkedid: 'L-1',
        dnis: '15771577',
        didNumber: '15771577',
        primaryAgentId: 'agent-1',
        sessionStatus: 'TALKING',
        startedAt: new Date('2026-04-16T09:00:00.000Z'),
        queuedAt: new Date('2026-04-16T08:59:30.000Z'),
        answeredAt: new Date('2026-04-16T09:00:00.000Z'),
      },
    ]);
    prisma.agents.findMany.mockResolvedValue([{ agentId: 'agent-1', agentName: '상담원1' }]);
    prisma.attendedTransferCandidates.findMany.mockResolvedValue([
      {
        linkedid: 'L-1',
        phase: 'CONSULT_RINGING',
        toExtension: '2001',
        requestedAt: new Date('2026-04-16T09:01:00.000Z'),
        completedAt: null,
        expiredAt: null,
      },
    ]);
    prisma.asteriskDid.findMany.mockResolvedValue([
      {
        did: '15771577',
        representativeNumber: '1577-1577',
      },
    ]);

    const result = await service.getActiveCalls('tenant-1', 'branch-1');

    expect(prisma.callSessions.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        sessionStatus: { not: 'ENDED' },
        OR: [
          { primaryAgentId: { in: ['agent-1'] } },
          { queueId: { in: ['queue-1'] } },
        ],
      },
      orderBy: { startedAt: 'desc' },
      take: 500,
    });
    expect(prisma.agents.findMany).toHaveBeenCalledWith({
      where: { agentId: { in: ['agent-1'] }, tenantId: 'tenant-1' },
      select: { agentId: true, agentName: true },
    });
    expect(prisma.attendedTransferCandidates.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', linkedid: { in: ['L-1'] } },
      orderBy: [{ linkedid: 'asc' }, { requestedAt: 'desc' }],
      select: {
        linkedid: true,
        phase: true,
        toExtension: true,
        requestedAt: true,
        completedAt: true,
        expiredAt: true,
      },
    });
    expect(result).toMatchObject({
      success: true,
      data: [
        {
          callId: 'call-1',
          agentName: '상담원1',
          representativeNumber: '1577-1577',
          latestTransfer: {
            phase: 'CONSULT_RINGING',
            toExtension: '2001',
          },
        },
      ],
      error: null,
    });
    expect(result.data[0].waitSeconds).toBe(30);
  });

  it('listHistory 는 missed 모드와 branch filter 를 함께 적용한다', async () => {
    prisma.branchAgents.findMany.mockResolvedValue([{ agentId: 'agent-5' }]);
    prisma.branchQueues.findMany.mockResolvedValue([{ queueId: 'queue-5' }]);
    prisma.callSessions.findMany.mockResolvedValue([]);
    prisma.attendedTransferCandidates.findMany.mockResolvedValue([]);

    await service.listHistory('tenant-1', {
      from: '2026-04-01T00:00:00.000Z',
      to: '2026-04-16T23:59:59.999Z',
      branchId: 'branch-5',
      agentId: 'agent-5',
      mode: 'missed',
    });

    expect(prisma.callSessions.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        startedAt: {
          gte: new Date('2026-04-01T00:00:00.000Z'),
          lte: new Date('2026-04-16T23:59:59.999Z'),
        },
        OR: [
          { primaryAgentId: { in: ['agent-5'] } },
          { queueId: { in: ['queue-5'] } },
        ],
        primaryAgentId: 'agent-5',
        sessionStatus: 'ENDED',
        answeredAt: null,
      },
      orderBy: { startedAt: 'desc' },
      take: 500,
      select: {
        callId: true,
        linkedid: true,
        ani: true,
        dnis: true,
        didNumber: true,
        queueName: true,
        sessionStatus: true,
        direction: true,
        resultCode: true,
        startedAt: true,
        answeredAt: true,
        endedAt: true,
        waitSeconds: true,
        talkSeconds: true,
        abandonFlag: true,
        recordingFlag: true,
        customer: { select: { customerName: true } },
        callMemos: {
          where: { isFinal: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { resultCode: true },
        },
        primaryAgent: { select: { agentName: true } },
      },
    });
  });

  it('listRecordings 는 branchId 기준 session OR 필터를 recording 조회에 적용한다', async () => {
    prisma.branchAgents.findMany.mockResolvedValue([{ agentId: 'agent-9' }]);
    prisma.branchQueues.findMany.mockResolvedValue([{ queueId: 'queue-9' }]);
    prisma.callRecordings.findMany.mockResolvedValue([
      {
        recordingId: 'rec-1',
        linkedid: 'L-1',
        fileName: 'rec-1.wav',
        fileFormat: 'wav',
        fileSizeBytes: BigInt(1024),
        durationSeconds: 45,
        recordingStartedAt: new Date('2026-04-16T10:00:00.000Z'),
        session: {
          ani: '01012345678',
          dnis: '15771577',
          didNumber: '15771577',
          queueName: 'Q1',
          primaryAgent: { agentName: '상담원9' },
        },
      },
    ]);
    prisma.asteriskDid.findMany.mockResolvedValue([
      {
        did: '15771577',
        representativeNumber: '1577-1577',
      },
    ]);

    const result = await service.listRecordings('tenant-1', {
      from: '2026-04-01T00:00:00.000Z',
      to: '2026-04-16T23:59:59.999Z',
      branchId: 'branch-9',
    });

    expect(prisma.callRecordings.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        recordingStartedAt: {
          gte: new Date('2026-04-01T00:00:00.000Z'),
          lte: new Date('2026-04-16T23:59:59.999Z'),
        },
        OR: [
          { session: { primaryAgentId: { in: ['agent-9'] } } },
          { session: { queueId: { in: ['queue-9'] } } },
        ],
      },
      orderBy: { recordingStartedAt: 'desc' },
      take: 200,
      select: {
        recordingId: true,
        linkedid: true,
        fileName: true,
        fileFormat: true,
        fileSizeBytes: true,
        durationSeconds: true,
        recordingStartedAt: true,
        session: {
          select: {
            linkedid: true,
            ani: true,
            dnis: true,
            didNumber: true,
            queueName: true,
            primaryAgent: { select: { agentName: true } },
          },
        },
      },
    });
    expect(result).toMatchObject({
      success: true,
      data: [
        {
          recordingId: 'rec-1',
          fileName: 'rec-1.wav',
          fileSizeBytes: '1024',
          session: {
            representativeNumber: '1577-1577',
          },
        },
      ],
      error: null,
    });
  });

  it('getRecordingFile 는 local 녹취 파일 메타와 재생 가능한 contentType 을 반환한다', async () => {
    prisma.callRecordings.findFirst.mockResolvedValue({
      recordingId: 'rec-local-1',
      tenantId: 'tenant-1',
      filePath: '/var/spool/asterisk/monitor/2026/rec-local-1.wav',
      fileName: 'rec-local-1.wav',
      fileFormat: 'wav',
      fileSizeBytes: BigInt(2048),
      storageProvider: 'local',
    });

    await expect(service.getRecordingFile('tenant-1', 'rec-local-1')).resolves.toMatchObject({
      recordingId: 'rec-local-1',
      tenantId: 'tenant-1',
      filePath: '/var/spool/asterisk/monitor/2026/rec-local-1.wav',
      fileName: 'rec-local-1.wav',
      fileSizeBytes: BigInt(2048),
      contentType: 'audio/wav',
    });

    expect(prisma.callRecordings.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        recordingId: 'rec-local-1',
      },
      select: {
        recordingId: true,
        tenantId: true,
        filePath: true,
        fileName: true,
        fileFormat: true,
        fileSizeBytes: true,
        storageProvider: true,
        recordingStatus: true,
        encryptionStatus: true,
        encryptedFilePath: true,
        playbackFilePath: true,
        playbackFileFormat: true,
        playbackFileSizeBytes: true,
        encryptedPlaybackFilePath: true,
        callId: true,
        linkedid: true,
      },
    });
  });

  it('getRecordingFile 는 재생용 WAV variant 를 우선 선택한다', async () => {
    prisma.callRecordings.findFirst.mockResolvedValue({
      recordingId: 'rec-stereo-1',
      tenantId: 'tenant-1',
      filePath: '/var/spool/asterisk/monitor/2026/rec-stereo-1.raw',
      fileName: 'rec-stereo-1.raw',
      fileFormat: 'raw',
      fileSizeBytes: BigInt(4096),
      storageProvider: 'local',
      encryptionStatus: 'ENCRYPTED',
      encryptedFilePath: '/var/spool/asterisk/secure/2026/rec-stereo-1.raw.enc',
      playbackFilePath: '/var/spool/asterisk/monitor/2026/rec-stereo-1.wav',
      playbackFileFormat: 'wav',
      playbackFileSizeBytes: BigInt(8192),
      encryptedPlaybackFilePath: '/var/spool/asterisk/secure/2026/rec-stereo-1.wav.enc',
      callId: 'call-1',
      linkedid: 'L-1',
    });

    await expect(service.getRecordingFile('tenant-1', 'rec-stereo-1')).resolves.toMatchObject({
      recordingId: 'rec-stereo-1',
      filePath: '/var/spool/asterisk/monitor/2026/rec-stereo-1.wav',
      fileName: 'rec-stereo-1.wav',
      fileFormat: 'wav',
      fileSizeBytes: BigInt(8192),
      encryptionStatus: 'ENCRYPTED',
      encryptedFilePath: '/var/spool/asterisk/secure/2026/rec-stereo-1.wav.enc',
      contentType: 'audio/wav',
    });
  });

  it('openRecordingReadStream 은 암호화 녹취를 버퍼가 아닌 복호화 스트림으로 연다', async () => {
    const stream = ReadableFromString('decrypted-audio');
    recordingEncryption.openDecryptedReadStream.mockResolvedValue({
      stream,
      size: 15,
    });

    const payload = await service.openRecordingReadStream({
      filePath: 'D:\\recordings\\rec.wav',
      encryptedFilePath: 'E:\\recordings-secure\\rec.wav.enc',
      encryptionStatus: 'ENCRYPTED',
    }, 'bytes=0-3');

    expect(recordingEncryption.openDecryptedReadStream).toHaveBeenCalledWith('E:\\recordings-secure\\rec.wav.enc');
    expect(payload).toMatchObject({
      stream,
      size: 15,
      statusCode: 200,
      acceptRanges: false,
    });
  });

  it('getRecordingFile 는 local 이 아닌 스토리지를 거부한다', async () => {
    prisma.callRecordings.findFirst.mockResolvedValue({
      recordingId: 'rec-s3-1',
      tenantId: 'tenant-1',
      filePath: 's3://bucket/rec-s3-1.mp3',
      fileName: 'rec-s3-1.mp3',
      fileFormat: 'mp3',
      fileSizeBytes: BigInt(1024),
      storageProvider: 's3',
    });

    await expect(service.getRecordingFile('tenant-1', 'rec-s3-1')).rejects.toThrow(
      '현재는 로컬 저장 녹취만 지원합니다.',
    );
  });

  it('recordRecordingDownloadAudit 은 다운로드 감사 로그를 남긴다', async () => {
    await service.recordRecordingDownloadAudit('tenant-1', {
      recordingId: 'rec-local-1',
      callId: 'call-1',
      linkedid: 'L-1',
    }, {
      agentId: 'agent-1',
      userRole: 'supervisor',
      clientIp: '203.0.113.10',
      userAgent: 'vitest',
    });

    expect(prisma.callRecordingAccessAuditLogs.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        recordingId: 'rec-local-1',
        callId: 'call-1',
        linkedid: 'L-1',
        agentId: 'agent-1',
        userRole: 'supervisor',
        action: 'DOWNLOAD',
        clientIp: '203.0.113.10',
        userAgent: 'vitest',
        success: true,
      },
    });
  });

  it('branchId 가 없으면 branch mapping 조회 없이 기본 범위로 history 를 조회한다', async () => {
    prisma.callSessions.findMany.mockResolvedValue([]);

    await service.listHistory('tenant-1', {
      status: 'TALKING',
    });

    expect(prisma.branchAgents.findMany).not.toHaveBeenCalled();
    expect(prisma.branchQueues.findMany).not.toHaveBeenCalled();
    expect(prisma.callSessions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          sessionStatus: 'TALKING',
        }),
      }),
    );
    expect(prisma.attendedTransferCandidates.findMany).not.toHaveBeenCalled();
  });

  it('listHistory 는 운영 리포트용 결과/큐/포기 필터를 적용한다', async () => {
    prisma.callSessions.findMany.mockResolvedValue([]);

    await service.listHistory('tenant-1', {
      resultCode: 'QUEUE_TIMEOUT',
      queueName: 'support-q',
      abandon: 'true',
      recording: 'false',
    } as any);

    expect(prisma.callSessions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          resultCode: 'QUEUE_TIMEOUT',
          queueName: 'support-q',
          abandonFlag: true,
          recordingFlag: false,
        }),
      }),
    );
  });

  it('listHistory 는 미연결 원인을 계산해 반환한다', async () => {
    prisma.callSessions.findMany.mockResolvedValue([
      {
        callId: 'call-timeout',
        linkedid: 'L-timeout',
        ani: '01011112222',
        dnis: '15771577',
        didNumber: '15771577',
        queueName: 'support-q',
        sessionStatus: 'ENDED',
        direction: 'inbound',
        resultCode: 'QUEUE_TIMEOUT',
        startedAt: new Date('2026-05-05T00:00:00.000Z'),
        answeredAt: null,
        endedAt: new Date('2026-05-05T00:01:00.000Z'),
        waitSeconds: 60,
        talkSeconds: 0,
        abandonFlag: false,
        recordingFlag: false,
        customer: null,
        callMemos: [],
        primaryAgent: null,
      },
      {
        callId: 'call-abandon',
        linkedid: 'L-abandon',
        ani: '01033334444',
        dnis: '15771577',
        didNumber: '15771577',
        queueName: 'support-q',
        sessionStatus: 'ENDED',
        direction: 'inbound',
        resultCode: null,
        startedAt: new Date('2026-05-05T00:02:00.000Z'),
        answeredAt: null,
        endedAt: new Date('2026-05-05T00:02:20.000Z'),
        waitSeconds: 20,
        talkSeconds: 0,
        abandonFlag: true,
        recordingFlag: false,
        customer: null,
        callMemos: [],
        primaryAgent: null,
      },
      {
        callId: 'call-recovery',
        linkedid: 'L-recovery',
        ani: '01055556666',
        dnis: '15771577',
        didNumber: '15771577',
        queueName: null,
        sessionStatus: 'ENDED',
        direction: 'inbound',
        resultCode: 'RECOVERY_TIMEOUT',
        startedAt: new Date('2026-05-05T00:03:00.000Z'),
        answeredAt: null,
        endedAt: new Date('2026-05-05T00:13:00.000Z'),
        waitSeconds: 0,
        talkSeconds: 0,
        abandonFlag: false,
        recordingFlag: false,
        customer: null,
        callMemos: [],
        primaryAgent: null,
      },
    ]);
    prisma.attendedTransferCandidates.findMany.mockResolvedValue([]);

    const result = await service.listHistory('tenant-1', {
      mode: 'missed',
    });

    expect(result.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ callId: 'call-timeout', missedReason: 'QUEUE_TIMEOUT' }),
        expect.objectContaining({ callId: 'call-abandon', missedReason: 'CUSTOMER_ABANDONED' }),
        expect.objectContaining({ callId: 'call-recovery', missedReason: 'SYSTEM_RECOVERY' }),
      ]),
    );
  });

  it('listHistory 는 primaryAgent 가 비어 있으면 내선 번호로 상담원을 보정한다', async () => {
    prisma.callSessions.findMany.mockResolvedValue([
      {
        callId: 'call-softphone-out',
        linkedid: 'L-softphone-out',
        ani: '1001',
        dnis: '01034623453',
        didNumber: null,
        queueName: null,
        sessionStatus: 'ENDED',
        direction: 'OUTBOUND',
        resultCode: null,
        startedAt: new Date('2026-05-07T06:50:33.000Z'),
        answeredAt: new Date('2026-05-07T06:50:39.000Z'),
        endedAt: new Date('2026-05-07T06:50:55.000Z'),
        waitSeconds: 0,
        talkSeconds: 16,
        abandonFlag: false,
        recordingFlag: false,
        customer: null,
        callMemos: [],
        primaryAgent: null,
      },
    ]);
    prisma.agents.findMany.mockResolvedValue([
      { agentId: 'agent-1001', agentName: '홍길동', extension: '1001' },
    ]);
    prisma.attendedTransferCandidates.findMany.mockResolvedValue([]);

    const result = await service.listHistory('tenant-1', {});

    expect(prisma.agents.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', extension: { in: ['1001'] } },
      select: { agentId: true, agentName: true, extension: true },
    });
    expect(result.data[0]).toMatchObject({
      callId: 'call-softphone-out',
      primaryAgent: { agentName: '홍길동' },
    });
  });

  it('listHistory 는 번호/CallType/limit 필터를 기존 branch filter 와 함께 적용한다', async () => {
    prisma.branchAgents.findMany.mockResolvedValue([{ agentId: 'agent-5' }]);
    prisma.branchQueues.findMany.mockResolvedValue([{ queueId: 'queue-5' }]);
    prisma.callSessions.findMany.mockResolvedValue([]);
    prisma.attendedTransferCandidates.findMany.mockResolvedValue([]);

    await service.listHistory('tenant-1', {
      from: '2026-04-01T00:00:00.000Z',
      to: '2026-04-16T23:59:59.999Z',
      branchId: 'branch-5',
      remoteNumber: '010-1234-5678',
      callType: 'IT',
      limit: 25,
    });

    expect(prisma.callSessions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          direction: 'inbound',
          transferFlag: true,
          AND: [
            {
              OR: [
                { primaryAgentId: { in: ['agent-5'] } },
                { queueId: { in: ['queue-5'] } },
              ],
            },
            {
              OR: [
                { ani: { contains: '010-1234-5678' } },
                { dnis: { contains: '010-1234-5678' } },
                { aniNormalized: { contains: '01012345678' } },
                { dnis: { contains: '01012345678' } },
              ],
            },
          ],
        }),
        take: 25,
      }),
    );
  });

  it('listHistory 는 상담원 내선으로 기록된 데스크톱 발신 통화를 외부 발신으로 보정한다', async () => {
    prisma.callSessions.findMany.mockResolvedValue([
      {
        callId: 'call-softphone-out',
        linkedid: 'L-softphone-out',
        ani: '1001',
        dnis: '01034623453',
        didNumber: '01034623453',
        queueName: null,
        sessionStatus: 'ENDED',
        direction: 'inbound',
        resultCode: null,
        startedAt: new Date('2026-05-07T06:50:33.000Z'),
        answeredAt: new Date('2026-05-07T06:50:39.000Z'),
        endedAt: new Date('2026-05-07T06:50:55.000Z'),
        waitSeconds: 0,
        talkSeconds: 16,
        abandonFlag: false,
        recordingFlag: false,
        customer: null,
        callMemos: [],
        primaryAgent: null,
      },
    ]);
    prisma.agents.findMany.mockResolvedValue([
      { agentId: 'agent-1001', agentName: '홍길동', extension: '1001' },
    ]);
    prisma.tenantSystemSettings.findUnique.mockResolvedValue({
      allowedOutboundCallerIds: '07052346380',
      defaultOutboundCallerId: '07052346380',
    });
    prisma.attendedTransferCandidates.findMany.mockResolvedValue([]);

    const result = await service.listHistory('tenant-1', {});

    expect(result.data[0]).toMatchObject({
      callId: 'call-softphone-out',
      direction: 'OUTBOUND',
      ani: '07052346380',
      dnis: '01034623453',
      didNumber: '07052346380',
      representativeNumber: '07052346380',
      primaryAgent: { agentName: '홍길동' },
    });
  });

  it('originate 는 기본 발신번호를 사용하고 허용 목록 밖 번호는 차단한다', async () => {
    prisma.tenantSystemSettings.findUnique.mockResolvedValue({
      allowedOutboundCallerIds: '07052346380\n07052346381',
      defaultOutboundCallerId: '07052346380',
    });
    asteriskManager.originate.mockReturnValue({ channel: 'PJSIP/1001' });

    const result = await service.originate('tenant-1', {
      agentExtension: '1001',
      phoneNumber: '01012345678',
    });

    expect(asteriskManager.originate).toHaveBeenCalledWith({
      agentExtension: '1001',
      phoneNumber: '01012345678',
      callerId: '07052346380',
    });
    expect(result.data).toMatchObject({
      accepted: true,
      channel: 'PJSIP/1001',
    });
  });

  it('getOutboundDialOptions 는 허용 발신번호 목록과 기본 발신번호를 반환한다', async () => {
    prisma.tenantSystemSettings.findUnique.mockResolvedValue({
      allowedOutboundCallerIds: '07052346380\n07052346381',
      defaultOutboundCallerId: '07052346381',
    });

    const result = await service.getOutboundDialOptions('tenant-1');

    expect(result).toEqual({
      allowedCallerIds: ['07052346380', '07052346381'],
      defaultCallerId: '07052346381',
    });
  });

  it('getCallControlCapabilities 는 현재 제공 불가능한 제어 기능의 이유를 노출한다', () => {
    const result = service.getCallControlCapabilities();

    expect(result).toEqual(expect.objectContaining({
      answerEnabled: true,
      answerMode: 'pickup_redirect',
      consultationTransferEnabled: true,
      dndEnabled: true,
      dndMode: 'queue_pause',
      singleStepConferenceEnabled: false,
      extensionForwardingEnabled: false,
    }));
    expect(result.singleStepConferenceUnavailableReason).toContain('3자 회의');
    expect(result.extensionForwardingUnavailableReason).toContain('DID 인입 라우팅');
  });

  it('originate 는 허용되지 않은 발신번호를 거부한다', async () => {
    prisma.tenantSystemSettings.findUnique.mockResolvedValue({
      allowedOutboundCallerIds: '07052346380',
      defaultOutboundCallerId: '07052346380',
    });

    await expect(
      service.originate('tenant-1', {
        agentExtension: '1001',
        phoneNumber: '01012345678',
        callerId: '07052349999',
      }),
    ).rejects.toThrow('허용되지 않은 발신번호입니다.');
  });

  it('originate 는 해외 발신과 060 유료 번호 발신을 거부하고 대표번호는 허용한다', async () => {
    prisma.tenantSystemSettings.findUnique.mockResolvedValue({
      allowedOutboundCallerIds: '07052346380',
      defaultOutboundCallerId: '07052346380',
    });
    asteriskManager.originate.mockReturnValue({ channel: 'PJSIP/1001' });

    await expect(
      service.originate('tenant-1', {
        agentExtension: '1001',
        phoneNumber: '00181312345678',
      }),
    ).rejects.toThrow('해외 발신은 차단되어 있습니다.');

    await expect(
      service.originate('tenant-1', {
        agentExtension: '1001',
        phoneNumber: '0601234567',
      }),
    ).rejects.toThrow('유료 번호 발신은 차단되어 있습니다.');

    const result = await service.originate('tenant-1', {
      agentExtension: '1001',
      phoneNumber: '1577-1577',
    });

    expect(asteriskManager.originate).toHaveBeenCalledTimes(1);
    expect(asteriskManager.originate).toHaveBeenCalledWith({
      agentExtension: '1001',
      phoneNumber: '15771577',
      callerId: '07052346380',
    });
    expect(result.data).toMatchObject({ accepted: true, channel: 'PJSIP/1001' });
  });

  it('originate 는 상담원 세부 권한에 따라 대표번호와 060 유료 발신을 제어한다', async () => {
    prisma.agents.findFirst.mockResolvedValueOnce({
      agentId: 'agent-1',
      extension: '1001',
      role: 'agent',
      settingsProfile: {
        outboundDialPermissions: {
          phoneDirect: false,
          domestic: true,
          representative: false,
          paid: false,
          international: false,
        },
      },
    });

    await expect(
      service.originate(
        'tenant-1',
        {
          agentExtension: '1001',
          phoneNumber: '15771577',
        },
        undefined,
        {
          agentId: 'agent-1',
          extension: '1001',
          role: 'agent',
        },
      ),
    ).rejects.toThrow('대표번호 발신 권한이 없습니다.');

    prisma.agents.findFirst.mockResolvedValueOnce({
      agentId: 'agent-1',
      extension: '1001',
      role: 'agent',
      settingsProfile: {
        outboundDialPermissions: {
          phoneDirect: false,
          domestic: true,
          representative: true,
          paid: true,
          international: false,
        },
      },
    });
    prisma.tenantSystemSettings.findUnique.mockResolvedValue({
      allowedOutboundCallerIds: '07052346380',
      defaultOutboundCallerId: '07052346380',
    });
    asteriskManager.originate.mockReturnValue({ channel: 'PJSIP/1001' });

    await service.originate(
      'tenant-1',
      {
        agentExtension: '1001',
        phoneNumber: '0601234567',
      },
      undefined,
      {
        agentId: 'agent-1',
        extension: '1001',
        role: 'agent',
      },
    );

    expect(asteriskManager.originate).toHaveBeenCalledWith({
      agentExtension: '1001',
      phoneNumber: '0601234567',
      callerId: '07052346380',
    });
  });

  it('originate 는 일반 상담원이 다른 내선을 가장한 발신 요청을 보내면 거부한다', async () => {
    prisma.agents.findFirst.mockResolvedValue({
      agentId: 'agent-1',
      extension: '1001',
      role: 'agent',
    });

    await expect(
      service.originate(
        'tenant-1',
        {
          agentExtension: '2001',
          phoneNumber: '01012345678',
        },
        undefined,
        {
          agentId: 'agent-1',
          extension: '1001',
          role: 'agent',
        },
      ),
    ).rejects.toThrow('본인 내선으로만 발신할 수 있습니다.');

    expect(asteriskManager.originate).not.toHaveBeenCalled();
  });

  it('originateInternal 은 현재 상담원 내선에서 대상 상담원에게 click-to-call 을 요청한다', async () => {
    prisma.agents.findFirst.mockResolvedValue({
      agentId: 'agent-2',
      agentName: '상담원2',
      extension: '1002',
    });
    asteriskManager.originateInternal.mockReturnValue({ channel: 'PJSIP/1001' });

    const result = await service.originateInternal('tenant-1', {
      agentId: 'agent-1',
      agentExtension: '1001',
      targetExtension: '1002',
      targetAgentId: 'agent-2',
    });

    expect(prisma.agents.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        extension: '1002',
        agentId: 'agent-2',
        isActive: true,
      },
      select: {
        agentId: true,
        agentName: true,
        extension: true,
      },
    });
    expect(asteriskManager.originateInternal).toHaveBeenCalledWith({
      agentExtension: '1001',
      targetExtension: '1002',
    });
    expect(eventBus.publish).toHaveBeenCalledWith(
      'ami.command.originate.internal.requested',
      expect.objectContaining({
        requestedByAgentId: 'agent-1',
        requestedByExtension: '1001',
        targetAgentId: 'agent-2',
        targetExtension: '1002',
      }),
      'tenant-1',
    );
    expect(result).toMatchObject({
      success: true,
      data: {
        accepted: true,
        channel: 'PJSIP/1001',
        targetAgent: {
          agentId: 'agent-2',
          extension: '1002',
        },
      },
      error: null,
    });
  });

  it('attended transfer 요청은 REQUESTED candidate 를 기록하고 상담원 leg 로 AMI transfer 를 요청한다', async () => {
    prisma.callSessions.findFirst.mockResolvedValue({
      callId: 'call-1',
      tenantId: 'tenant-1',
      linkedid: 'L-100',
      primaryAgentId: 'agent-1',
      callLegs: [
        {
          legType: 'agent',
          endedAt: null,
          channelName: 'PJSIP/1001-00000010',
        },
      ],
    });
    prisma.callTransfers.create.mockResolvedValue({ transferId: 'transfer-1' });
    prisma.callSessions.update.mockResolvedValue({
      callId: 'call-1',
      tenantId: 'tenant-1',
      linkedid: 'L-100',
      sessionStatus: 'TRANSFERRING',
    });

    const result = await service.transfer('tenant-1', 'call-1', {
      transferType: 'attended',
      target: '2001',
      fromExtension: '1001',
    });

    expect(prisma.callTransfers.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        callId: 'call-1',
        linkedid: 'L-100',
        transferType: 'attended',
        fromExtension: '1001',
        toExtension: '2001',
        transferResult: 'REQUESTED',
        requestedAt: expect.any(Date),
      }),
    });
    expect(transferDetector.recordRequest).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      linkedid: 'L-100',
      fromAgentId: 'agent-1',
      fromExtension: '1001',
      toExtension: '2001',
    });
    expect(asteriskManager.attendedTransfer).toHaveBeenCalledWith(
      'PJSIP/1001-00000010',
      '2001',
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      REALTIME_EVENTS.CALL_UPDATED,
      expect.objectContaining({
        callId: 'call-1',
        tenantId: 'tenant-1',
        linkedid: 'L-100',
        sessionStatus: 'TRANSFERRING',
      }),
      'tenant-1',
    );
    expect(result).toMatchObject({
      success: true,
      data: { callId: 'call-1', transferred: true },
      error: null,
    });
    expect(prisma.callTransfers.create.mock.calls[0][0].data.requestedAt.toISOString()).toBe(
      result.data.requestedAt,
    );
  });

  it('transfer 는 클라이언트가 보낸 fromExtension 대신 실제 agent leg 내선을 기록한다', async () => {
    prisma.agents.findFirst.mockResolvedValue({
      agentId: 'agent-1',
      extension: '1001',
      role: 'agent',
    });
    prisma.callSessions.findFirst.mockResolvedValue({
      callId: 'call-spoof-1',
      tenantId: 'tenant-1',
      linkedid: 'L-spoof-1',
      primaryAgentId: 'agent-1',
      callLegs: [
        {
          legType: 'agent',
          endedAt: null,
          channelName: 'PJSIP/1001-00000abc',
        },
      ],
    });
    prisma.callTransfers.create.mockResolvedValue({ transferId: 'transfer-spoof-1' });
    prisma.callSessions.update.mockResolvedValue({
      callId: 'call-spoof-1',
      tenantId: 'tenant-1',
      linkedid: 'L-spoof-1',
      sessionStatus: 'TRANSFERRING',
    });

    await service.transfer(
      'tenant-1',
      'call-spoof-1',
      {
        transferType: 'blind',
        target: '2001',
        fromExtension: '9999',
      },
      undefined,
      {
        agentId: 'agent-1',
        extension: '1001',
        role: 'agent',
      },
    );

    expect(prisma.callTransfers.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fromExtension: '1001',
        toExtension: '2001',
      }),
    });
    expect(eventBus.publish).toHaveBeenCalledWith(
      'ami.command.transfer.requested',
      expect.objectContaining({
        fromExtension: '1001',
        target: '2001',
      }),
      'tenant-1',
    );
  });

  it('transfer 는 해외/유료 번호 대상 전환을 AMI 전송 전에 거부한다', async () => {
    prisma.callSessions.findFirst.mockResolvedValue({
      callId: 'call-paid-transfer-1',
      tenantId: 'tenant-1',
      linkedid: 'L-paid-transfer-1',
      primaryAgentId: 'agent-1',
      callLegs: [
        {
          legType: 'agent',
          endedAt: null,
          channelName: 'PJSIP/1001-00000abc',
        },
      ],
    });

    await expect(
      service.transfer('tenant-1', 'call-paid-transfer-1', {
        transferType: 'blind',
        target: '0601234567',
        fromExtension: '1001',
      }),
    ).rejects.toThrow('유료 번호 발신은 차단되어 있습니다.');

    expect(prisma.callTransfers.create).not.toHaveBeenCalled();
    expect(asteriskManager.blindTransfer).not.toHaveBeenCalled();
  });

  it('hangup 은 일반 상담원이 다른 상담원의 통화를 제어하려 하면 거부한다', async () => {
    prisma.agents.findFirst.mockResolvedValue({
      agentId: 'agent-1',
      extension: '1001',
      role: 'agent',
    });
    prisma.callSessions.findFirst.mockResolvedValue({
      callId: 'call-deny-1',
      tenantId: 'tenant-1',
      linkedid: 'L-deny-1',
      primaryAgentId: 'agent-2',
      callLegs: [
        {
          legType: 'agent',
          endedAt: null,
          channelName: 'PJSIP/2002-00000def',
        },
      ],
    });

    await expect(
      service.hangup(
        'tenant-1',
        'call-deny-1',
        undefined,
        {
          agentId: 'agent-1',
          extension: '1001',
          role: 'agent',
        },
      ),
    ).rejects.toThrow('본인에게 배정된 통화만 제어할 수 있습니다.');

    expect(asteriskManager.hangup).not.toHaveBeenCalled();
  });

  it('blind transfer 요청은 REQUESTED candidate 를 만들지 않는다', async () => {
    prisma.callSessions.findFirst.mockResolvedValue({
      callId: 'call-2',
      tenantId: 'tenant-1',
      linkedid: 'L-200',
      primaryAgentId: 'agent-2',
      callLegs: [
        {
          legType: 'agent',
          endedAt: null,
          channelName: 'PJSIP/2001-00000011',
        },
      ],
    });
    prisma.callTransfers.create.mockResolvedValue({ transferId: 'transfer-2' });
    prisma.callSessions.update.mockResolvedValue({ callId: 'call-2' });

    await service.transfer('tenant-1', 'call-2', {
      transferType: 'blind',
      target: '3001',
      fromExtension: '2001',
    });

    expect(transferDetector.recordRequest).not.toHaveBeenCalled();
    expect(asteriskManager.blindTransfer).toHaveBeenCalledWith(
      'PJSIP/2001-00000011',
      '3001',
    );
  });

  it('attended transfer 취소는 열린 candidate 를 닫고 CancelAtxfer 를 요청한다', async () => {
    prisma.callSessions.findFirst.mockResolvedValue({
      callId: 'call-9',
      tenantId: 'tenant-1',
      linkedid: 'L-900',
      answeredAt: new Date('2026-04-18T01:00:00.000Z'),
      callLegs: [
        {
          legType: 'agent',
          endedAt: null,
          channelName: 'PJSIP/1001-00000090',
        },
      ],
    });
    prisma.attendedTransferCandidates.findFirst.mockResolvedValue({
      candidateId: 'candidate-9',
      tenantId: 'tenant-1',
      linkedid: 'L-900',
      phase: 'CONSULT_TALKING',
      requestedAt: new Date('2026-04-18T01:01:00.000Z'),
    });
    prisma.callTransfers.findFirst.mockResolvedValue({
      transferId: 'transfer-9',
      requestedAt: new Date('2026-04-18T01:01:00.000Z'),
    });
    prisma.attendedTransferCandidates.update.mockResolvedValue({ candidateId: 'candidate-9' });
    prisma.callTransfers.update.mockResolvedValue({ transferId: 'transfer-9' });
    prisma.callSessions.update.mockResolvedValue({ callId: 'call-9', sessionStatus: 'TALKING' });

    const result = await service.cancelAttendedTransfer('tenant-1', 'call-9');

    expect(prisma.attendedTransferCandidates.update).toHaveBeenCalledWith({
      where: { candidateId: 'candidate-9' },
      data: expect.objectContaining({
        phase: 'FAILED',
        completedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    });
    expect(prisma.callTransfers.update).toHaveBeenCalledWith({
      where: { transferId: 'transfer-9' },
      data: {
        transferResult: 'CANCELED',
        completedAt: expect.any(Date),
      },
    });
    expect(prisma.callSessions.update).toHaveBeenCalledWith({
      where: { callId: 'call-9' },
      data: expect.objectContaining({
        sessionStatus: 'TALKING',
        updatedAt: expect.any(Date),
      }),
    });
    expect(asteriskManager.cancelAttendedTransfer).toHaveBeenCalledWith('PJSIP/1001-00000090');
    expect(result).toMatchObject({
      success: true,
      data: { callId: 'call-9', canceled: true },
      error: null,
    });
  });

  it('attended transfer 완료는 제어 채널에 기능 코드를 주입하고 AttendedTransfer 이벤트를 기다린다', async () => {
    prisma.callSessions.findFirst.mockResolvedValue({
      callId: 'call-10',
      tenantId: 'tenant-1',
      linkedid: 'L-1000',
      callLegs: [
        {
          legType: 'agent',
          endedAt: null,
          channelName: 'PJSIP/1001-00000100',
        },
      ],
    });
    prisma.attendedTransferCandidates.findFirst.mockResolvedValue({
      candidateId: 'candidate-10',
      tenantId: 'tenant-1',
      linkedid: 'L-1000',
      phase: 'CONSULT_TALKING',
      requestedAt: new Date('2026-04-18T02:00:00.000Z'),
    });
    prisma.callSessions.update.mockResolvedValue({ callId: 'call-10', sessionStatus: 'TRANSFERRING' });

    const result = await service.completeAttendedTransfer('tenant-1', 'call-10');

    expect(prisma.callSessions.update).toHaveBeenCalledWith({
      where: { callId: 'call-10' },
      data: expect.objectContaining({
        sessionStatus: 'TRANSFERRING',
        updatedAt: expect.any(Date),
      }),
    });
    expect(asteriskManager.completeAttendedTransfer).toHaveBeenCalledWith('PJSIP/1001-00000100');
    expect(eventBus.publish).toHaveBeenCalledWith(
      'ami.command.transfer.complete.requested',
      expect.objectContaining({
        callId: 'call-10',
        linkedid: 'L-1000',
        candidateId: 'candidate-10',
      }),
      'tenant-1',
    );
    expect(result).toMatchObject({
      success: true,
      data: { callId: 'call-10', accepted: true },
      error: null,
    });
  });

  it('pickup 은 queued call 의 고객 leg 를 현재 상담원 내선으로 redirect 한다', async () => {
    prisma.callSessions.findFirst.mockResolvedValue({
      callId: 'call-3',
      tenantId: 'tenant-1',
      linkedid: 'L-300',
      sessionStatus: 'QUEUED',
      queueName: 'sales',
      ringingAt: null,
      callLegs: [
        {
          legType: 'inbound',
          endedAt: null,
          channelName: 'PJSIP/trunk-provider-00000020',
        },
      ],
    });
    prisma.callSessions.update.mockResolvedValue({ callId: 'call-3' });

    const result = await service.pickup('tenant-1', 'call-3', {
      agentId: 'agent-3',
      extension: '1003',
    });

    expect(prisma.callSessions.update).toHaveBeenCalledWith({
      where: { callId: 'call-3' },
      data: {
        primaryAgentId: 'agent-3',
        sessionStatus: 'RINGING_AGENT',
        ringingAt: expect.any(Date),
        updatedAt: expect.any(Date),
      },
    });
    expect(prisma.queueAgentMembers.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        agentId: 'agent-3',
        isActive: true,
        queue: { tenantId: 'tenant-1', queueName: 'sales', isActive: true },
      },
      select: { agentId: true },
    });
    expect(asteriskManager.pickup).toHaveBeenCalledWith(
      'PJSIP/trunk-provider-00000020',
      '1003',
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      'ami.command.pickup.requested',
      expect.objectContaining({
        callId: 'call-3',
        linkedid: 'L-300',
        agentId: 'agent-3',
        extension: '1003',
      }),
      'tenant-1',
    );
    expect(result).toMatchObject({
      success: true,
      data: {
        callId: 'call-3',
        accepted: true,
        extension: '1003',
      },
      error: null,
    });
  });

  it('pickup 은 헤더가 없을 때도 correlationId 를 자동 생성한다', async () => {
    prisma.callSessions.findFirst.mockResolvedValue({
      callId: 'call-pickup-1',
      tenantId: 'tenant-1',
      linkedid: 'L-pickup-1',
      sessionStatus: 'QUEUED',
      queueName: 'sales',
      ringingAt: null,
      callLegs: [
        {
          legType: 'inbound',
          endedAt: null,
          channelName: 'PJSIP/trunk-provider-00000020',
        },
      ],
    });
    prisma.callSessions.update.mockResolvedValue({ callId: 'call-pickup-1' });

    const result = await service.pickup('tenant-1', 'call-pickup-1', {
      agentId: 'agent-1',
      extension: '1001',
    });

    expect(result.data.accepted).toBe(true);
    expect(typeof result.data.correlationId).toBe('string');
    expect(result.data.correlationId.length).toBeGreaterThan(10);
  });

  // 요구사항: "당겨받기 기능> 키버튼 누름> 2초이내 1회만 인정"
  // (docs/reference/IPPBX_개발시 참조용_20260104/1_비씨앤 IP PBX 초안_20260104.xlsx `주요연동` 시트)
  describe('pickup 중복 억제', () => {
    const queuedCall = (callId: string) => ({
      callId,
      tenantId: 'tenant-1',
      linkedid: `L-${callId}`,
      sessionStatus: 'QUEUED',
      queueName: 'sales',
      ringingAt: null,
      callLegs: [
        { legType: 'inbound', endedAt: null, channelName: 'PJSIP/trunk-provider-00000030' },
      ],
    });

    it('같은 상담원이 억제 창 안에서 다시 눌러도 1회만 인정한다', async () => {
      prisma.callSessions.findFirst.mockResolvedValue(queuedCall('call-debounce-1'));
      prisma.callSessions.update.mockResolvedValue({ callId: 'call-debounce-1' });

      redisClient.set.mockResolvedValue('OK');
      const first = await service.pickup('tenant-1', 'call-debounce-1', {
        agentId: 'agent-1',
        extension: '1001',
      });
      expect(first.data.accepted).toBe(true);
      expect(asteriskManager.pickup).toHaveBeenCalledTimes(1);

      // 두 번째 키 입력: Redis 선점 실패 = 억제 창이 아직 열려 있다
      redisClient.set.mockResolvedValue(null);
      await expect(
        service.pickup('tenant-1', 'call-debounce-1', { agentId: 'agent-1', extension: '1001' }),
      ).rejects.toThrow('당겨받기');

      // AMI 로 두 번 나가지 않는다
      expect(asteriskManager.pickup).toHaveBeenCalledTimes(1);
      expect(prisma.callSessions.update).toHaveBeenCalledTimes(1);
    });

    it('억제 키는 상담원 단위이고 2초 TTL 로 선점한다', async () => {
      prisma.callSessions.findFirst.mockResolvedValue(queuedCall('call-debounce-2'));
      prisma.callSessions.update.mockResolvedValue({ callId: 'call-debounce-2' });
      redisClient.set.mockResolvedValue('OK');

      await service.pickup('tenant-1', 'call-debounce-2', {
        agentId: 'agent-1',
        extension: '1001',
      });

      expect(redisClient.set).toHaveBeenCalledWith(
        'kaster:cti:pickup:debounce:tenant-1:agent-1',
        '1',
        'PX',
        2000,
        'NX',
      );
    });

    it('검증을 통과하지 못한 요청은 억제 창을 소모하지 않는다', async () => {
      // 통화 상태가 당겨받기 대상이 아니면 Redis 선점 자체를 하지 않는다.
      // 그래야 실패한 시도 때문에 다음 정상 시도가 막히지 않는다.
      prisma.callSessions.findFirst.mockResolvedValue({
        ...queuedCall('call-debounce-3'),
        sessionStatus: 'TALKING',
      });

      await expect(
        service.pickup('tenant-1', 'call-debounce-3', { agentId: 'agent-1', extension: '1001' }),
      ).rejects.toThrow('현재 상태에서는 당겨받기를 요청할 수 없습니다.');

      expect(redisClient.set).not.toHaveBeenCalled();
    });
  });

  it('answer 는 현재 구성의 pickup redirect 경로를 사용한다', async () => {
    prisma.callSessions.findFirst.mockResolvedValue({
      callId: 'call-answer-1',
      tenantId: 'tenant-1',
      linkedid: 'L-answer-1',
      sessionStatus: 'RINGING_AGENT',
      queueName: 'sales',
      primaryAgentId: 'agent-3',
      ringingAt: new Date('2026-04-16T09:00:00.000Z'),
      callLegs: [
        {
          legType: 'customer',
          endedAt: null,
          channelName: 'PJSIP/trunk-provider-00000030',
        },
      ],
    });
    prisma.callSessions.update.mockResolvedValue({ callId: 'call-answer-1' });

    const result = await service.answer('tenant-1', 'call-answer-1', {
      agentId: 'agent-3',
      extension: '1003',
    });

    expect(asteriskManager.pickup).toHaveBeenCalledWith(
      'PJSIP/trunk-provider-00000030',
      '1003',
    );
    expect(result).toMatchObject({
      success: true,
      data: {
        callId: 'call-answer-1',
        accepted: true,
        extension: '1003',
      },
      error: null,
    });
  });

  it('pickup 은 같은 상담원 그룹 또는 같은 분배룰이 아니면 거부한다', async () => {
    prisma.callSessions.findFirst.mockResolvedValue({
      callId: 'call-pickup-deny-1',
      tenantId: 'tenant-1',
      linkedid: 'L-pickup-deny-1',
      sessionStatus: 'RINGING_AGENT',
      queueName: 'sales',
      primaryAgentId: 'agent-target',
      ringingAt: new Date('2026-05-20T09:00:00.000Z'),
      callLegs: [
        {
          legType: 'inbound',
          endedAt: null,
          channelName: 'PJSIP/trunk-provider-00000020',
        },
      ],
    });
    prisma.agents.findFirst
      .mockResolvedValueOnce({ agentId: 'agent-requester', agentGroupId: 'group-other' })
      .mockResolvedValueOnce({ agentId: 'agent-target', agentGroupId: 'group-target' });
    prisma.queueAgentMembers.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.pickup('tenant-1', 'call-pickup-deny-1', {
        agentId: 'agent-requester',
        extension: '1009',
      }),
    ).rejects.toThrow('같은 상담원 그룹 또는 같은 호 분배룰 소속 상담원만 당겨받을 수 있습니다.');

    expect(prisma.callSessions.update).not.toHaveBeenCalled();
    expect(asteriskManager.pickup).not.toHaveBeenCalled();
  });

  it('mute 는 활성 agent leg 에 MuteAudio 를 요청한다', async () => {
    prisma.callSessions.findFirst.mockResolvedValue({
      callId: 'call-mute-1',
      tenantId: 'tenant-1',
      linkedid: 'L-mute-1',
      callLegs: [
        {
          legType: 'agent',
          endedAt: null,
          channelName: 'PJSIP/1001-00000abc',
        },
      ],
    });

    const result = await service.mute('tenant-1', 'call-mute-1', {
      state: 'on',
      direction: 'all',
    });

    expect(asteriskManager.muteAudio).toHaveBeenCalledWith(
      'PJSIP/1001-00000abc',
      'on',
      'all',
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      'ami.command.mute.requested',
      expect.objectContaining({
        callId: 'call-mute-1',
        linkedid: 'L-mute-1',
        state: 'on',
        direction: 'all',
      }),
      'tenant-1',
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      REALTIME_EVENTS.CALL_UPDATED,
      expect.objectContaining({
        callId: 'call-mute-1',
        tenantId: 'tenant-1',
        linkedid: 'L-mute-1',
        isMuted: true,
      }),
      'tenant-1',
    );
    expect(result).toMatchObject({
      success: true,
      data: {
        callId: 'call-mute-1',
        accepted: true,
        state: 'on',
        direction: 'all',
      },
      error: null,
    });
  });

  it('mute 는 correlationId 와 idempotencyKey 를 응답과 이벤트에 포함한다', async () => {
    prisma.callSessions.findFirst.mockResolvedValue({
      callId: 'call-meta-1',
      tenantId: 'tenant-1',
      linkedid: 'L-meta-1',
      callLegs: [
        {
          legType: 'agent',
          endedAt: null,
          channelName: 'PJSIP/1001-00000meta',
        },
      ],
    });

    const result = await service.mute(
      'tenant-1',
      'call-meta-1',
      { state: 'on', direction: 'all' },
      { correlationId: 'corr-123', idempotencyKey: 'idem-123' },
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        callId: 'call-meta-1',
        accepted: true,
        correlationId: 'corr-123',
        idempotencyKey: 'idem-123',
      },
      error: null,
    });
    expect(eventBus.publish).toHaveBeenCalledWith(
      'ami.command.mute.requested',
      expect.objectContaining({
        callId: 'call-meta-1',
        linkedid: 'L-meta-1',
        correlationId: 'corr-123',
        idempotencyKey: 'idem-123',
      }),
      'tenant-1',
    );
  });

  it('hold 는 feature code 가 설정된 경우 agent leg 에 DTMF 요청을 보낸다', async () => {
    process.env.ASTERISK_HOLD_FEATURE_CODE = '*55';
    prisma.callSessions.findFirst.mockResolvedValue({
      callId: 'call-hold-1',
      tenantId: 'tenant-1',
      linkedid: 'L-hold-1',
      callLegs: [
        {
          legType: 'agent',
          endedAt: null,
          channelName: 'PJSIP/1001-00000hold',
        },
      ],
    });

    const result = await service.hold('tenant-1', 'call-hold-1', 'hold');

    expect(asteriskManager.sendFeatureCode).toHaveBeenCalledWith(
      'PJSIP/1001-00000hold',
      '*55',
    );
    expect(result).toMatchObject({
      success: true,
      data: {
        callId: 'call-hold-1',
        accepted: true,
        action: 'hold',
      },
      error: null,
    });
    delete process.env.ASTERISK_HOLD_FEATURE_CODE;
  });
});
