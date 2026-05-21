import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
    const delivery = await this.deliver(existing.type, existing.name, existing.config ?? {}, dto.payload ?? {});
    await (this.prisma as any).integrationAutomations.update({
      where: { integrationAutomationId: existing.integrationAutomationId },
      data: { lastTriggeredAt: new Date() },
    });
    return {
      ok: true,
      dryRun: false,
      type: existing.type,
      name: existing.name,
      target: delivery.target,
      status: delivery.status,
      responseBody: delivery.responseBody,
      payload: dto.payload ?? null,
      message: `외부 연동 테스트 전송 완료 (${delivery.status})`,
    };
  }

  private async deliver(type: string, name: string, config: Record<string, any>, payload: Record<string, unknown>) {
    const target = this.resolveTargetUrl(type, config);
    const headers = this.resolveHeaders(config);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.resolveTimeoutMs(config));

    try {
      const response = await fetch(target, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type,
          name,
          payload,
        }),
        signal: controller.signal,
      });
      const responseBody = (await response.text()).slice(0, 2000);
      if (!response.ok) {
        throw new BadRequestException(`외부 연동 응답 실패: ${response.status}`);
      }
      return { target, status: response.status, responseBody };
    } finally {
      clearTimeout(timeout);
    }
  }

  private resolveTargetUrl(type: string, config: Record<string, any>) {
    if (type === 'WEBHOOK' || type === 'SLACK_WEBHOOK') {
      const url = String(config.url ?? '').trim();
      if (!url) throw new BadRequestException('Webhook URL 이 필요합니다.');
      return url;
    }

    const host = String(config.host ?? '').trim();
    if (!host) throw new BadRequestException('연동 host 가 필요합니다.');
    const route = String(config.route ?? '').trim();
    const port = config.port ? `:${Number(config.port)}` : '';
    const protocol = host.startsWith('http://') || host.startsWith('https://') ? '' : 'http://';
    const path = route ? `/${route.replace(/^\/+/, '')}` : '';
    return `${protocol}${host}${port}${path}`;
  }

  private resolveHeaders(config: Record<string, any>) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const configuredHeaders = config.headers;
    if (configuredHeaders && typeof configuredHeaders === 'object' && !Array.isArray(configuredHeaders)) {
      for (const [key, value] of Object.entries(configuredHeaders)) {
        if (typeof value === 'string') headers[key] = value;
      }
    }
    const authToken = String(config.authToken ?? '').trim();
    if (authToken) headers.authorization = `Bearer ${authToken}`;
    const secret = String(config.secret ?? '').trim();
    if (secret) headers['x-kaster-secret'] = secret;
    return headers;
  }

  private resolveTimeoutMs(config: Record<string, any>) {
    const timeoutMs = Number(config.timeoutMs ?? 5000);
    if (!Number.isFinite(timeoutMs)) return 5000;
    return Math.min(Math.max(timeoutMs, 1000), 30000);
  }
}
