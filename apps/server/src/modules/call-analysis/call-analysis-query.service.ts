import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CallAnalysisSweeperService } from './call-analysis-sweeper.service';

const SUPERVISORY_ROLES = new Set(['supervisor', 'admin']);

export interface RequestUser {
  sub: string;
  role: string;
  tenantId: string;
}

@Injectable()
export class CallAnalysisQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sweeper: CallAnalysisSweeperService,
  ) {}

  async getTranscript(tenantId: string, callId: string, user: RequestUser) {
    await this.assertCallAccess(tenantId, callId, user);

    const transcript = await (this.prisma as any).callTranscripts.findFirst({
      where: { tenantId, callId },
      orderBy: { createdAt: 'desc' },
      select: {
        transcriptId: true,
        fullText: true,
        language: true,
        durationSeconds: true,
        confidence: true,
        provider: true,
        modelName: true,
        status: true,
        createdAt: true,
      },
    });

    if (!transcript) {
      throw new NotFoundException('transcript is not ready for this call');
    }

    const segments = await (this.prisma as any).callTranscriptSegments.findMany({
      where: { transcriptId: transcript.transcriptId },
      orderBy: { startMs: 'asc' },
      select: {
        segmentId: true,
        speaker: true,
        startMs: true,
        endMs: true,
        text: true,
        confidence: true,
      },
    });

    return { transcript, segments };
  }

  async getAnalysis(tenantId: string, callId: string, user: RequestUser) {
    await this.assertCallAccess(tenantId, callId, user);

    const analysis = await (this.prisma as any).callAnalyses.findFirst({
      where: { tenantId, callId },
      select: {
        analysisId: true,
        transcriptId: true,
        summary: true,
        sentiment: true,
        sentimentScore: true,
        keywords: true,
        riskFlags: true,
        provider: true,
        modelName: true,
        createdAt: true,
        category: { select: { categoryId: true, code: true, name: true } },
      },
    });

    if (!analysis) {
      throw new NotFoundException('analysis is not ready for this call');
    }

    return analysis;
  }

  /** 실패했거나 프로바이더를 바꾼 통화를 다시 분석 큐에 넣는다. */
  async retry(tenantId: string, callId: string) {
    const recording = await (this.prisma as any).callRecordings.findFirst({
      where: { tenantId, callId, recordingStatus: 'READY' },
      orderBy: { finalizedAt: 'desc' },
      select: { recordingId: true },
    });

    if (!recording) {
      throw new NotFoundException('no finalized recording for this call');
    }

    await this.sweeper.enqueue({ tenantId, callId, recordingId: recording.recordingId });
    return { accepted: true, recordingId: recording.recordingId };
  }

  private async assertCallAccess(tenantId: string, callId: string, user: RequestUser) {
    const session = await (this.prisma as any).callSessions.findFirst({
      where: { tenantId, callId },
      select: { callId: true, primaryAgentId: true },
    });

    if (!session) {
      throw new NotFoundException('call not found');
    }

    if (!SUPERVISORY_ROLES.has(user.role) && session.primaryAgentId !== user.sub) {
      throw new ForbiddenException('you can only read your own calls');
    }

    return session;
  }
}
