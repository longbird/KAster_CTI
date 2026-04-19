import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForTenant(tenantId: string) {
    const agents = await this.prisma.agents.findMany({
      where: { tenantId },
      orderBy: { extension: 'asc' },
      select: {
        agentId: true,
        loginId: true,
        agentCode: true,
        agentName: true,
        extension: true,
        sipPassword: true,
        role: true,
        employmentStatus: true,
        defaultQueueId: true,
        settingsProfile: true,
        lastLoginAt: true,
        isActive: true,
      },
    });

    const withStatus = await Promise.all(
      agents.map(async (a) => {
        const current = await this.prisma.agentStatusHistory.findFirst({
          where: { agentId: a.agentId, endedAt: null },
          orderBy: { startedAt: 'desc' },
          select: { statusCode: true, reasonCode: true, startedAt: true },
        });
        return { ...a, currentStatus: current };
      }),
    );

    return { success: true, data: withStatus, error: null };
  }

  async create(tenantId: string, dto: CreateAgentDto) {
    const existing = await this.prisma.agents.findFirst({
      where: {
        tenantId,
        OR: [
          { loginId: dto.loginId },
          { agentCode: dto.agentCode },
          { extension: dto.extension },
        ],
      },
      select: { loginId: true, agentCode: true, extension: true },
    });

    if (existing) {
      if (existing.loginId === dto.loginId) {
        throw new ConflictException(`loginId '${dto.loginId}' 이미 사용 중`);
      }
      if (existing.agentCode === dto.agentCode) {
        throw new ConflictException(`agentCode '${dto.agentCode}' 이미 사용 중`);
      }
      if (existing.extension === dto.extension) {
        throw new ConflictException(`extension '${dto.extension}' 이미 사용 중`);
      }
    }

    const hash = await bcrypt.hash(dto.password, 10);

    const agent = await this.prisma.agents.create({
      data: {
        tenantId,
        loginId: dto.loginId,
        agentCode: dto.agentCode,
        agentName: dto.agentName,
        extension: dto.extension,
        loginPasswordHash: hash,
        sipPassword: dto.sipPassword?.trim() || null,
        ...(dto.settingsProfile !== undefined
          ? { settingsProfile: dto.settingsProfile as Prisma.InputJsonValue }
          : {}),
        role: dto.role ?? 'agent',
        defaultQueueId: dto.defaultQueueId ?? null,
      },
      select: {
        agentId: true,
        loginId: true,
        agentCode: true,
        agentName: true,
        extension: true,
        sipPassword: true,
        role: true,
        defaultQueueId: true,
        settingsProfile: true,
      },
    });

    return { success: true, data: agent, error: null };
  }

  async getDetail(tenantId: string, agentId: string) {
    const agent = await this.prisma.agents.findFirst({
      where: { agentId, tenantId },
      include: {
        defaultQueue: true,
      },
    });
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    const currentStatus = await this.prisma.agentStatusHistory.findFirst({
      where: { agentId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todaysCalls = await this.prisma.callSessions.findMany({
      where: {
        tenantId,
        primaryAgentId: agentId,
        startedAt: { gte: startOfDay },
        sessionStatus: 'ENDED',
      },
      select: { talkSeconds: true },
    });

    const answered = todaysCalls.length;
    const totalTalk = todaysCalls.reduce((sum, c) => sum + (c.talkSeconds ?? 0), 0);
    const avgTalk = answered > 0 ? Math.round(totalTalk / answered) : 0;

    return {
      success: true,
      data: {
        agent,
        currentStatus,
        todayStats: { answered, totalTalkSeconds: totalTalk, avgTalkSeconds: avgTalk },
      },
      error: null,
    };
  }

  async getHistory(tenantId: string, agentId: string, limit = 50) {
    const rows = await this.prisma.agentStatusHistory.findMany({
      where: { agentId, tenantId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return { success: true, data: rows, error: null };
  }

  async update(tenantId: string, agentId: string, dto: UpdateAgentDto) {
    const agent = await this.prisma.agents.findFirst({ where: { agentId, tenantId } });
    if (!agent) throw new NotFoundException('Agent not found');

    if (
      (dto.loginId !== undefined && dto.loginId !== agent.loginId) ||
      (dto.extension !== undefined && dto.extension !== agent.extension)
    ) {
      const duplicate = await this.prisma.agents.findFirst({
        where: {
          tenantId,
          agentId: { not: agentId },
          OR: [
            ...(dto.loginId !== undefined ? [{ loginId: dto.loginId }] : []),
            ...(dto.extension !== undefined ? [{ extension: dto.extension }] : []),
          ],
        },
        select: { loginId: true, extension: true },
      });

      if (duplicate) {
        if (dto.loginId !== undefined && duplicate.loginId === dto.loginId) {
          throw new ConflictException(`loginId '${dto.loginId}' 이미 사용 중`);
        }
        if (dto.extension !== undefined && duplicate.extension === dto.extension) {
          throw new ConflictException(`extension '${dto.extension}' 이미 사용 중`);
        }
      }
    }

    const passwordHash =
      dto.password !== undefined && dto.password.trim()
        ? await bcrypt.hash(dto.password, 10)
        : undefined;

    const updated = await this.prisma.agents.update({
      where: { agentId },
      data: {
        ...(dto.loginId !== undefined && { loginId: dto.loginId }),
        ...(passwordHash !== undefined && { loginPasswordHash: passwordHash }),
        ...(dto.agentName !== undefined && { agentName: dto.agentName }),
        ...(dto.extension !== undefined && { extension: dto.extension }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.defaultQueueId !== undefined && { defaultQueueId: dto.defaultQueueId }),
        ...(dto.sipPassword !== undefined && { sipPassword: dto.sipPassword?.trim() || null }),
        ...(dto.settingsProfile !== undefined
          ? { settingsProfile: dto.settingsProfile as Prisma.InputJsonValue }
          : {}),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        updatedAt: new Date(),
      },
      select: {
        agentId: true,
        agentName: true,
        extension: true,
        role: true,
        loginId: true,
        defaultQueueId: true,
        sipPassword: true,
        settingsProfile: true,
        isActive: true,
      },
    });
    return { success: true, data: updated, error: null };
  }

  async deactivate(tenantId: string, agentId: string) {
    const agent = await this.prisma.agents.findFirst({ where: { agentId, tenantId } });
    if (!agent) throw new NotFoundException('Agent not found');

    await this.prisma.agents.update({
      where: { agentId },
      data: { isActive: false, updatedAt: new Date() },
    });

    return { success: true, data: { agentId, isActive: false }, error: null };
  }

  async resetPassword(tenantId: string, agentId: string) {
    const agent = await this.prisma.agents.findFirst({ where: { agentId, tenantId } });
    if (!agent) throw new NotFoundException('Agent not found');

    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    const tempPassword = Array.from({ length: 12 }, () =>
      chars[Math.floor(Math.random() * chars.length)],
    ).join('');

    const hash = await bcrypt.hash(tempPassword, 10);
    await this.prisma.agents.update({
      where: { agentId },
      data: { loginPasswordHash: hash, updatedAt: new Date() },
    });

    return {
      success: true,
      data: { agentId, tempPassword },
      error: null,
    };
  }
}
