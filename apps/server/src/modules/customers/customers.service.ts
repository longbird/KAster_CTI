import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerListQueryDto } from './dto/customer-list.query.dto';
import { ImportCustomerRowDto } from './dto/import-customers.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

// 숫자만 남기는 단순 정규화. 국가코드/지역번호 변환은 실제 통신사 요건에 맞춰
// AmiEventNormalizerService 와 같은 정책으로 맞춰야 한다 (후속).
export function normalizePhone(raw: string): string {
  return (raw || '').replace(/\D+/g, '');
}

const CUSTOMER_GRADE_ALIASES: Record<string, 'NORMAL' | 'VIP' | 'BLACK'> = {
  NORMAL: 'NORMAL',
  VIP: 'VIP',
  BLACK: 'BLACK',
  일반: 'NORMAL',
};

export function normalizeGrade(raw?: string | null): 'NORMAL' | 'VIP' | 'BLACK' {
  const normalized = String(raw ?? '').trim();
  if (!normalized) {
    return 'NORMAL';
  }

  const resolved = CUSTOMER_GRADE_ALIASES[normalized.toUpperCase()] ?? CUSTOMER_GRADE_ALIASES[normalized];
  if (!resolved) {
    throw new BadRequestException('지원하지 않는 고객 등급입니다.');
  }

  return resolved;
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  private sanitizePhoneList(primaryPhoneNumber: string, extraPhoneNumbers?: string[]) {
    const entries = [
      { phoneNumber: primaryPhoneNumber, isPrimary: true },
      ...((extraPhoneNumbers ?? []).map((phoneNumber) => ({ phoneNumber, isPrimary: false }))),
    ]
      .map((entry) => ({
        phoneNumber: entry.phoneNumber?.trim(),
        normalizedPhone: normalizePhone(entry.phoneNumber ?? ''),
        isPrimary: entry.isPrimary,
      }))
      .filter((entry) => entry.phoneNumber && entry.normalizedPhone);

    if (entries.length === 0) {
      throw new BadRequestException('대표 전화번호는 필수입니다.');
    }

    const deduped = new Map<string, { phoneNumber: string; normalizedPhone: string; isPrimary: boolean }>();
    for (const entry of entries) {
      if (!deduped.has(entry.normalizedPhone)) {
        deduped.set(entry.normalizedPhone, {
          phoneNumber: entry.phoneNumber!,
          normalizedPhone: entry.normalizedPhone,
          isPrimary: entry.isPrimary,
        });
      }
    }

    const values = [...deduped.values()];
    const primary = values.find((entry) => entry.isPrimary);
    if (!primary) {
      throw new BadRequestException('대표 전화번호는 필수입니다.');
    }

    return values.map((entry) => ({
      ...entry,
      isPrimary: entry.normalizedPhone === primary.normalizedPhone,
    }));
  }

  private mapCustomer(customer: any) {
    const activePhones = (customer.phones ?? []).filter((phone: any) => phone.isActive !== false);
    return {
      ...customer,
      grade: normalizeGrade(customer.grade),
      lastCalledAt: customer.lastCalledAt ?? null,
      phones: activePhones,
      primaryPhoneNumber:
        activePhones.find((phone: any) => phone.isPrimary)?.phoneNumber ?? activePhones[0]?.phoneNumber ?? null,
      extraPhoneNumbers: activePhones
        .filter((phone: any) => !phone.isPrimary)
        .map((phone: any) => phone.phoneNumber),
    };
  }

  private async assertPhonesAvailable(
    tenantId: string,
    normalizedPhones: string[],
    excludeCustomerId?: string,
  ) {
    for (const normalizedPhone of [...new Set(normalizedPhones.filter(Boolean))]) {
      const existing = await this.prisma.customerPhones.findFirst({
        where: {
          normalizedPhone,
          isActive: true,
          customer: {
            tenantId,
            ...(excludeCustomerId
              ? {
                  customerId: {
                    not: excludeCustomerId,
                  },
                }
              : {}),
          },
        },
        include: {
          customer: true,
        },
      });

      if (existing) {
        throw new BadRequestException('이미 다른 고객에 등록된 전화번호입니다.');
      }
    }
  }

  async resolveCustomerByPhone(tenantId: string, rawPhone: string) {
    const normalizedPhone = normalizePhone(rawPhone);
    if (!normalizedPhone) return null;

    const match = await this.prisma.customerPhones.findFirst({
      where: {
        normalizedPhone,
        isActive: true,
        customer: {
          tenantId,
          status: 'active',
        },
      },
      include: {
        customer: true,
      },
    });

    return match?.customer ?? null;
  }

  async touchLastCalledAt(tenantId: string, customerId: string, at: Date) {
    return this.prisma.customers.update({
      where: { customerId },
      data: { lastCalledAt: at, updatedAt: at },
    });
  }

  async getCustomerMenuKey(tenantId: string, customerId: string) {
    const customer = await this.prisma.customers.findFirst({
      where: {
        tenantId,
        customerId,
        status: 'active',
      },
      select: {
        grade: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('고객을 찾을 수 없습니다.');
    }

    return 'customers';
  }

  async listCustomers(tenantId: string, query: CustomerListQueryDto) {
    const where: Prisma.customersWhereInput = {
      tenantId,
      status: 'active',
      ...(query.grade ? { grade: query.grade } : {}),
    };

    if (query.keyword?.trim()) {
      const normalizedKeyword = normalizePhone(query.keyword);
      where.OR = [
        { customerName: { contains: query.keyword.trim(), mode: 'insensitive' } },
        ...(normalizedKeyword
          ? [
              {
                phones: {
                  some: {
                    normalizedPhone: {
                      contains: normalizedKeyword,
                    },
                    isActive: true,
                  },
                },
              },
            ]
          : []),
      ];
    }

    if (query.registeredFrom || query.registeredTo) {
      where.createdAt = {};
      if (query.registeredFrom) where.createdAt.gte = new Date(query.registeredFrom);
      if (query.registeredTo) where.createdAt.lte = new Date(query.registeredTo);
    }

    if (query.lastCalledFrom || query.lastCalledTo) {
      where.lastCalledAt = {};
      if (query.lastCalledFrom) where.lastCalledAt.gte = new Date(query.lastCalledFrom);
      if (query.lastCalledTo) where.lastCalledAt.lte = new Date(query.lastCalledTo);
    }

    const rows = await this.prisma.customers.findMany({
      where,
      include: {
        phones: {
          where: { isActive: true },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    return { success: true, data: rows.map((row) => this.mapCustomer(row)), error: null };
  }

  async createCustomer(tenantId: string, dto: CreateCustomerDto) {
    const phones = this.sanitizePhoneList(dto.primaryPhoneNumber, dto.extraPhoneNumbers);
    await this.assertPhonesAvailable(
      tenantId,
      phones.map((phone) => phone.normalizedPhone),
    );

    const customer = await this.prisma.customers.create({
      data: {
        tenantId,
        customerName: dto.customerName?.trim() || null,
        grade: normalizeGrade(dto.grade),
        memo: dto.memo?.trim() || null,
        status: 'active',
        phones: {
          create: phones.map((phone) => ({
            phoneNumber: phone.phoneNumber,
            normalizedPhone: phone.normalizedPhone,
            isPrimary: phone.isPrimary,
            isActive: true,
          })),
        },
      },
      include: {
        phones: {
          where: { isActive: true },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });

    return { success: true, data: this.mapCustomer(customer), error: null };
  }

  async updateCustomer(tenantId: string, customerId: string, dto: UpdateCustomerDto) {
    const existing = await this.prisma.customers.findFirst({
      where: { tenantId, customerId, status: 'active' },
      include: {
        phones: {
          where: { isActive: true },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('고객을 찾을 수 없습니다.');
    }

    const phones = this.sanitizePhoneList(dto.primaryPhoneNumber, dto.extraPhoneNumbers);
    await this.assertPhonesAvailable(
      tenantId,
      phones.map((phone) => phone.normalizedPhone),
      customerId,
    );

    const customer = await this.prisma.$transaction(async (tx) => {
      await tx.customerPhones.updateMany({
        where: { customerId, isActive: true },
        data: { isActive: false },
      });

      return tx.customers.update({
        where: { customerId },
        data: {
          customerName: dto.customerName?.trim() || null,
          grade: normalizeGrade(dto.grade),
          memo: dto.memo?.trim() || null,
          phones: {
            create: phones.map((phone) => ({
              phoneNumber: phone.phoneNumber,
              normalizedPhone: phone.normalizedPhone,
              isPrimary: phone.isPrimary,
              isActive: true,
            })),
          },
        },
        include: {
          phones: {
            where: { isActive: true },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          },
        },
      });
    });

    return { success: true, data: this.mapCustomer(customer), error: null };
  }

  async deleteCustomer(tenantId: string, customerId: string) {
    const existing = await this.prisma.customers.findFirst({
      where: { tenantId, customerId, status: 'active' },
    });
    if (!existing) {
      throw new NotFoundException('고객을 찾을 수 없습니다.');
    }

    await this.prisma.$transaction([
      this.prisma.customers.update({
        where: { customerId },
        data: { status: 'inactive' },
      }),
      this.prisma.customerPhones.updateMany({
        where: { customerId, isActive: true },
        data: { isActive: false },
      }),
    ]);

    return { success: true, data: { customerId }, error: null };
  }

  async importCustomers(tenantId: string, rows: ImportCustomerRowDto[]) {
    const summary = { successCount: 0, skippedCount: 0, failedCount: 0 };
    const failures: Array<{ rowNumber: number; reason: string }> = [];

    for (const [index, row] of rows.entries()) {
      try {
        await this.createCustomer(tenantId, {
          customerName: row.성명,
          grade: normalizeGrade(row.등급),
          memo: row.기본메모 ?? '',
          primaryPhoneNumber: row.대표전화번호,
          extraPhoneNumbers: [row.추가전화번호1, row.추가전화번호2].filter(Boolean) as string[],
        });
        summary.successCount += 1;
      } catch (error: any) {
        if (String(error?.message ?? '').includes('이미 다른 고객에 등록된 전화번호')) {
          summary.skippedCount += 1;
          continue;
        }

        summary.failedCount += 1;
        failures.push({
          rowNumber: index + 1,
          reason: error?.message ?? '알 수 없는 오류',
        });
      }
    }

    return { success: true, data: { summary, failures }, error: null };
  }

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
      .filter((c) => c && c.tenantId === tenantId && c.status === 'active');

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
        return {
          customer: {
            ...c,
            lastCalledAt: c.lastCalledAt ?? null,
          },
          recentCalls,
        };
      }),
    );

    return { success: true, data: { matches: enriched }, error: null };
  }

  async getCustomerHistory(tenantId: string, customerId: string) {
    const history = await this.prisma.callSessions.findMany({
      where: { tenantId, customerId },
      orderBy: { startedAt: 'desc' },
      take: 50,
      select: {
        callId: true,
        direction: true,
        sessionStatus: true,
        startedAt: true,
        endedAt: true,
        talkSeconds: true,
        queueName: true,
        primaryAgent: {
          select: {
            agentName: true,
          },
        },
      },
    });

    return { success: true, data: history, error: null };
  }

  async getById(tenantId: string, customerId: string) {
    const customer = await this.prisma.customers.findFirst({
      where: { customerId, tenantId, status: 'active' },
      include: {
        phones: { where: { isActive: true }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
      },
    });
    if (!customer) {
      return { success: false, data: null, error: { code: 'NOT_FOUND' } };
    }

    const history = await this.prisma.callSessions.findMany({
      where: { tenantId, customerId },
      orderBy: { startedAt: 'desc' },
      take: 20,
      select: {
        callId: true,
        direction: true,
        sessionStatus: true,
        startedAt: true,
        endedAt: true,
        talkSeconds: true,
        queueName: true,
        primaryAgent: {
          select: {
            agentName: true,
          },
        },
      },
    });

    return {
      success: true,
      data: {
        ...this.mapCustomer(customer),
        recentCalls: history,
      },
      error: null,
    };
  }
}
