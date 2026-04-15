import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

// 숫자만 남기는 단순 정규화. 국가코드/지역번호 변환은 실제 통신사 요건에 맞춰
// AmiEventNormalizerService 와 같은 정책으로 맞춰야 한다 (후속).
export function normalizePhone(raw: string): string {
  return (raw || '').replace(/\D+/g, '');
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  // 화면 팝업용 빠른 조회. tenantId 는 JWT 에서 뽑아 필수 지정.
  async searchByPhone(tenantId: string, rawPhone: string) {
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return { success: true, data: { matches: [] }, error: null };
    }

    const phones = await this.prisma.customerPhones.findMany({
      where: { normalizedPhone: phone, isActive: true },
      include: {
        customer: true,
      },
      take: 10,
    });

    const customers = phones
      .map((p) => p.customer)
      .filter((c) => c && c.tenantId === tenantId);

    // 각 고객의 최근 5건 콜 요약 (화면 "최근 이력" 영역 용)
    const enriched = await Promise.all(
      customers.map(async (c) => {
        const recentCalls = await this.prisma.callSessions.findMany({
          where: { customerId: c.customerId, tenantId },
          orderBy: { startedAt: 'desc' },
          take: 5,
          select: {
            callId: true,
            direction: true,
            sessionStatus: true,
            startedAt: true,
            endedAt: true,
            talkSeconds: true,
            primaryAgentId: true,
            queueName: true,
          },
        });
        return { customer: c, recentCalls };
      }),
    );

    return { success: true, data: { matches: enriched }, error: null };
  }

  async getById(tenantId: string, customerId: string) {
    const customer = await this.prisma.customers.findFirst({
      where: { customerId, tenantId },
      include: {
        phones: { where: { isActive: true } },
      },
    });
    if (!customer) {
      return { success: false, data: null, error: { code: 'NOT_FOUND' } };
    }
    return { success: true, data: customer, error: null };
  }
}
