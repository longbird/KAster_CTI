import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConsultCategoriesService } from './consult-categories.service';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const PARENT_ID = '00000000-0000-0000-0000-0000000000p1'.replace('p', 'b');
const CATEGORY_ID = '00000000-0000-0000-0000-0000000000c1';

function buildService(options: {
  rows?: Array<Record<string, unknown>>;
  existingCode?: Record<string, unknown> | null;
  parent?: Record<string, unknown> | null;
  current?: Record<string, unknown> | null;
  childCount?: number;
} = {}) {
  const state = { created: [] as any[], updated: [] as any[], deleted: [] as any[] };
  const prisma: any = {
    consultCategories: {
      findMany: jest.fn().mockResolvedValue(options.rows ?? []),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(options.childCount ?? 0),
      create: jest.fn().mockImplementation(async (args: any) => {
        state.created.push(args);
        return { categoryId: CATEGORY_ID, ...args.data };
      }),
      update: jest.fn().mockImplementation(async (args: any) => {
        state.updated.push(args);
        return { categoryId: CATEGORY_ID, ...args.data };
      }),
      delete: jest.fn().mockImplementation(async (args: any) => {
        state.deleted.push(args);
        return { categoryId: CATEGORY_ID };
      }),
    },
  };

  // findFirst 는 용도별로 다르게 답한다: 코드 중복 검사 / 부모 조회 / 대상 조회
  prisma.consultCategories.findFirst.mockImplementation(async (args: any) => {
    if (args.where?.code !== undefined) return options.existingCode ?? null;
    if (args.where?.categoryId === PARENT_ID) return options.parent ?? null;
    return options.current === undefined ? { categoryId: CATEGORY_ID, level: 1 } : options.current;
  });

  return { service: new ConsultCategoriesService(prisma), prisma, state };
}

describe('ConsultCategoriesService', () => {
  describe('list', () => {
    it('레벨과 정렬순으로 테넌트 분류를 준다', async () => {
      const { service, prisma } = buildService({ rows: [{ categoryId: CATEGORY_ID }] });

      const rows = await service.list(TENANT_ID);

      expect(rows).toHaveLength(1);
      expect(prisma.consultCategories.findMany.mock.calls[0][0].where).toEqual({ tenantId: TENANT_ID });
      expect(prisma.consultCategories.findMany.mock.calls[0][0].orderBy).toEqual([
        { level: 'asc' },
        { sortOrder: 'asc' },
        { name: 'asc' },
      ]);
    });

    it('비활성 제외를 요청하면 활성만 준다', async () => {
      const { service, prisma } = buildService();

      await service.list(TENANT_ID, { activeOnly: true });

      expect(prisma.consultCategories.findMany.mock.calls[0][0].where).toMatchObject({ isActive: true });
    });
  });

  describe('create', () => {
    it('대분류를 만든다', async () => {
      const { service, state } = buildService();

      await service.create(TENANT_ID, { code: 'DELIVERY', name: '배송' });

      expect(state.created[0].data).toMatchObject({
        tenantId: TENANT_ID,
        code: 'DELIVERY',
        name: '배송',
        level: 1,
        parentCategoryId: null,
      });
    });

    it('코드를 대문자로 정규화한다', async () => {
      const { service, state } = buildService();

      await service.create(TENANT_ID, { code: ' delivery ', name: '배송' });

      expect(state.created[0].data.code).toBe('DELIVERY');
    });

    it('부모가 있으면 부모 레벨 + 1 로 만든다', async () => {
      const { service, state } = buildService({ parent: { categoryId: PARENT_ID, level: 1 } });

      await service.create(TENANT_ID, { code: 'DELAY', name: '지연', parentCategoryId: PARENT_ID });

      expect(state.created[0].data.level).toBe(2);
      expect(state.created[0].data.parentCategoryId).toBe(PARENT_ID);
    });

    it('없는 부모를 지정하면 404', async () => {
      const { service } = buildService({ parent: null });

      await expect(
        service.create(TENANT_ID, { code: 'X', name: 'x', parentCategoryId: PARENT_ID }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('3단계를 넘으면 거부한다', async () => {
      const { service } = buildService({ parent: { categoryId: PARENT_ID, level: 3 } });

      await expect(
        service.create(TENANT_ID, { code: 'X', name: 'x', parentCategoryId: PARENT_ID }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('같은 테넌트에 같은 코드가 있으면 409', async () => {
      const { service } = buildService({ existingCode: { categoryId: 'other' } });

      await expect(service.create(TENANT_ID, { code: 'DELIVERY', name: '배송' }))
        .rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('이름과 정렬순, 활성 여부를 바꾼다', async () => {
      const { service, state } = buildService();

      await service.update(TENANT_ID, CATEGORY_ID, { name: '배송문의', sortOrder: 3, isActive: false });

      expect(state.updated[0].data).toEqual({ name: '배송문의', sortOrder: 3, isActive: false });
      expect(state.updated[0].where.categoryId).toBe(CATEGORY_ID);
    });

    it('없는 분류면 404', async () => {
      const { service } = buildService({ current: null });

      await expect(service.update(TENANT_ID, CATEGORY_ID, { name: 'x' }))
        .rejects.toBeInstanceOf(NotFoundException);
    });

    it('코드는 바꾸지 않는다', async () => {
      const { service, state } = buildService();

      await service.update(TENANT_ID, CATEGORY_ID, { name: 'x', code: 'NEW' } as any);

      expect(state.updated[0].data.code).toBeUndefined();
    });
  });

  describe('remove', () => {
    it('하위 분류가 없으면 삭제한다', async () => {
      const { service, state } = buildService({ childCount: 0 });

      await service.remove(TENANT_ID, CATEGORY_ID);

      expect(state.deleted[0].where.categoryId).toBe(CATEGORY_ID);
    });

    it('하위 분류가 있으면 거부한다', async () => {
      const { service } = buildService({ childCount: 2 });

      await expect(service.remove(TENANT_ID, CATEGORY_ID)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('없는 분류면 404', async () => {
      const { service } = buildService({ current: null });

      await expect(service.remove(TENANT_ID, CATEGORY_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
