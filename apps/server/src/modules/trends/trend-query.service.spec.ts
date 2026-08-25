import { BadRequestException } from '@nestjs/common';
import { TrendQueryService } from './trend-query.service';

function makePrisma(callRows: any[] = [], snapshotRows: any[] = []) {
  return {
    $queryRaw: jest.fn().mockResolvedValue(callRows),
    dashboardSnapshots: { findMany: jest.fn().mockResolvedValue(snapshotRows) },
    queues: { findFirst: jest.fn().mockResolvedValue({ queueId: 'q1', queueName: 'sales' }) },
  } as any;
}

const T = 'tenant-1';
const range = { from: '2026-08-25T09:00:00Z', to: '2026-08-25T09:15:00Z' };

describe('TrendQueryService', () => {
  it('from/to 가 잘못되면 거절한다', async () => {
    const service = new TrendQueryService(makePrisma());

    await expect(service.query(T, { from: 'nope', to: range.to } as any))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.query(T, { from: range.to, to: range.from } as any))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('버킷이 너무 많으면 거절한다 — 1년치를 1분 단위로 그리라고 하면 안 된다', async () => {
    const service = new TrendQueryService(makePrisma());

    await expect(service.query(T, {
      from: '2026-01-01T00:00:00Z',
      to: '2026-12-31T00:00:00Z',
      resolution: 'PT1M',
    } as any)).rejects.toThrow(/해상도/);
  });

  it('두 출처를 합쳐 포인트를 만든다', async () => {
    const prisma = makePrisma(
      [{ bucketStart: new Date('2026-08-25T09:00:00Z'), inbound: 12n, answered: 10n, abandoned: 2n, avgWaitSeconds: 8, avgTalkSeconds: 143 }],
      [{ capturedAt: new Date('2026-08-25T09:00:00Z'), resolution: 'PT1M', waitingCalls: 3, longestWaitSeconds: 41, trunkChannelsInUse: 6, amiConnected: true }],
    );
    const service = new TrendQueryService(prisma);

    const result = await service.query(T, { ...range, resolution: 'PT5M' } as any);

    expect(result.range).toMatchObject({ resolution: 'PT5M' });
    expect(result.points).toHaveLength(3);
    expect(result.points[0]).toMatchObject({
      inbound: 12,
      answered: 10,
      abandoned: 2,
      waitingCalls: 3,
      trunkChannelsInUse: 6,
      amiConnected: true,
    });
  });

  it('BigInt 카운트를 number 로 바꾼다 — JSON 직렬화가 BigInt 에서 터진다', async () => {
    const prisma = makePrisma(
      [{ bucketStart: new Date('2026-08-25T09:00:00Z'), inbound: 5n, answered: 5n, abandoned: 0n, avgWaitSeconds: null, avgTalkSeconds: null }],
    );
    const service = new TrendQueryService(prisma);

    const result = await service.query(T, { ...range, resolution: 'PT5M' } as any);

    expect(typeof result.points[0].inbound).toBe('number');
    expect(result.points[0].avgWaitSeconds).toBe(0);
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('큐를 지정하지 않으면 합계 행(queueId=null)만 읽는다', async () => {
    const prisma = makePrisma();
    const service = new TrendQueryService(prisma);

    await service.query(T, { ...range, resolution: 'PT5M' } as any);

    expect(prisma.dashboardSnapshots.findMany.mock.calls[0][0].where.queueId).toBeNull();
  });

  it('큐를 지정하면 그 큐 행을 읽는다', async () => {
    const prisma = makePrisma();
    const service = new TrendQueryService(prisma);

    await service.query(T, { ...range, resolution: 'PT5M', queueId: 'q1' } as any);

    expect(prisma.dashboardSnapshots.findMany.mock.calls[0][0].where.queueId).toBe('q1');
  });

  it('남의 테넌트 큐는 거절한다', async () => {
    const prisma = makePrisma();
    prisma.queues.findFirst = jest.fn().mockResolvedValue(null);
    const service = new TrendQueryService(prisma);

    await expect(service.query(T, { ...range, resolution: 'PT5M', queueId: 'q-other' } as any))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('해상도를 생략하면 구간 길이에 맞춰 고른다', async () => {
    const prisma = makePrisma();
    const service = new TrendQueryService(prisma);

    const short = await service.query(T, { from: '2026-08-25T09:00:00Z', to: '2026-08-25T11:00:00Z' } as any);
    expect(short.range.resolution).toBe('PT1M');

    const month = await service.query(T, { from: '2026-07-01T00:00:00Z', to: '2026-08-01T00:00:00Z' } as any);
    expect(month.range.resolution).toBe('PT1H');
  });
});
