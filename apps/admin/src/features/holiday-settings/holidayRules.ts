export type HolidayRuleType = 'DATE' | 'ANNUAL' | 'WORKDAY_OVERRIDE';

export interface HolidayRuleRow {
  holidayRuleId: string;
  branchId?: string | null;
  ruleName: string;
  ruleType: HolidayRuleType;
  holidayDate?: string | null;
  monthDay?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface HolidayBranchOption {
  branchId: string;
  branchName: string;
  isActive?: boolean;
}

export interface HolidayRulePayload {
  branchId?: string | null;
  ruleName: string;
  ruleType: HolidayRuleType;
  holidayDate?: string | null;
  monthDay?: string | null;
  isActive?: boolean;
}

export const HOLIDAY_RULE_TYPE_LABELS: Record<HolidayRuleType, string> = {
  DATE: '특정일 휴무',
  ANNUAL: '매년 반복',
  WORKDAY_OVERRIDE: '임시 영업일',
};

export function getHolidayScopeLabel(row: Pick<HolidayRuleRow, 'branchId'>, branches: HolidayBranchOption[]) {
  if (!row.branchId) return '전체 지사';
  return branches.find((branch) => branch.branchId === row.branchId)?.branchName ?? `지사 ${row.branchId}`;
}

export function getHolidayDateLabel(
  row: Pick<HolidayRuleRow, 'ruleType' | 'holidayDate' | 'monthDay'>,
) {
  if (row.ruleType === 'ANNUAL') {
    return row.monthDay ? `매년 ${row.monthDay}` : '매년 반복';
  }

  if (row.ruleType === 'WORKDAY_OVERRIDE') {
    return row.holidayDate ? `임시 영업일 ${row.holidayDate}` : '임시 영업일';
  }

  return row.holidayDate ?? '-';
}

