import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class AgentStateService {
  constructor(private readonly prisma: PrismaService) {}

  async changeStatus(agentId: string, statusCode: string, reasonCode?: string) {
    await this.prisma.agentStatusHistory.updateMany({
      where: { agentId, endedAt: null },
      data: {
        endedAt: new Date(),
      },
    });

    return this.prisma.agentStatusHistory.create({
      data: {
        tenantId: (await this.prisma.agents.findUniqueOrThrow({ where: { agentId } })).tenantId,
        agentId,
        statusCode: statusCode as any,
        reasonCode,
        startedAt: new Date(),
      },
    });
  }
}
