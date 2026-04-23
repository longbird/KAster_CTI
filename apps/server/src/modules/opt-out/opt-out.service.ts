import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ExecuteOptOutActionDto } from './dto/execute-opt-out-action.dto';
import { ExecuteSmartOptOutDto } from './dto/execute-smart-opt-out.dto';

type ExecuteOptOutInput = ExecuteOptOutActionDto | ExecuteSmartOptOutDto;

export interface ResolvedOptOutSmsTemplate {
  id: string;
  name: string | null;
  content: string | null;
  raw: unknown;
}

export interface OptOutExecutionResult {
  action: 'REGISTER' | 'UNREGISTER';
  tenantId: string;
  branchId: string | null;
  entryDid: string | null;
  sourceType: string;
  requesterPhoneNumber: string;
  normalizedRequesterPhone: string;
  targetPhoneNumber: string;
  normalizedPhoneNumber: string;
  blocklistEntry?: unknown;
  removed?: boolean;
  smsTemplate: ResolvedOptOutSmsTemplate | null;
}

interface BlocklistEntryRecord {
  id: string;
  tenantId: string;
  matchType: string;
  phoneNumber: string;
  normalizedPhoneNumber?: string | null;
  requesterPhoneNumber?: string | null;
  normalizedRequesterPhone?: string | null;
  sourceType?: string | null;
  branchId?: string | null;
  entryDid?: string | null;
  description?: string | null;
  isActive?: boolean;
}

interface NormalizedExecutionInput {
  tenantId: string;
  branchId: string | null;
  entryDid: string | null;
  requesterPhoneNumber: string;
  targetPhoneNumber: string;
  sourceType: string;
  smsTemplateId: string | null;
}

@Injectable()
export class OptOutService {
  private readonly logger = new Logger(OptOutService.name);

  constructor(private readonly prisma: PrismaService) {}

  async register(input: ExecuteOptOutInput): Promise<OptOutExecutionResult> {
    const normalized = this.normalizeExecutionInput(input);
    const where = this.buildExactWhere(normalized.tenantId, normalized.targetPhoneNumber);
    const existing = await this.prisma.asteriskBlocklistEntry.findUnique({ where }) as BlocklistEntryRecord | null;

    const blocklistEntry = existing
      ? await this.registerExistingEntry(where, existing, normalized)
      : await this.createBlocklistEntry(where, normalized);

    return {
      action: 'REGISTER',
      tenantId: normalized.tenantId,
      branchId: normalized.branchId,
      entryDid: normalized.entryDid,
      sourceType: normalized.sourceType,
      requesterPhoneNumber: normalized.requesterPhoneNumber,
      normalizedRequesterPhone: normalized.requesterPhoneNumber,
      targetPhoneNumber: normalized.targetPhoneNumber,
      normalizedPhoneNumber: normalized.targetPhoneNumber,
      blocklistEntry,
      smsTemplate: await this.resolveSmsTemplate(normalized.tenantId, normalized.smsTemplateId),
    };
  }

