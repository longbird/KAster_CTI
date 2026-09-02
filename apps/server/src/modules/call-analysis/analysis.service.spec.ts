import { ConfigService } from '@nestjs/config';
import { AnalysisService } from './analysis.service';
import { LlmCompleteInput, LlmProvider } from './providers/llm.provider';
import { CallAnalysisProviderFactory } from './providers/provider.factory';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const CALL_ID = '00000000-0000-0000-0000-0000000000c1';
const RECORDING_ID = '00000000-0000-0000-0000-0000000000a1';
const AGENT_ID = '00000000-0000-0000-0000-0000000000ae';

const GOOD_RESPONSE = JSON.stringify({
  summary: '고객이 배송 지연을 문의했고 상담원이 재배송을 안내했다.',
  sentiment: 'NEGATIVE',
  sentimentScore: -0.4,
  categoryCode: 'DELIVERY',
  keywords: ['배송', '지연'],
  riskFlags: [],
});

class StubLlm implements LlmProvider {
  readonly name = 'stub';
  readonly calls: LlmCompleteInput[] = [];
  constructor(private readonly response: string = GOOD_RESPONSE) {}

  async complete(input: LlmCompleteInput) {
    this.calls.push(input);
    return { text: this.response, modelName: 'stub-model' };
  }
}

function buildService(options: {
  transcript?: Record<string, unknown> | null;
  categories?: Array<Record<string, unknown>>;
  session?: Record<string, unknown> | null;
  existingMemo?: Record<string, unknown> | null;
  llm?: LlmProvider;
  env?: Record<string, string>;
} = {}) {
  const transcript = options.transcript === undefined
    ? { transcriptId: 'transcript-1', fullText: '고객: 배송 언제 오나요\n상담원: 내일 도착합니다' }
    : options.transcript;

  const state = { analyses: [] as any[], memoCreates: [] as any[], memoUpdates: [] as any[] };
  const prisma: any = {
    callTranscripts: { findFirst: jest.fn().mockResolvedValue(transcript) },
    consultCategories: { findMany: jest.fn().mockResolvedValue(options.categories ?? []) },
    callSessions: {
      findFirst: jest.fn().mockResolvedValue(
        options.session === undefined ? { primaryAgentId: AGENT_ID, customerId: null } : options.session,
      ),
    },
    callAnalyses: {
      upsert: jest.fn().mockImplementation(async (args: any) => {
        state.analyses.push(args);
        return { analysisId: 'analysis-1' };
      }),
    },
    callMemos: {
      findFirst: jest.fn().mockResolvedValue(options.existingMemo ?? null),
      create: jest.fn().mockImplementation(async (args: any) => {
        state.memoCreates.push(args);
        return args;
      }),
      update: jest.fn().mockImplementation(async (args: any) => {
        state.memoUpdates.push(args);
        return args;
      }),
    },
  };

  const env = options.env ?? {};
  const config = { get: (key: string, fallback?: string) => env[key] ?? fallback } as unknown as ConfigService;
  const llm = options.llm ?? new StubLlm();
  const providers = { llm: () => llm } as unknown as CallAnalysisProviderFactory;

  return { service: new AnalysisService(prisma, config, providers), prisma, state, llm };
}

const JOB = { tenantId: TENANT_ID, callId: CALL_ID, recordingId: RECORDING_ID };

