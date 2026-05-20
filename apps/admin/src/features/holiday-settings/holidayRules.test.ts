import { describe, expect, it } from 'vitest';
import { getHolidayDateLabel, getHolidayScopeLabel, type HolidayRuleRow } from './holidayRules';

describe('holidayRules helpers', () => {
  it('공휴일 규칙 적용 범위를 표시한다', () => {
    expect(getHolidayScopeLabel({ branchId: null } as HolidayRuleRow, [])).toBe('전체 지사');
    expect(
      getHolidayScopeLabel({ branchId: 'branch-1' } as HolidayRuleRow, [
        { branchId: 'branch-1', branchName: '강남점' },
      ]),
    ).toBe('강남점');
  });

  it('반복 공휴일과 특정일 규칙 날짜를 구분해 표시한다', () => {
    expect(getHolidayDateLabel({ ruleType: 'ANNUAL', monthDay: '05-05' } as HolidayRuleRow)).toBe('매년 05-05');
    expect(getHolidayDateLabel({ ruleType: 'DATE', holidayDate: '2026-05-05' } as HolidayRuleRow)).toBe('2026-05-05');
    expect(getHolidayDateLabel({ ruleType: 'WORKDAY_OVERRIDE', holidayDate: '2026-05-06' } as HolidayRuleRow)).toBe(
      '임시 영업일 2026-05-06',
    );
  });
});
