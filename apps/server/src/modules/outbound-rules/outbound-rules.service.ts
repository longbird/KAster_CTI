import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  matchSourceNumber,
  validateCallerIdNumber,
  validateDisplayName,
  validateSourceNumberPattern,
  type OutboundMatchType,
} from '../../common/outbound-rule.sanitizer';
import { PrismaService } from '../../common/prisma.service';
import { CreateOutboundRuleDto } from './dto/create-outbound-rule.dto';
import { TestOutboundRuleDto } from './dto/test-outbound-rule.dto';
import { UpdateOutboundRuleDto } from './dto/update-outbound-rule.dto';

@Injectable()
export class OutboundRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const rows = await (this.prisma as any).outboundCallerIdRules.findMany({
      where: { tenantId },
      orderBy: [{ enabled: 'desc' }, { priority: 'asc' }, { createdAt: 'desc' }],
      include: {
        branch: { select: { branchId: true, branchCode: true, branchName: true } },
      },
    });
    return { success: true, data: rows, error: null };
  }

  async create(tenantId: string, dto: CreateOutboundRuleDto) {
    validateSourceNumberPattern(dto.matchType as OutboundMatchType, dto.sourceNumberPattern);
    validateCallerIdNumber(dto.callerIdNumber);
    validateDisplayName(dto.displayName ?? null);

    if (dto.branchId) {
      const branch = await this.prisma.branches.findFirst({
        where: { tenantId, branchId: dto.branchId },
        select: { branchId: true },
      });
      if (!branch) throw new BadRequestException('지사를 찾을 수 없습니다.');
    }

    const row = await (this.prisma as any).outboundCallerIdRules.create({
      data: {
        tenantId,
        branchId: dto.branchId ?? null,
        matchType: dto.matchType,
        sourceNumberPattern: dto.sourceNumberPattern,
        callerIdNumber: dto.callerIdNumber,
        displayName: dto.displayName ?? null,
        memo: dto.memo ?? null,
        priority: dto.priority ?? 0,
        enabled: dto.enabled ?? true,
      },
    });
    return { success: true, data: row, error: null };
  }

  async update(tenantId: string, ruleId: string, dto: UpdateOutboundRuleDto) {
    const existing = await (this.prisma as any).outboundCallerIdRules.findFirst({
      where: { tenantId, outboundCallerIdRuleId: ruleId },
    });
    if (!existing) throw new NotFoundException('룰을 찾을 수 없습니다.');

    const matchType = (dto.matchType ?? existing.matchType) as OutboundMatchType;
    const pattern = dto.sourceNumberPattern ?? existing.sourceNumberPattern;
    if (dto.matchType !== undefined || dto.sourceNumberPattern !== undefined) {
      validateSourceNumberPattern(matchType, pattern);
    }
    if (dto.callerIdNumber !== undefined) {
      validateCallerIdNumber(dto.callerIdNumber);
    }
    if (dto.displayName !== undefined) {
      validateDisplayName(dto.displayName ?? null);
    }
    if (dto.branchId !== undefined && dto.branchId !== null) {
      const branch = await this.prisma.branches.findFirst({
        where: { tenantId, branchId: dto.branchId },
        select: { branchId: true },
      });
      if (!branch) throw new BadRequestException('지사를 찾을 수 없습니다.');
    }

    const row = await (this.prisma as any).outboundCallerIdRules.update({
      where: { outboundCallerIdRuleId: ruleId },
      data: {
        ...(dto.branchId !== undefined && { branchId: dto.branchId ?? null }),
        ...(dto.matchType !== undefined && { matchType: dto.matchType }),
        ...(dto.sourceNumberPattern !== undefined && {
          sourceNumberPattern: dto.sourceNumberPattern,
        }),
        ...(dto.callerIdNumber !== undefined && { callerIdNumber: dto.callerIdNumber }),
        ...(dto.displayName !== undefined && { displayName: dto.displayName ?? null }),
        ...(dto.memo !== undefined && { memo: dto.memo ?? null }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        updatedAt: new Date(),
      },
    });
    return { success: true, data: row, error: null };
  }

  async remove(tenantId: string, ruleId: string) {
    const existing = await (this.prisma as any).outboundCallerIdRules.findFirst({
      where: { tenantId, outboundCallerIdRuleId: ruleId },
    });
    if (!existing) {
      return { success: true, data: { deleted: false, ruleId }, error: null };
    }
    await (this.prisma as any).outboundCallerIdRules.delete({
      where: { outboundCallerIdRuleId: ruleId },
    });
    return { success: true, data: { deleted: true, ruleId }, error: null };
  }

  /**
   * 입력 번호에 매칭되는 룰을 우선순위 순으로 평가해 첫 번째 적용 결과를 반환.
   * dialplan 미반영 상태에서도 운영자가 룰을 검증할 수 있게 한다.
   */
  async test(tenantId: string, dto: TestOutboundRuleDto) {
    if (typeof dto.inputNumber !== 'string' || /[\r\n]/.test(dto.inputNumber)) {
      throw new BadRequestException('inputNumber 가 유효하지 않습니다.');
    }

    const rules = await (this.prisma as any).outboundCallerIdRules.findMany({
      where: {
        tenantId,
        enabled: true,
        ...(dto.branchId ? { OR: [{ branchId: dto.branchId }, { branchId: null }] } : {}),
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    type Rule = {
      outboundCallerIdRuleId: string;
      matchType: OutboundMatchType;
      sourceNumberPattern: string;
      callerIdNumber: string;
      displayName: string | null;
      priority: number;
      branchId: string | null;
    };

    const evaluated = (rules as Rule[]).map((r) => ({
      ruleId: r.outboundCallerIdRuleId,
      matched: matchSourceNumber(r.matchType, r.sourceNumberPattern, dto.inputNumber),
      callerIdNumber: r.callerIdNumber,
      displayName: r.displayName,
      matchType: r.matchType,
      sourceNumberPattern: r.sourceNumberPattern,
      priority: r.priority,
      branchId: r.branchId,
    }));

    const winner = evaluated.find((r) => r.matched) ?? null;
    return {
      success: true,
      data: { input: dto.inputNumber, winner, candidates: evaluated },
      error: null,
    };
  }
}
