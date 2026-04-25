import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import { OptOutService } from '../opt-out/opt-out.service';
import { ExecuteSmartArsActionDto } from './dto/execute-smart-ars-action.dto';

interface SmartArsSmsTemplate {
  templateId: string;
  templateName: string;
  content: string;
  category?: unknown;
}

@Injectable()
export class SmartArsRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly optOutService: OptOutService,
    private readonly config: ConfigService,
  ) {}

  async sendSms(input: ExecuteSmartArsActionDto) {
    const normalized = this.normalizeInput(input, true);
    const blocked = await this.prisma.asteriskBlocklistEntry.findFirst({
      where: {
        tenantId: normalized.tenantId,
        matchType: 'EXACT',
        phoneNumber: normalized.requesterPhoneNumber,
        isActive: true,
      },
      select: { id: true },
    } as any);

    if (blocked) {
      return {
        delivered: false,
        skipped: true,
        reason: 'OPT_OUT',
        to: normalized.requesterPhoneNumber,
      };
    }

    const template = await this.resolveSmsTemplate(normalized.tenantId, normalized.smsTemplateId);
    const webhookUrl = this.config.get<string>('SMART_ARS_SMS_WEBHOOK_URL')?.trim()
      || this.config.get<string>('SMS_WEBHOOK_URL')?.trim();
    if (!webhookUrl) {
      throw new ServiceUnavailableException('SMART_ARS_SMS_WEBHOOK_URL is not configured');
    }

    const payload = {
      tenantId: normalized.tenantId,
      branchId: normalized.branchId,
      entryDid: normalized.entryDid,
      to: normalized.requesterPhoneNumber,
      templateId: template.templateId,
      templateName: template.templateName,
      content: template.content,
      sourceType: 'SMART_ARS_SMS',
    };
    const secret = this.config.get<string>('SMART_ARS_SMS_WEBHOOK_SECRET')?.trim();
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(secret ? { 'x-kaster-smart-ars-secret': secret } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new BadGatewayException(`Smart ARS SMS webhook failed with status ${response.status}`);
    }

    return {
      delivered: true,
      to: normalized.requesterPhoneNumber,
      templateId: template.templateId,
      templateName: template.templateName,
    };
  }

  async registerOptOut(input: ExecuteSmartArsActionDto) {
    const normalized = this.normalizeInput(input, false);
    return this.optOutService.register({
      tenantId: normalized.tenantId,
      branchId: normalized.branchId,
      entryDid: normalized.entryDid,
      requesterPhoneNumber: normalized.requesterPhoneNumber,
      sourceType: 'SMART_ARS_OPT_OUT',
      smsTemplateId: null,
    });
  }

  private normalizeInput(input: ExecuteSmartArsActionDto, requireTemplate: boolean) {
    const tenantId = input.tenantId?.trim();
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }

    const requesterPhoneNumber = this.normalizePhoneNumber(input.requesterPhoneNumber, 'requesterPhoneNumber');
    const smsTemplateId = input.smsTemplateId?.trim() || null;
    if (requireTemplate && !smsTemplateId) {
      throw new BadRequestException('smsTemplateId is required');
    }

    return {
      tenantId,
      branchId: input.branchId?.trim() || null,
      entryDid: input.entryDid?.trim() || null,
      requesterPhoneNumber,
      smsTemplateId,
    };
  }

  private normalizePhoneNumber(value: string, field: string) {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (!/^\d{8,16}$/.test(digits)) {
      throw new BadRequestException(`${field} must contain 8 to 16 digits`);
    }
    return digits;
  }

  private async resolveSmsTemplate(tenantId: string, smsTemplateId: string | null): Promise<SmartArsSmsTemplate> {
    if (!smsTemplateId) {
      throw new BadRequestException('smsTemplateId is required');
    }

    const template = await this.prisma.tenantSmsTemplate.findFirst({
      where: {
        tenantId,
        templateId: smsTemplateId,
        isActive: true,
      },
      select: {
        templateId: true,
        templateName: true,
        category: true,
        content: true,
      },
    });

    if (!template) {
      throw new NotFoundException(`SMS template ${smsTemplateId} not found`);
    }

    return template as SmartArsSmsTemplate;
  }
}
