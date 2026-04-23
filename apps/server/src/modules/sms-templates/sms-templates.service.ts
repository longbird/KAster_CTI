import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { CreateSmsTemplateDto } from './dto/create-sms-template.dto';
import { ListSmsTemplatesQueryDto } from './dto/list-sms-templates.query.dto';
import { UpdateSmsTemplateDto } from './dto/update-sms-template.dto';

@Injectable()
export class SmsTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: ListSmsTemplatesQueryDto) {
    const keyword = query.keyword?.trim();
    const where: Prisma.tenantSmsTemplateWhereInput = {
      tenantId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive === 'true' }),
      ...(keyword
        ? {
            OR: [
              { templateName: { contains: keyword, mode: 'insensitive' } },
              { content: { contains: keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.tenantSmsTemplate.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  async create(tenantId: string, dto: CreateSmsTemplateDto) {
    await this.ensureUniqueName(tenantId, dto.templateName);

    return this.prisma.tenantSmsTemplate.create({
      data: {
        tenantId,
        templateName: dto.templateName.trim(),
        category: dto.category,
        content: dto.content.trim(),
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(tenantId: string, templateId: string, dto: UpdateSmsTemplateDto) {
    const current = await this.prisma.tenantSmsTemplate.findFirst({
      where: { tenantId, templateId },
    });

    if (!current) {
      throw new NotFoundException('문자 템플릿을 찾을 수 없습니다.');
    }

    if (dto.templateName && dto.templateName.trim() !== current.templateName) {
      await this.ensureUniqueName(tenantId, dto.templateName, templateId);
    }

    return this.prisma.tenantSmsTemplate.update({
      where: { templateId },
      data: {
        ...(dto.templateName === undefined ? {} : { templateName: dto.templateName.trim() }),
        ...(dto.category === undefined ? {} : { category: dto.category }),
        ...(dto.content === undefined ? {} : { content: dto.content.trim() }),
        ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
      },
    });
  }

  async remove(tenantId: string, templateId: string) {
    const current = await this.prisma.tenantSmsTemplate.findFirst({
      where: { tenantId, templateId },
      select: { templateId: true },
    });

    if (!current) {
      throw new NotFoundException('문자 템플릿을 찾을 수 없습니다.');
    }

    await this.prisma.tenantSmsTemplate.delete({ where: { templateId } });
    return { deleted: true, templateId };
  }

  private async ensureUniqueName(tenantId: string, templateName: string, excludeTemplateId?: string) {
    const existing = await this.prisma.tenantSmsTemplate.findFirst({
      where: {
        tenantId,
        templateName: templateName.trim(),
        ...(excludeTemplateId ? { templateId: { not: excludeTemplateId } } : {}),
      },
      select: { templateId: true },
    });

    if (existing) {
      throw new BadRequestException('같은 이름의 문자 템플릿이 이미 존재합니다.');
    }
  }
}
