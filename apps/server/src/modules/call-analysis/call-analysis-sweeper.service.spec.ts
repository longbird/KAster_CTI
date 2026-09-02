import { ConfigService } from '@nestjs/config';
import { CallAnalysisSweeperService } from './call-analysis-sweeper.service';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const CALL_ID = '00000000-0000-0000-0000-0000000000c1';
const RECORDING_ID = '00000000-0000-0000-0000-0000000000a1';

function job(overrides: Record<string, unknown> = {}) {
  return {
    callAnalysisJobId: 'job-1',
    tenantId: TENANT_ID,
    callId: CALL_ID,
    recordingId: RECORDING_ID,
    stage: 'TRANSCRIBE',
    attempts: 0,
    ...overrides,
  };
}

function buildSweeper(options: {
  jobs?: Array<Record<string, unknown>>;
  env?: Record<string, string>;
  isLeader?: boolean | null;
  transcribe?: jest.Mock;
  analyze?: jest.Mock;
} = {}) {
  const updates: any[] = [];
  const upserts: any[] = [];
  const prisma: any = {
    callAnalysisJobs: {
      findMany: jest.fn().mockResolvedValue(options.jobs ?? []),
      update: jest.fn().mockImplementation(async (args: any) => {
        updates.push(args);
        return args;
      }),
      upsert: jest.fn().mockImplementation(async (args: any) => {
        upserts.push(args);
        return args;
      }),
    },
  };

  const env = { CALL_ANALYSIS_ENABLED: 'true', ...(options.env ?? {}) };
  const config = { get: (key: string, fallback?: string) => env[key] ?? fallback } as unknown as ConfigService;
  const transcription = {
    transcribe: options.transcribe ?? jest.fn().mockResolvedValue({ transcriptId: 't1', segmentCount: 2 }),
  } as any;
  const analysis = {
    analyze: options.analyze ?? jest.fn().mockResolvedValue({ analysisId: 'a1', skipped: false }),
  } as any;
  const leader = options.isLeader === null
    ? undefined
    : ({ isLeader: () => options.isLeader ?? true } as any);

  const service = new CallAnalysisSweeperService(prisma, config, transcription, analysis, leader);
  return { service, prisma, updates, upserts, transcription, analysis };
}

