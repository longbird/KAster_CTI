import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreateShareRuleDto } from './dto/create-share-rule.dto';
import { PutShareRuleAgentsDto } from './dto/put-share-rule-agents.dto';
import { PutShareRuleBranchesDto } from './dto/put-share-rule-branches.dto';
import { UpdateShareRuleDto } from './dto/update-share-rule.dto';

@Injectable()
export class ShareRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const rules = await (this.prisma as any).shareRules.findMany({
      where: { tenantId },
      orderBy: [{ ruleCode: 'asc' }],
      include: {
        _count: {
          select: { agents: true, agentGroups: true, branches: true },
        },
      },
    });
    return rules;
  }

  async get(tenantId: string, shareRuleId: string) {
    const rule = await (this.prisma as any).shareRules.findFirst({
      where: { tenantId, shareRuleId },
      include: {
        agents: {
          orderBy: [{ priority: 'asc' }],
          include: {
            agent: { select: { agentId: true, agentCode: true, agentName: true } },
          },
        },
        agentGroups: {
          orderBy: [{ priority: 'asc' }],
          include: {
            agentGroup: { select: { agentGroupId: true, groupCode: true, groupName: true } },
          },
        },
        branches: {
          include: {
            branch: { select: { branchId: true, branchCode: true, branchName: true } },
          },
        },
      },
    });
    if (!rule) {
      throw new NotFoundException('shareRule not found');
    }
    return rule;
  }

  async create(tenantId: string, dto: CreateShareRuleDto, updatedById?: string) {
    return (this.prisma as any).shareRules.create({
      data: {
        tenantId,
        ruleCode: dto.ruleCode,
        ruleName: dto.ruleName,
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
        updatedById: updatedById ?? null,
      },
    });
  }

  async update(
    tenantId: string,
    shareRuleId: string,
    dto: UpdateShareRuleDto,
    updatedById?: string,
  ) {
    const existing = await (this.prisma as any).shareRules.findFirst({
      where: { tenantId, shareRuleId },
    });
    if (!existing) {
      throw new NotFoundException('shareRule not found');
    }
    return (this.prisma as any).shareRules.update({
      where: { shareRuleId },
      data: {
        ruleCode: dto.ruleCode ?? existing.ruleCode,
        ruleName: dto.ruleName ?? existing.ruleName,
        description: dto.description ?? existing.description,
        isActive: dto.isActive ?? existing.isActive,
        updatedAt: new Date(),
        updatedById: updatedById ?? existing.updatedById,
      },
    });
  }

  async remove(tenantId: string, shareRuleId: string) {
    const existing = await (this.prisma as any).shareRules.findFirst({
      where: { tenantId, shareRuleId },
    });
    if (!existing) {
      throw new NotFoundException('shareRule not found');
    }
    await (this.prisma as any).shareRules.delete({ where: { shareRuleId } });
    return { ok: true };
  }

  async putAgents(tenantId: string, shareRuleId: string, dto: PutShareRuleAgentsDto) {
    const rule = await (this.prisma as any).shareRules.findFirst({
      where: { tenantId, shareRuleId },
    });
    if (!rule) {
      throw new NotFoundException('shareRule not found');
    }

    const agentIds = dto.agents.map((a) => a.agentId);
    const groupIds = dto.agentGroups.map((g) => g.agentGroupId);
    if (new Set(agentIds).size !== agentIds.length) {
      throw new BadRequestException('duplicate agentId');
    }
    if (new Set(groupIds).size !== groupIds.length) {
      throw new BadRequestException('duplicate agentGroupId');
    }

    return this.prisma.$transaction(async (tx) => {
      const t = tx as any;
      await t.shareRuleAgents.deleteMany({ where: { tenantId, shareRuleId } });
      await t.shareRuleAgentGroups.deleteMany({ where: { tenantId, shareRuleId } });
      if (dto.agents.length > 0) {
        await t.shareRuleAgents.createMany({
          data: dto.agents.map((a, idx) => ({
            tenantId,
            shareRuleId,
            agentId: a.agentId,
            priority: a.priority ?? idx,
          })),
        });
      }
      if (dto.agentGroups.length > 0) {
        await t.shareRuleAgentGroups.createMany({
          data: dto.agentGroups.map((g, idx) => ({
            tenantId,
            shareRuleId,
            agentGroupId: g.agentGroupId,
            priority: g.priority ?? idx,
          })),
        });
      }
      return { ok: true, agents: dto.agents.length, agentGroups: dto.agentGroups.length };
    });
  }

  async putBranches(tenantId: string, shareRuleId: string, dto: PutShareRuleBranchesDto) {
    const rule = await (this.prisma as any).shareRules.findFirst({
      where: { tenantId, shareRuleId },
    });
    if (!rule) {
      throw new NotFoundException('shareRule not found');
    }

    const branchIds = dto.branches.map((b) => b.branchId);
    if (new Set(branchIds).size !== branchIds.length) {
      throw new BadRequestException('duplicate branchId');
    }

    return this.prisma.$transaction(async (tx) => {
      const t = tx as any;
      await t.shareRuleBranches.deleteMany({ where: { tenantId, shareRuleId } });
      if (dto.branches.length > 0) {
        await t.shareRuleBranches.createMany({
          data: dto.branches.map((b) => ({
            tenantId,
            shareRuleId,
            branchId: b.branchId,
            mainPhone: b.mainPhone ?? null,
            transferPhone: b.transferPhone ?? null,
          })),
        });
      }
      return { ok: true, branches: dto.branches.length };
    });
  }
}