  async unregister(input: ExecuteOptOutInput): Promise<OptOutExecutionResult> {
    const normalized = this.normalizeExecutionInput(input);
    const where = this.buildExactWhere(normalized.tenantId, normalized.targetPhoneNumber);
    const existing = await this.prisma.asteriskBlocklistEntry.findUnique({ where }) as BlocklistEntryRecord | null;

    if (!existing) {
      throw new NotFoundException(
        `EXACT opt-out entry not found for tenant ${normalized.tenantId} and phone ${normalized.targetPhoneNumber}`,
      );
    }

    if (!this.isOptOutManagedSourceType(existing.sourceType)) {
      if (this.isRuntimeReactivatedManualEntry(existing, normalized)) {
        const blocklistEntry = await this.prisma.asteriskBlocklistEntry.update({
          where,
          data: {
            isActive: false,
          },
        } as any);

        return {
          action: 'UNREGISTER',
          tenantId: normalized.tenantId,
          branchId: normalized.branchId,
          entryDid: normalized.entryDid,
          sourceType: normalized.sourceType,
          requesterPhoneNumber: normalized.requesterPhoneNumber,
          normalizedRequesterPhone: normalized.requesterPhoneNumber,
          targetPhoneNumber: normalized.targetPhoneNumber,
          normalizedPhoneNumber: normalized.targetPhoneNumber,
          removed: true,
          blocklistEntry,
          smsTemplate: await this.resolveSmsTemplate(normalized.tenantId, normalized.smsTemplateId),
        };
      }

      return {
        action: 'UNREGISTER',
        tenantId: normalized.tenantId,
        branchId: normalized.branchId,
        entryDid: normalized.entryDid,
        sourceType: normalized.sourceType,
        requesterPhoneNumber: normalized.requesterPhoneNumber,
        normalizedRequesterPhone: normalized.requesterPhoneNumber,
        targetPhoneNumber: normalized.targetPhoneNumber,
        normalizedPhoneNumber: normalized.targetPhoneNumber,
        removed: false,
        blocklistEntry: existing,
        smsTemplate: await this.resolveSmsTemplate(normalized.tenantId, normalized.smsTemplateId),
      };
    }

    const blocklistEntry = existing.isActive === false
      ? existing
      : await this.prisma.asteriskBlocklistEntry.update({
        where,
        data: {
          isActive: false,
        },
      } as any);

    return {
      action: 'UNREGISTER',
      tenantId: normalized.tenantId,
      branchId: normalized.branchId,
      entryDid: normalized.entryDid,
      sourceType: normalized.sourceType,
      requesterPhoneNumber: normalized.requesterPhoneNumber,
      normalizedRequesterPhone: normalized.requesterPhoneNumber,
      targetPhoneNumber: normalized.targetPhoneNumber,
      normalizedPhoneNumber: normalized.targetPhoneNumber,
      removed: existing.isActive !== false,
      blocklistEntry,
      smsTemplate: await this.resolveSmsTemplate(normalized.tenantId, normalized.smsTemplateId),
    };
  }

