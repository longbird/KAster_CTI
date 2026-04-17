import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/common/prisma.service';
import { TransferDetectorService } from '../src/modules/calls/transfer-detector.service';
import { AmiLeaderElectionService } from '../src/modules/redis/ami-leader-election.service';

describe('TransferDetectorService integration', () => {
  let service: TransferDetectorService;
  const prisma = {
    attendedTransferCandidates: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    callTransfers: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  const leader = {
    isLeader: jest.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransferDetectorService,
        { provide: PrismaService, useValue: prisma },
        { provide: AmiLeaderElectionService, useValue: leader },
      ],
    }).compile();

    service = module.get(TransferDetectorService);
  });

  it('attended transfer 요청은 REQUESTED candidate 로 기록한다', async () => {
    prisma.attendedTransferCandidates.create.mockResolvedValue({
      candidateId: 'candidate-1',
    });

    await service.recordRequest({
      tenantId: 'tenant-1',
      linkedid: 'L-100',
      fromAgentId: 'agent-1',
      fromExtension: '1001',
      toExtension: '2001',
    });

    expect(prisma.attendedTransferCandidates.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        linkedid: 'L-100',
        fromAgentId: 'agent-1',
        fromExtension: '1001',
        toExtension: '2001',
        phase: 'REQUESTED',
      }),
    });
  });

  it('AttendedTransfer 이벤트는 가장 최근 REQUESTED candidate 와 pending callTransfer 를 완료 처리한다', async () => {
    prisma.attendedTransferCandidates.findFirst.mockResolvedValue({
      candidateId: 'candidate-1',
      consultUniqueid: null,
      targetUniqueid: null,
    });
    prisma.callTransfers.findFirst.mockResolvedValue({
      transferId: 'transfer-1',
    });

    await service.handle({
      eventName: 'AttendedTransfer',
      tenantId: 'tenant-1',
      linkedid: 'L-100',
      uniqueid: 'U-100',
      raw: {
        OrigTransfererCallerIDNum: '1001',
        Extension: '2001',
        SecondTransfererUniqueid: 'U-consult',
        OrigTransfererUniqueid: 'U-target',
      },
    });

    expect(prisma.attendedTransferCandidates.update).toHaveBeenCalledWith({
      where: { candidateId: 'candidate-1' },
      data: expect.objectContaining({
        phase: 'COMPLETED',
        consultUniqueid: 'U-consult',
        targetUniqueid: 'U-target',
      }),
    });
    expect(prisma.callTransfers.update).toHaveBeenCalledWith({
      where: { transferId: 'transfer-1' },
      data: expect.objectContaining({
        transferResult: 'COMPLETED',
      }),
    });
  });

  it('DialBegin 은 consult 대상 내선이 보이면 CONSULT_RINGING 으로 올린다', async () => {
    prisma.attendedTransferCandidates.findFirst.mockResolvedValue({
      candidateId: 'candidate-2',
      toExtension: '2001',
      consultUniqueid: null,
      targetUniqueid: null,
      phase: 'REQUESTED',
    });

    await service.handle({
      eventName: 'DialBegin',
      tenantId: 'tenant-1',
      linkedid: 'L-200',
      uniqueid: 'U-200',
      raw: {
        DialString: 'PJSIP/2001',
        DestUniqueid: 'U-consult-200',
      },
    });

    expect(prisma.attendedTransferCandidates.update).toHaveBeenCalledWith({
      where: { candidateId: 'candidate-2' },
      data: expect.objectContaining({
        phase: 'CONSULT_RINGING',
        consultUniqueid: 'U-consult-200',
      }),
    });
  });

  it('BridgeEnter 는 consult leg 가 잡히면 CONSULT_TALKING 으로 올린다', async () => {
    prisma.attendedTransferCandidates.findFirst.mockResolvedValue({
      candidateId: 'candidate-3',
      toExtension: '2001',
      consultUniqueid: 'U-consult-300',
      targetUniqueid: null,
      phase: 'CONSULT_RINGING',
    });

    await service.handle({
      eventName: 'BridgeEnter',
      tenantId: 'tenant-1',
      linkedid: 'L-300',
      uniqueid: 'U-300',
      raw: {
        Uniqueid: 'U-consult-300',
        Channel: 'PJSIP/2001-00000030',
      },
    });

    expect(prisma.attendedTransferCandidates.update).toHaveBeenCalledWith({
      where: { candidateId: 'candidate-3' },
      data: expect.objectContaining({
        phase: 'CONSULT_TALKING',
      }),
    });
  });

  it('BridgeLeave 는 consult talking 상태에서 REBRIDGING 으로 올린다', async () => {
    prisma.attendedTransferCandidates.findFirst.mockResolvedValue({
      candidateId: 'candidate-4',
      toExtension: '2001',
      consultUniqueid: 'U-consult-400',
      targetUniqueid: null,
      phase: 'CONSULT_TALKING',
    });

    await service.handle({
      eventName: 'BridgeLeave',
      tenantId: 'tenant-1',
      linkedid: 'L-400',
      uniqueid: 'U-400',
      raw: {
        Uniqueid: 'U-consult-400',
      },
    });

    expect(prisma.attendedTransferCandidates.update).toHaveBeenCalledWith({
      where: { candidateId: 'candidate-4' },
      data: expect.objectContaining({
        phase: 'REBRIDGING',
      }),
    });
  });

  it('DialEnd 실패 상태는 attended transfer 를 FAILED 로 마감한다', async () => {
    prisma.attendedTransferCandidates.findFirst.mockResolvedValue({
      candidateId: 'candidate-5',
      toExtension: '2001',
      consultUniqueid: 'U-consult-500',
      targetUniqueid: null,
      phase: 'CONSULT_RINGING',
    });
    prisma.callTransfers.findFirst.mockResolvedValue({
      transferId: 'transfer-5',
    });

    await service.handle({
      eventName: 'DialEnd',
      tenantId: 'tenant-1',
      linkedid: 'L-500',
      uniqueid: 'U-500',
      raw: {
        DialStatus: 'BUSY',
        Uniqueid: 'U-consult-500',
      },
    });

    expect(prisma.attendedTransferCandidates.update).toHaveBeenCalledWith({
      where: { candidateId: 'candidate-5' },
      data: expect.objectContaining({
        phase: 'FAILED',
      }),
    });
    expect(prisma.callTransfers.update).toHaveBeenCalledWith({
      where: { transferId: 'transfer-5' },
      data: expect.objectContaining({
        transferResult: 'FAILED',
      }),
    });
  });

  it('consult 실패 직후 원 상담원 브리지가 다시 잡히면 REBRIDGING 으로 올린다', async () => {
    prisma.attendedTransferCandidates.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        candidateId: 'candidate-6',
        fromExtension: '1001',
        toExtension: '2001',
        consultUniqueid: 'U-consult-600',
        targetUniqueid: 'U-agent-600',
        phase: 'FAILED',
      });

    await service.handle({
      eventName: 'BridgeEnter',
      tenantId: 'tenant-1',
      linkedid: 'L-600',
      uniqueid: 'U-600',
      raw: {
        Channel: 'PJSIP/1001-00000060',
        Uniqueid: 'U-agent-600',
      },
    });

    expect(prisma.attendedTransferCandidates.update).toHaveBeenCalledWith({
      where: { candidateId: 'candidate-6' },
      data: expect.objectContaining({
        phase: 'REBRIDGING',
      }),
    });
  });

  it('DialEnd ANSWER 는 실패로 보지 않는다', async () => {
    await service.handle({
      eventName: 'DialEnd',
      tenantId: 'tenant-1',
      linkedid: 'L-700',
      raw: {
        DialStatus: 'ANSWER',
        Uniqueid: 'U-700',
      },
    });

    expect(prisma.attendedTransferCandidates.findFirst).not.toHaveBeenCalled();
    expect(prisma.callTransfers.findFirst).not.toHaveBeenCalled();
  });

  it('REQUESTED transfer 가 오래 남아 있으면 EXPIRED 로 만료 처리한다', async () => {
    prisma.attendedTransferCandidates.updateMany.mockResolvedValue({ count: 2 });

    const count = await service.sweepExpired(15);

    expect(prisma.attendedTransferCandidates.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        phase: {
          in: ['REQUESTED', 'CONSULT_RINGING', 'CONSULT_TALKING', 'REBRIDGING'],
        },
        requestedAt: { lt: expect.any(Date) },
      }),
      data: expect.objectContaining({
        phase: 'EXPIRED',
        expiredAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    });
    expect(count).toBe(2);
  });
});
