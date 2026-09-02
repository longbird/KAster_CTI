import { AdminService } from '../src/modules/admin/admin.service';

function createService() {
  const prisma = {
    tenantHolidayRules: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  } as any;

  return {
    prisma,
    service: new AdminService(
      prisma,
      {} as any,
      { executeReload: jest.fn() } as any,
      {} as any,
      {} as any,
      { publish: jest.fn() } as any,
      { listForTenant: jest.fn().mockResolvedValue({}) } as any,
    ),
  };
}

describe('AdminService holiday rules', () => {
  it('테넌트 기본과 지정 지사 공휴일을 함께 조회한다', async () => {
    const { prisma, service } = createService();
    prisma.tenantHolidayRules.findMany.mockResolvedValue([
      { holidayRuleId: 'tenant-rule', branchId: null, ruleName: '공통 휴일' },
      { holidayRuleId: 'branch-rule', branchId: 'branch-1', ruleName: '지사 휴일' },
    ]);

    const result = await service.listHolidayRules('tenant-1', 'branch-1');

    expect(prisma.tenantHolidayRules.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        OR: [{ branchId: null }, { branchId: 'branch-1' }],
      },
      orderBy: [{ branchId: 'asc' }, { holidayDate: 'asc' }, { monthDay: 'asc' }, { ruleName: 'asc' }],
    });
    expect(result).toEqual({
      success: true,
      data: [
        { holidayRuleId: 'tenant-rule', branchId: null, ruleName: '공통 휴일' },
        { holidayRuleId: 'branch-rule', branchId: 'branch-1', ruleName: '지사 휴일' },
      ],
      error: null,
    });
  });

  it('공휴일 규칙 생성 시 비활성 기본값과 날짜 필드를 정규화한다', async () => {
    const { prisma, service } = createService();
    prisma.tenantHolidayRules.create.mockResolvedValue({ holidayRuleId: 'holiday-1' });

    const result = await service.createHolidayRule('tenant-1', {
      ruleName: '어린이날',
      ruleType: 'DATE',
      holidayDate: '2026-05-05',
    } as any);

    expect(prisma.tenantHolidayRules.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        branchId: null,
        ruleName: '어린이날',
        ruleType: 'DATE',
        holidayDate: '2026-05-05',
        monthDay: null,
        isActive: true,
      },
    });
    expect(result.data).toEqual({ holidayRuleId: 'holiday-1' });
  });
});