  async resolveSmsTemplate(
    tenantId: string,
    smsTemplateId?: string | null,
  ): Promise<ResolvedOptOutSmsTemplate | null> {
    const normalizedTemplateId = smsTemplateId?.trim();
    if (!normalizedTemplateId) {
      return null;
    }

    const template = await this.prisma.tenantSmsTemplate.findFirst({
      where: {
        tenantId,
        templateId: normalizedTemplateId,
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
      this.logger.warn(
        `Unable to resolve opt-out SMS template "${normalizedTemplateId}" for tenant ${tenantId}`,
      );
      return null;
    }

    return {
      id: template.templateId,
      name: template.templateName,
      content: template.content,
      raw: template,
    };
  }

  private normalizeExecutionInput(input: ExecuteOptOutInput): NormalizedExecutionInput {
    const tenantId = input.tenantId?.trim();
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }

    const requesterPhoneNumber = this.normalizePhoneNumber(
      input.requesterPhoneNumber,
      'requesterPhoneNumber',
    );
    const targetPhoneNumber =
      'targetPhoneNumber' in input && typeof input.targetPhoneNumber === 'string'
        ? this.normalizePhoneNumber(input.targetPhoneNumber, 'targetPhoneNumber')
        : requesterPhoneNumber;
    const sourceType = input.sourceType?.trim();

    if (!sourceType) {
      throw new BadRequestException('sourceType is required');
    }

    return {
      tenantId,
      branchId: input.branchId?.trim() || null,
      entryDid: input.entryDid ? input.entryDid.replace(/\D/g, '') : null,
      requesterPhoneNumber,
      targetPhoneNumber,
      sourceType,
      smsTemplateId: input.smsTemplateId?.trim() || null,
    };
  }

  private normalizePhoneNumber(value: string, fieldName: string) {
    const normalized = value?.replace(/\D/g, '') ?? '';
    if (!/^\d{8,16}$/.test(normalized)) {
      throw new BadRequestException(`${fieldName} must contain 8 to 16 digits`);
    }
    return normalized;
  }

  private buildExactWhere(tenantId: string, phoneNumber: string) {
    return {
      tenantId_matchType_phoneNumber: {
        tenantId,
        matchType: 'EXACT',
        phoneNumber,
      },
    };
  }

  private async registerExistingEntry(
    where: {
      tenantId_matchType_phoneNumber: {
        tenantId: string;
        matchType: string;
        phoneNumber: string;
      };
    },
    existing: BlocklistEntryRecord,
    normalized: NormalizedExecutionInput,
  ) {
    if (!this.isOptOutManagedSourceType(existing.sourceType)) {
      if (existing.isActive === false) {
        return this.prisma.asteriskBlocklistEntry.update({
          where,
          data: {
            isActive: true,
            requesterPhoneNumber: normalized.requesterPhoneNumber,
            normalizedRequesterPhone: normalized.requesterPhoneNumber,
            normalizedPhoneNumber: normalized.targetPhoneNumber,
            branchId: normalized.branchId,
            entryDid: normalized.entryDid,
          },
        } as any);
      }

      return existing;
    }

    return this.prisma.asteriskBlocklistEntry.update({
      where,
      data: {
        requesterPhoneNumber: normalized.requesterPhoneNumber,
        normalizedPhoneNumber: normalized.targetPhoneNumber,
        normalizedRequesterPhone: normalized.requesterPhoneNumber,
        sourceType: normalized.sourceType,
        branchId: normalized.branchId,
        entryDid: normalized.entryDid,
        description: null,
        isActive: true,
      } as any,
    });
  }

  private async createBlocklistEntry(
    where: {
      tenantId_matchType_phoneNumber: {
        tenantId: string;
        matchType: string;
        phoneNumber: string;
      };
    },
    normalized: NormalizedExecutionInput,
  ) {
    try {
      return await this.prisma.asteriskBlocklistEntry.create({
        data: {
          tenantId: normalized.tenantId,
          matchType: 'EXACT',
          phoneNumber: normalized.targetPhoneNumber,
          requesterPhoneNumber: normalized.requesterPhoneNumber,
          normalizedPhoneNumber: normalized.targetPhoneNumber,
          normalizedRequesterPhone: normalized.requesterPhoneNumber,
          sourceType: normalized.sourceType,
          branchId: normalized.branchId,
          entryDid: normalized.entryDid,
          description: null,
          isActive: true,
        } as any,
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      const existing = await this.prisma.asteriskBlocklistEntry.findUnique({ where }) as BlocklistEntryRecord | null;
      if (!existing) {
        throw error;
      }

      return this.registerExistingEntry(where, existing, normalized);
    }
  }

  private isOptOutManagedSourceType(sourceType?: string | null) {
    return typeof sourceType === 'string' && sourceType.startsWith('OPT_OUT_');
  }

  private isUniqueConstraintError(error: unknown) {
    return typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: string }).code === 'P2002';
  }

  private isRuntimeReactivatedManualEntry(
    entry: BlocklistEntryRecord,
    normalized: NormalizedExecutionInput,
  ) {
    return entry.isActive !== false
      && entry.normalizedRequesterPhone === normalized.requesterPhoneNumber
      && (entry.branchId ?? null) === normalized.branchId
      && (entry.entryDid ?? null) === normalized.entryDid
      && (entry.normalizedPhoneNumber ?? entry.phoneNumber) === normalized.targetPhoneNumber;
  }

  private parseSmsTemplates(value: unknown): ResolvedOptOutSmsTemplate[] {
    if (!value) {
      return [];
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return [];
      }

      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
          return this.parseSmsTemplates(JSON.parse(trimmed));
        } catch {
          return trimmed
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
            .map((item) => ({ id: item, name: item, content: null, raw: item }));
        }
      }

      return trimmed
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => ({ id: item, name: item, content: null, raw: item }));
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => this.normalizeSmsTemplate(item))
        .filter((item): item is ResolvedOptOutSmsTemplate => item !== null);
    }

    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;

      if (Array.isArray(record.templates)) {
        return this.parseSmsTemplates(record.templates);
      }

      return Object.entries(record)
        .map(([key, item]) => this.normalizeSmsTemplate(item, key))
        .filter((template): template is ResolvedOptOutSmsTemplate => template !== null);
    }

    return [];
  }

  private normalizeSmsTemplate(
    value: unknown,
    fallbackId?: string,
  ): ResolvedOptOutSmsTemplate | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }

      return {
        id: fallbackId ?? trimmed,
        name: fallbackId ?? trimmed,
        content: fallbackId ? trimmed : null,
        raw: value,
      };
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const source = value as Record<string, unknown>;
    const id = this.pickFirstString(source.id, source.templateId, source.key, source.code, fallbackId);
    if (!id) {
      return null;
    }

    return {
      id,
      name: this.pickFirstString(source.name, source.label, source.title) ?? null,
      content: this.pickFirstString(source.content, source.body, source.text, source.message) ?? null,
      raw: value,
    };
  }

  private pickFirstString(...values: unknown[]) {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return null;
  }
}
