import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { MAX_CATEGORY_LEVEL } from './consult-categories.constants';

export interface CreateConsultCategoryInput {
  code: string;
  name: string;
  parentCategoryId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateConsultCategoryInput {
  name?: string;
  sortOrder?: number;
  isActive?: boolean;
}

const CATEGORY_FIELDS = {
  categoryId: true,
  parentCategoryId: true,
  level: true,
  code: true,
  name: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

/**
 * 상담분류(대-중-소). AI 분석이 통화를 여기에 배정하고, 통계는 이 분류를 축으로 집계한다.
 * 코드는 만든 뒤 바꾸지 않는다 — 이미 분석된 통화가 코드로 이 분류를 가리키고 있다.
 */
@Injectable()
export class ConsultCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, options: { activeOnly?: boolean } = {}) {
    return (this.prisma as any).consultCategories.findMany({
      where: options.activeOnly ? { tenantId, isActive: true } : { tenantId },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select: CATEGORY_FIELDS,
    });
  }

  async create(tenantId: string, input: CreateConsultCategoryInput) {
    const code = input.code.trim().toUpperCase();
    if (!code) {
      throw new BadRequestException('code is required');
    }

    const level = await this.resolveLevel(tenantId, input.parentCategoryId ?? null);

    const duplicate = await (this.prisma as any).consultCategories.findFirst({
      where: { tenantId, code },
      select: { categoryId: true },
    });
    if (duplicate) {
      throw new ConflictException(`consult category code already exists: ${code}`);
    }

    return (this.prisma as any).consultCategories.create({
      data: {
        tenantId,
        parentCategoryId: input.parentCategoryId ?? null,
        level,
        code,
        name: input.name.trim(),
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      },
      select: CATEGORY_FIELDS,
    });
  }

  async update(tenantId: string, categoryId: string, input: UpdateConsultCategoryInput) {
    await this.loadOrThrow(tenantId, categoryId);

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    return (this.prisma as any).consultCategories.update({
      where: { categoryId },
      data,
      select: CATEGORY_FIELDS,
    });
  }

  async remove(tenantId: string, categoryId: string) {
    await this.loadOrThrow(tenantId, categoryId);

    const children = await (this.prisma as any).consultCategories.count({
      where: { tenantId, parentCategoryId: categoryId },
    });
    if (children > 0) {
      throw new BadRequestException('delete child categories first');
    }

    await (this.prisma as any).consultCategories.delete({ where: { categoryId } });
    return { deleted: true, categoryId };
  }

  private async resolveLevel(tenantId: string, parentCategoryId: string | null): Promise<number> {
    if (!parentCategoryId) return 1;

    const parent = await (this.prisma as any).consultCategories.findFirst({
      where: { tenantId, categoryId: parentCategoryId },
      select: { categoryId: true, level: true },
    });
    if (!parent) {
      throw new NotFoundException('parent consult category not found');
    }

    const level = parent.level + 1;
    if (level > MAX_CATEGORY_LEVEL) {
      throw new BadRequestException(`consult category depth is limited to ${MAX_CATEGORY_LEVEL}`);
    }
    return level;
  }

  private async loadOrThrow(tenantId: string, categoryId: string) {
    const current = await (this.prisma as any).consultCategories.findFirst({
      where: { tenantId, categoryId },
      select: { categoryId: true, level: true },
    });
    if (!current) {
      throw new NotFoundException('consult category not found');
    }
    return current;
  }
}
