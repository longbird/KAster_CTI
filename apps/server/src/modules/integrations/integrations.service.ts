import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreateIntegrationAutomationDto } from './dto/create-integration-automation.dto';
import { TestIntegrationAutomationDto } from './dto/test-integration-automation.dto';
import { UpdateIntegrationAutomationDto } from './dto/update-integration-automation.dto';

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    return (this.prisma as any).integrationAutomations.findMany({
      where: { tenantId },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async get(tenantId: string, integrationAutomationId: string) {
    const row = await (this.prisma as any).integrationAutomations.findFirst({
      where: { tenantId, integrationAutomationId },
    });
    if (!row) {
      throw new NotFoundException('integration automation not found');
    }
    return row;
  }

  async create(
    tenantId: string,
    dto: CreateIntegrationAutomationDto,
    updatedById?: string,
  ) {
    return (this.prisma as any).integrationAutomations.create({
      data: {
        tenantId,
        type: dto.type,
        name: dto.name,
        description: dto.description ?? null,
        config: dto.config ?? {},
        enabled: dto.enabled ?? true,
        updatedById: updatedById ?? null,
      },
    });
  }

  async update(
    tenantId: string,
    integrationAutomationId: string,
    dto: UpdateIntegrationAutomationDto,
    updatedById?: string,
  ) {
    const existing = await this.get(tenantId, integrationAutomationId);
    return (this.prisma as any).integrationAutomations.update({
      where: { integrationAutomationId },
      data: {
        type: dto.type ?? existing.type,
        name: dto.name ?? existing.name,
        description: dto.description ?? existing.description,
        config: dto.config ?? existing.config,
        enabled: dto.enabled ?? existing.enabled,
        updatedAt: new Date(),
        updatedById: updatedById ?? existing.updatedById,
      },
    });
  }

  async toggle(tenantId: string, integrationAutomationId: string, enabled: boolean) {
    const existing = await this.get(tenantId, integrationAutomationId);
    return (this.prisma as any).integrationAutomations.update({
      where: { integrationAutomationId: existing.integrationAutomationId },
      data: { enabled, updatedAt: new Date() },
    });
  }

  async remove(tenantId: string, integrationAutomationId: string) {
    await this.get(tenantId, integrationAutomationId);
    await (this.prisma as any).integrationAutomations.delete({
      where: { integrationAutomationId },
    });
    return { ok: true };
  }

  async test(
    tenantId: string,
    integrationAutomationId: string,
    dto: TestIntegrationAutomationDto,
  ) {
    const existing = await this.get(tenantId, integrationAutomationId);
    // dry-run: 실제 외부 호출은 follow-up. 등록된 type/config 와 입력 payload 를 그대로 echo.
    await (this.prisma as any).integrationAutomations.update({
      where: { integrationAutomationId: existing.integrationAutomationId },
      data: { lastTriggeredAt: new Date() },
    });
    return {
      ok: true,
      dryRun: true,
      type: existing.type,
      name: existing.name,
      config: existing.config,
      payload: dto.payload ?? null,
      message:
        '실제 외부 호출은 follow-up PR 에서 구현됩니다. 이번 호출은 lastTriggeredAt 만 갱신하는 dry-run 입니다.',
    };
  }
}
