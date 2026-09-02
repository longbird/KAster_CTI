import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CallAnalysisQueryService } from './call-analysis-query.service';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const CALL_ID = '00000000-0000-0000-0000-0000000000c1';
const AGENT_ID = '00000000-0000-0000-0000-0000000000ae';
const OTHER_AGENT_ID = '00000000-0000-0000-0000-0000000000bf';

const AGENT_USER = { sub: AGENT_ID, role: 'agent', tenantId: TENANT_ID };
const OTHER_AGENT_USER = { sub: OTHER_AGENT_ID, role: 'agent', tenantId: TENANT_ID };
const SUPERVISOR_USER = { sub: OTHER_AGENT_ID, role: 'supervisor', tenantId: TENANT_ID };

function buildService(options: {
  session?: Record<string, unknown> | null;
  transcript?: Record<string, unknown> | null;
  segments?: Array<Record<string, unknown>>;
  analysis?: Record<string, unknown> | null;
  recording?: Record<string, unknown> | null;
} = {}) {
  const enqueue = jest.fn().mockResolvedValue(undefined);
  const prisma: any = {
    callSessions: {
      findFirst: jest.fn().mockResolvedValue(
        options.session === undefined ? { callId: CALL_ID, primaryAgentId: AGENT_ID } : options.session,
      ),
    },
    callTranscripts: {
      findFirst: jest.fn().mockResolvedValue(
        options.transcript === undefined
          ? { transcriptId: 't1', fullText: '고객: 안녕하세요', language: 'ko', durationSeconds: 12, provider: 'fake', createdAt: new Date(0) }
          : options.transcript,
      ),
    },
    callTranscriptSegments: {
      findMany: jest.fn().mockResolvedValue(options.segments ?? [
        { segmentId: 's1', speaker: 'CUSTOMER', startMs: 0, endMs: 500, text: '안녕하세요', confidence: 0.9 },
      ]),
    },
    callAnalyses: {
      findFirst: jest.fn().mockResolvedValue(
        options.analysis === undefined
          ? { analysisId: 'a1', summary: '요약', sentiment: 'NEUTRAL', sentimentScore: 0, keywords: ['a'], riskFlags: [], category: { categoryId: 'cat-1', code: 'DELIVERY', name: '배송' }, createdAt: new Date(0) }
          : options.analysis,
      ),
    },
    callRecordings: {
      findFirst: jest.fn().mockResolvedValue(
        options.recording === undefined ? { recordingId: 'r1' } : options.recording,
      ),
    },
  };

  const sweeper = { enqueue } as any;
  return { service: new CallAnalysisQueryService(prisma, sweeper), prisma, enqueue };
}

describe('CallAnalysisQueryService', () => {
  describe('getTranscript', () => {
    it('전문과 세그먼트를 함께 준다', async () => {
      const { service } = buildService();

      const result = await service.getTranscript(TENANT_ID, CALL_ID, AGENT_USER);

      expect(result.transcript.fullText).toBe('고객: 안녕하세요');
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0].speaker).toBe('CUSTOMER');
    });

    it('세그먼트를 시간순으로 조회한다', async () => {
      const { service, prisma } = buildService();

      await service.getTranscript(TENANT_ID, CALL_ID, AGENT_USER);

      expect(prisma.callTranscriptSegments.findMany.mock.calls[0][0].orderBy).toEqual({ startMs: 'asc' });
    });

    it('전문이 아직 없으면 404', async () => {
      const { service } = buildService({ transcript: null });

      await expect(service.getTranscript(TENANT_ID, CALL_ID, AGENT_USER)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('통화가 없으면 404', async () => {
      const { service } = buildService({ session: null });

      await expect(service.getTranscript(TENANT_ID, CALL_ID, AGENT_USER)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('남의 통화는 상담원이 못 본다', async () => {
      const { service } = buildService();

      await expect(service.getTranscript(TENANT_ID, CALL_ID, OTHER_AGENT_USER)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('관리자는 남의 통화도 본다', async () => {
      const { service } = buildService();

      await expect(service.getTranscript(TENANT_ID, CALL_ID, SUPERVISOR_USER)).resolves.toBeDefined();
    });

    it('테넌트 조건을 넣어 조회한다', async () => {
      const { service, prisma } = buildService();

      await service.getTranscript(TENANT_ID, CALL_ID, AGENT_USER);

      expect(prisma.callSessions.findFirst.mock.calls[0][0].where).toMatchObject({ tenantId: TENANT_ID, callId: CALL_ID });
      expect(prisma.callTranscripts.findFirst.mock.calls[0][0].where).toMatchObject({ tenantId: TENANT_ID, callId: CALL_ID });
    });
  });

  describe('getAnalysis', () => {
    it('분석 결과와 상담분류를 함께 준다', async () => {
      const { service } = buildService();

      const result = await service.getAnalysis(TENANT_ID, CALL_ID, AGENT_USER);

      expect(result.summary).toBe('요약');
      expect(result.category).toMatchObject({ code: 'DELIVERY', name: '배송' });
    });

    it('분석이 아직 없으면 404', async () => {
      const { service } = buildService({ analysis: null });

      await expect(service.getAnalysis(TENANT_ID, CALL_ID, AGENT_USER)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('남의 통화는 상담원이 못 본다', async () => {
      const { service } = buildService();

      await expect(service.getAnalysis(TENANT_ID, CALL_ID, OTHER_AGENT_USER)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('retry', () => {
    it('확정된 녹취를 다시 분석 큐에 넣는다', async () => {
      const { service, enqueue } = buildService();

      const result = await service.retry(TENANT_ID, CALL_ID);

      expect(enqueue).toHaveBeenCalledWith({ tenantId: TENANT_ID, callId: CALL_ID, recordingId: 'r1' });
      expect(result).toEqual({ accepted: true, recordingId: 'r1' });
    });

    it('READY 인 녹취만 대상으로 한다', async () => {
      const { service, prisma } = buildService();

      await service.retry(TENANT_ID, CALL_ID);

      expect(prisma.callRecordings.findFirst.mock.calls[0][0].where).toMatchObject({
        tenantId: TENANT_ID,
        callId: CALL_ID,
        recordingStatus: 'READY',
      });
    });

    it('확정된 녹취가 없으면 404', async () => {
      const { service } = buildService({ recording: null });

      await expect(service.retry(TENANT_ID, CALL_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