describe('CallAnalysisSweeperService', () => {
  describe('리더 가드', () => {
    it('리더가 아니면 job 을 조회조차 하지 않는다', async () => {
      const { service, prisma } = buildSweeper({ isLeader: false, jobs: [job()] });

      await service.sweep();

      expect(prisma.callAnalysisJobs.findMany).not.toHaveBeenCalled();
    });

    it('리더면 job 을 처리한다', async () => {
      const { service, prisma } = buildSweeper({ isLeader: true, jobs: [job()] });

      await service.sweep();

      expect(prisma.callAnalysisJobs.findMany).toHaveBeenCalled();
    });

    it('리더 선출이 없는 단일 노드에서도 돈다', async () => {
      const { service, prisma } = buildSweeper({ isLeader: null, jobs: [job()] });

      await service.sweep();

      expect(prisma.callAnalysisJobs.findMany).toHaveBeenCalled();
    });
  });

  it('기능이 꺼져 있으면 아무것도 하지 않는다', async () => {
    const { service, prisma } = buildSweeper({ env: { CALL_ANALYSIS_ENABLED: 'false' }, jobs: [job()] });

    await service.sweep();

    expect(prisma.callAnalysisJobs.findMany).not.toHaveBeenCalled();
  });

  it('처리 대기 중인 job 만 순서대로 가져온다', async () => {
    const { service, prisma } = buildSweeper({ env: { CALL_ANALYSIS_MAX_JOBS_PER_SWEEP: '3' } });

    await service.sweep();

    const args = prisma.callAnalysisJobs.findMany.mock.calls[0][0];
    expect(args.where.status).toEqual({ in: ['PENDING', 'RETRY'] });
    expect(args.where.nextAttemptAt.lte).toBeInstanceOf(Date);
    expect(args.take).toBe(3);
  });

  describe('단계 전이', () => {
    it('전사에 성공하면 분석 단계로 넘긴다', async () => {
      const { service, updates, transcription } = buildSweeper({ jobs: [job({ stage: 'TRANSCRIBE', attempts: 2 })] });

      await service.sweep();

      expect(transcription.transcribe).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        callId: CALL_ID,
        recordingId: RECORDING_ID,
      });
      expect(updates[0].data).toMatchObject({
        stage: 'ANALYZE',
        status: 'PENDING',
        attempts: 0,
        lastError: null,
      });
    });

    it('분석에 성공하면 job 을 완료 처리한다', async () => {
      const { service, updates, analysis } = buildSweeper({ jobs: [job({ stage: 'ANALYZE' })] });

      await service.sweep();

      expect(analysis.analyze).toHaveBeenCalled();
      expect(updates[0].data).toMatchObject({ status: 'COMPLETED', lastError: null });
    });

    it('분석을 건너뛴 통화도 완료로 닫는다', async () => {
      const { service, updates } = buildSweeper({
        jobs: [job({ stage: 'ANALYZE' })],
        analyze: jest.fn().mockResolvedValue({ analysisId: null, skipped: true }),
      });

      await service.sweep();

      expect(updates[0].data.status).toBe('COMPLETED');
    });

    it('모르는 단계는 실패로 닫는다', async () => {
      const { service, updates } = buildSweeper({ jobs: [job({ stage: 'WAT' })] });

      await service.sweep();

      expect(updates[0].data.status).toBe('FAILED');
      expect(updates[0].data.lastError).toMatch(/WAT/);
    });
  });

  describe('재시도', () => {
    it('실패하면 RETRY 로 두고 다음 시도 시각을 미룬다', async () => {
      const before = Date.now();
      const { service, updates } = buildSweeper({
        jobs: [job({ attempts: 0 })],
        transcribe: jest.fn().mockRejectedValue(new Error('stt timeout')),
      });

      await service.sweep();

      expect(updates[0].data.status).toBe('RETRY');
      expect(updates[0].data.attempts).toBe(1);
      expect(updates[0].data.lastError).toContain('stt timeout');
      expect(updates[0].data.nextAttemptAt.getTime()).toBeGreaterThan(before);
    });

    it('시도할수록 대기 간격이 길어진다', async () => {
      const first = buildSweeper({
        jobs: [job({ attempts: 0 })],
        transcribe: jest.fn().mockRejectedValue(new Error('x')),
      });
      const later = buildSweeper({
        jobs: [job({ attempts: 3 })],
        transcribe: jest.fn().mockRejectedValue(new Error('x')),
      });

      const now = Date.now();
      await first.service.sweep();
      await later.service.sweep();

      const firstDelay = first.updates[0].data.nextAttemptAt.getTime() - now;
      const laterDelay = later.updates[0].data.nextAttemptAt.getTime() - now;
      expect(laterDelay).toBeGreaterThan(firstDelay);
    });

    it('최대 시도를 넘기면 FAILED 로 닫는다', async () => {
      const { service, updates } = buildSweeper({
        env: { CALL_ANALYSIS_MAX_ATTEMPTS: '3' },
        jobs: [job({ attempts: 2 })],
        transcribe: jest.fn().mockRejectedValue(new Error('stt down')),
      });

      await service.sweep();

      expect(updates[0].data.status).toBe('FAILED');
      expect(updates[0].data.attempts).toBe(3);
    });

    it('한 job 이 실패해도 다음 job 을 계속 처리한다', async () => {
      const transcribe = jest.fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ transcriptId: 't2', segmentCount: 1 });
      const { service, updates } = buildSweeper({
        jobs: [job({ callAnalysisJobId: 'job-1' }), job({ callAnalysisJobId: 'job-2' })],
        transcribe,
      });

      await service.sweep();

      expect(transcribe).toHaveBeenCalledTimes(2);
      expect(updates).toHaveLength(2);
      expect(updates[1].where.callAnalysisJobId).toBe('job-2');
    });
  });

  describe('enqueue', () => {
    it('전사 단계부터 시작하는 job 을 적재한다', async () => {
      const { service, upserts } = buildSweeper();

      await service.enqueue({ tenantId: TENANT_ID, callId: CALL_ID, recordingId: RECORDING_ID });

      expect(upserts[0].where.tenantId_callId_recordingId).toEqual({
        tenantId: TENANT_ID,
        callId: CALL_ID,
        recordingId: RECORDING_ID,
      });
      expect(upserts[0].create).toMatchObject({ stage: 'TRANSCRIBE', status: 'PENDING' });
      expect(upserts[0].update).toMatchObject({ stage: 'TRANSCRIBE', status: 'PENDING', attempts: 0 });
    });

    it('기능이 꺼져 있으면 적재하지 않는다', async () => {
      const { service, upserts } = buildSweeper({ env: { CALL_ANALYSIS_ENABLED: 'false' } });

      await service.enqueue({ tenantId: TENANT_ID, callId: CALL_ID, recordingId: RECORDING_ID });

      expect(upserts).toHaveLength(0);
    });
  });
});
