import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AgentPresenceService } from '../realtime/agent-presence.service';
import { shouldPauseQueue } from './agent-availability.util';
import { AsteriskManagerService } from './asterisk-manager.service';

export interface QueuePauseInput {
  tenantId: string;
  agentId: string;
  extension?: string | null;
  statusCode?: string | null;
  /**
   * presence 조회를 건너뛰고 싶을 때만 지정한다. 로그아웃이 그런 경우다 —
   * 요청을 처리하는 시점에는 상담원 소켓이 아직 안 닫혀 있을 수 있어서
   * presence 를 믿으면 로그아웃한 자리가 큐에 남는다.
   */
  appConnected?: boolean;
  reason?: string | null;
}

/**
 * 큐 멤버 pause 를 거는 유일한 지점.
 *
 * 이 서비스가 RealtimeModule 이 아니라 CallsModule 에 있는 이유:
 * 조립 순서가 Realtime → Calls 이고 Calls → Events → Realtime 이라,
 * 게이트웨이가 AsteriskManagerService 를 직접 잡으면 모듈 순환이 생긴다.
 * forwardRef 로 덮는 대신 방향을 뒤집어, presence 변경을 여기서 구독한다.
 */
@Injectable()
export class AgentQueuePauseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentQueuePauseService.name);
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly asteriskManager: AsteriskManagerService,
    private readonly presence: AgentPresenceService,
  ) {}

  onModuleInit() {
    this.unsubscribe = this.presence.onChange((change) =>
      this.reconcile(change.tenantId, change.agentId),
    );
  }

  onModuleDestroy() {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  async apply(input: QueuePauseInput): Promise<void> {
    const extension = input.extension?.trim();
    if (!extension) return;

    const appConnected =
      input.appConnected ?? (await this.presence.isConnected(input.tenantId, input.agentId));

    this.asteriskManager.setQueuePaused(
      extension,
      shouldPauseQueue({ appConnected, statusCode: input.statusCode }),
      input.reason ?? input.statusCode ?? null,
    );
  }

  /**
   * 앱 접속/해제로 판정이 달라졌을 수 있으니 현재 상태를 다시 읽어 맞춘다.
   * 접속했다고 무조건 풀면 스스로 이석해 둔 상담원의 이석이 조용히 사라진다.
   */
  async reconcile(tenantId: string, agentId: string): Promise<void> {
    try {
      const agent = await this.prisma.agents.findFirst({
        where: { tenantId, agentId },
        select: { extension: true },
      });
      if (!agent?.extension?.trim()) return;

      const current = await this.prisma.agentStatusHistory.findFirst({
        where: { tenantId, agentId, endedAt: null },
        orderBy: { startedAt: 'desc' },
        select: { statusCode: true },
      });

      await this.apply({
        tenantId,
        agentId,
        extension: agent.extension,
        statusCode: current?.statusCode ?? null,
        reason: 'APP_PRESENCE',
      });
    } catch (err) {
      // 소켓 종료 경로에서 불린다. 여기서 던지면 연결 정리가 깨진다.
      this.logger.warn(`queue pause reconcile failed for ${agentId}: ${(err as Error).message}`);
    }
  }
}