describe('AnalysisService', () => {
  it('전문을 분석해 callAnalyses 에 저장한다', async () => {
    const { service, state } = buildService();

    const result = await service.analyze(JOB);

    expect(result).toEqual({ analysisId: 'analysis-1', skipped: false });
    expect(state.analyses[0].create).toMatchObject({
      tenantId: TENANT_ID,
      callId: CALL_ID,
      transcriptId: 'transcript-1',
      sentiment: 'NEGATIVE',
      sentimentScore: -0.4,
      provider: 'stub',
      modelName: 'stub-model',
    });
    expect(state.analyses[0].create.keywords).toEqual(['배송', '지연']);
  });

  it('상담분류 코드를 분류 id 로 바꾼다', async () => {
    const { service, state } = buildService({
      categories: [{ categoryId: 'cat-1', code: 'DELIVERY', name: '배송' }],
    });

    await service.analyze(JOB);

    expect(state.analyses[0].create.categoryId).toBe('cat-1');
  });

  it('등록되지 않은 분류 코드는 null 로 둔다', async () => {
    const { service, state } = buildService({
      categories: [{ categoryId: 'cat-1', code: 'REFUND', name: '환불' }],
    });

    await service.analyze(JOB);

    expect(state.analyses[0].create.categoryId).toBeNull();
  });

  it('프롬프트에 상담분류 목록과 전문을 함께 넣는다', async () => {
    const llm = new StubLlm();
    const { service } = buildService({
      llm,
      categories: [{ categoryId: 'cat-1', code: 'DELIVERY', name: '배송' }],
    });

    await service.analyze(JOB);

    expect(llm.calls[0].user).toContain('DELIVERY: 배송');
    expect(llm.calls[0].user).toContain('배송 언제 오나요');
    expect(llm.calls[0].responseFormat).toBe('json');
  });

  it('전문이 길면 잘라서 보낸다', async () => {
    const llm = new StubLlm();
    const { service } = buildService({
      llm,
      env: { CALL_ANALYSIS_TRANSCRIPT_MAX_CHARS: '20' },
      transcript: { transcriptId: 'transcript-1', fullText: '가'.repeat(500) },
    });

    await service.analyze(JOB);

    expect(llm.calls[0].user).toContain('이후 생략');
    expect(llm.calls[0].user.length).toBeLessThan(300);
  });

  it('전문이 비어 있으면 LLM 을 부르지 않고 건너뛴다', async () => {
    const llm = new StubLlm();
    const { service, state } = buildService({
      llm,
      transcript: { transcriptId: 'transcript-1', fullText: '   ' },
    });

    const result = await service.analyze(JOB);

    expect(result).toEqual({ analysisId: null, skipped: true });
    expect(llm.calls).toHaveLength(0);
    expect(state.analyses).toHaveLength(0);
  });

  it('전문 행이 없으면 던진다', async () => {
    const { service } = buildService({ transcript: null });

    await expect(service.analyze(JOB)).rejects.toThrow(/transcript/i);
  });

  it('LLM 응답이 깨지면 던진다', async () => {
    const { service } = buildService({ llm: new StubLlm('응답할 수 없습니다') });

    await expect(service.analyze(JOB)).rejects.toThrow(/JSON/i);
  });

  it('AI 메모 초안을 만든다', async () => {
    const { service, state } = buildService();

    await service.analyze(JOB);

    expect(state.memoCreates[0].data).toMatchObject({
      tenantId: TENANT_ID,
      callId: CALL_ID,
      agentId: AGENT_ID,
      memoType: 'ai',
      isFinal: false,
    });
    expect(state.memoCreates[0].data.memoText).toContain('배송 지연');
  });

  it('이미 AI 메모가 있으면 갱신한다', async () => {
    const { service, state } = buildService({ existingMemo: { memoId: 'memo-1' } });

    await service.analyze(JOB);

    expect(state.memoCreates).toHaveLength(0);
    expect(state.memoUpdates[0].where.memoId).toBe('memo-1');
  });

  it('상담원이 배정되지 않은 통화는 메모를 만들지 않는다', async () => {
    const { service, state } = buildService({ session: { primaryAgentId: null, customerId: null } });

    await service.analyze(JOB);

    expect(state.memoCreates).toHaveLength(0);
    expect(state.memoUpdates).toHaveLength(0);
  });

  it('상담원이 직접 쓴 메모는 건드리지 않는다', async () => {
    const { service, prisma } = buildService();

    await service.analyze(JOB);

    expect(prisma.callMemos.findFirst.mock.calls[0][0].where).toMatchObject({ memoType: 'ai' });
  });

  it('모든 조회에 테넌트 조건을 넣는다', async () => {
    const { service, prisma } = buildService();

    await service.analyze(JOB);

    expect(prisma.callTranscripts.findFirst.mock.calls[0][0].where).toMatchObject({ tenantId: TENANT_ID });
    expect(prisma.consultCategories.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: TENANT_ID });
    expect(prisma.callSessions.findFirst.mock.calls[0][0].where).toMatchObject({ tenantId: TENANT_ID });
    expect(prisma.callMemos.findFirst.mock.calls[0][0].where).toMatchObject({ tenantId: TENANT_ID });
  });
});
