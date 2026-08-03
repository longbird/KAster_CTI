import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForAgent(tenantId: string) {
    const now = new Date();
    const rows = await this.prisma.announcements.findMany({
      where: {
        tenantId,
        targetApp: { in: ['AGENT', 'ALL'] },
        OR: [
          { effectiveFrom: null },
          { effectiveFrom: { lte: now } },
        ],
        AND: [{
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } },
          ],
        }],
      },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    });

    return { success: true, data: rows, error: null };
  }
}
