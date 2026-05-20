import { resolveHolidayDecision } from '../src/modules/admin/holiday-rules.util';

describe('resolveHolidayDecision', () => {
  it('공휴일은 일반 업무시간보다 우선 적용된다', () => {
    const result = resolveHolidayDecision(
      [
        {
          ruleType: 'DATE',
          holidayDate: '2026-05-05',
          monthDay: null,
          branchId: null,
          isActive: true,
          ruleName: '어린이날',
        },
      ],
      { date: '2026-05-05' },
    );

    expect(result).toEqual({
      isHoliday: true,
      isWorkdayOverride: false,
      matchedRuleName: '어린이날',
      source: 'TENANT',
    });
  });

  it('지사 임시 영업일은 테넌트 기본 공휴일보다 우선한다', () => {
    const result = resolveHolidayDecision(
      [
        {
          ruleType: 'ANNUAL',
          holidayDate: null,
          monthDay: '05-05',
          branchId: null,
          isActive: true,
          ruleName: '테넌트 휴일',
        },
        {
          ruleType: 'WORKDAY_OVERRIDE',
          holidayDate: '2026-05-05',
          monthDay: null,
          branchId: 'branch-1',
          isActive: true,
          ruleName: '지사 임시 영업',
        },
      ],
      { date: '2026-05-05', branchId: 'branch-1' },
    );

    expect(result).toEqual({
      isHoliday: false,
      isWorkdayOverride: true,
      matchedRuleName: '지사 임시 영업',
      source: 'BRANCH',
    });
  });
});
