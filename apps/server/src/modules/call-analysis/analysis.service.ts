import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import { parseAnalysisResponse } from './analysis-response.util';
import { buildAnalysisPrompt } from './prompts/summarize.prompt';
import { CallAnalysisProviderFactory } from './providers/provider.factory';

const DEFAULT_TRANSCRIPT_MAX_CHARS = 12000;
const DEFAULT_MAX_TOKENS = 800;
const AI_MEMO_TYPE = 'ai';

export interface AnalyzeJobInput {
  tenantId: string;
  callId: string;
  recordingId: string;
}

export interface AnalyzeJobResult {
  analysisId: string | null;
  skipped: boolean;
}

/**
 * 전문을 LLM 에 넣어 요약·감정·분류를 만든다.
 * 통화 한 건당 LLM 을 한 번만 부른다 — 비용이 통화량에 선형으로 붙는 지점이라 늘리지 않는다.
 */
@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly providers: CallAnalysisProviderFactory,
  ) {}

  async analyze(input: AnalyzeJobInput): Promise<AnalyzeJobResult> {
    const transcript = await (this.prisma as any).callTranscripts.findFirst({
      where: {
        tenantId: input.tenantId,
        callId: input.callId,
        recordingId: input.recordingId,
      },
      select: { transcriptId: true, fullText: true },
    });

    if (!transcript) {
      throw new Error(`transcript not found for call ${input.callId}`);
    }

    const fullText = (transcript.fullText ?? '').trim();
    if (!fullText) {
      this.logger.log(`skip analysis for call=${input.callId}: transcript is empty`);
      return { analysisId: null, skipped: true };
    }

    const categories = await (this.prisma as any).consultCategories.findMany({
      where: { tenantId: input.tenantId, isActive: true },
      select: { categoryId: true, code: true, name: true },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }],
    });

    const prompt = buildAnalysisPrompt({
      fullText,
      categories: categories.map((category: any) => ({ code: category.code, name: category.name })),
      maxChars: this.numberFromEnv('CALL_ANALYSIS_TRANSCRIPT_MAX_CHARS', DEFAULT_TRANSCRIPT_MAX_CHARS),
    });

    const llm = this.providers.llm();
    const completion = await llm.complete({
      system: prompt.system,
      user: prompt.user,
      maxTokens: this.numberFromEnv('CALL_ANALYSIS_LLM_MAX_TOKENS', DEFAULT_MAX_TOKENS),
      responseFormat: 'json',
    });

    const parsed = parseAnalysisResponse(completion.text);
    const categoryId = parsed.categoryCode
      ? categories.find((category: any) => category.code === parsed.categoryCode)?.categoryId ?? null
      : null;

    const payload = {
      transcriptId: transcript.transcriptId,
      summary: parsed.summary,
      sentiment: parsed.sentiment,
      sentimentScore: parsed.sentimentScore,
      categoryId,
      keywords: parsed.keywords,
      riskFlags: parsed.riskFlags,
      provider: llm.name,
      modelName: completion.modelName ?? null,
    };

    const analysis = await (this.prisma as any).callAnalyses.upsert({
      where: { tenantId_callId: { tenantId: input.tenantId, callId: input.callId } },
      create: { tenantId: input.tenantId, callId: input.callId, ...payload },
      update: payload,
    });

    await this.writeMemoDraft(input, parsed.summary);

    this.logger.log(`analyzed call=${input.callId} sentiment=${parsed.sentiment}`);
    return { analysisId: analysis.analysisId, skipped: false };
  }

  /**
   * 후처리 시간을 줄이려고 AI 요약을 메모 초안으로 남긴다.
   * 상담원이 직접 쓴 메모(memoType !== 'ai')는 건드리지 않고, 초안은 isFinal=false 로 둔다.
   */
  private async writeMemoDraft(input: AnalyzeJobInput, summary: string) {
    const session = await (this.prisma as any).callSessions.findFirst({
      where: { tenantId: input.tenantId, callId: input.callId },
      select: { primaryAgentId: true, customerId: true },
    });

    if (!session?.primaryAgentId) return;

    const existing = await (this.prisma as any).callMemos.findFirst({
      where: { tenantId: input.tenantId, callId: input.callId, memoType: AI_MEMO_TYPE },
      select: { memoId: true },
    });

    if (existing) {
      await (this.prisma as any).callMemos.update({
        where: { memoId: existing.memoId },
        data: { memoText: summary },
      });
      return;
    }

    await (this.prisma as any).callMemos.create({
      data: {
        tenantId: input.tenantId,
        callId: input.callId,
        agentId: session.primaryAgentId,
        customerId: session.customerId ?? null,
        memoType: AI_MEMO_TYPE,
        memoText: summary,
        isFinal: false,
      },
    });
  }

  private numberFromEnv(key: string, fallback: number): number {
    const parsed = Number.parseInt(this.config.get<string>(key, String(fallback)) ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
