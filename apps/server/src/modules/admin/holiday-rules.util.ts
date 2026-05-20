export type HolidayRuleType = 'DATE' | 'ANNUAL' | 'WORKDAY_OVERRIDE';

export interface HolidayRuleLike {
  ruleType: HolidayRuleType | string;
  holidayDate?: string | null;
  monthDay?: string | null;
  branchId?: string | null;
  isActive?: boolean;
  ruleName?: string | null;
}

export interface HolidayDecision {
  isHoliday: boolean;
  isWorkdayOverride: boolean;
  matchedRuleName: string | null;
  source: 'BRANCH' | 'TENANT' | null;
}

export function resolveHolidayDecision(
  rules: HolidayRuleLike[],
  input: { date: string; branchId?: string | null },
): HolidayDecision {
  const monthDay = input.date.slice(5, 10);
  const matching = rules
    .filter((rule) => rule.isActive !== false)
    .filter((rule) => {
      if (rule.branchId && rule.branchId !== input.branchId) return false;
      if (rule.ruleType === 'ANNUAL') return rule.monthDay === monthDay;
      return rule.holidayDate === input.date;
    })
    .sort((a, b) => rulePriority(b, input.branchId) - rulePriority(a, input.branchId));

  const matched = matching[0];
  if (!matched) {
    return { isHoliday: false, isWorkdayOverride: false, matchedRuleName: null, source: null };
  }

  const isWorkdayOverride = matched.ruleType === 'WORKDAY_OVERRIDE';
  return {
    isHoliday: !isWorkdayOverride,
    isWorkdayOverride,
    matchedRuleName: matched.ruleName ?? null,
    source: matched.branchId ? 'BRANCH' : 'TENANT',
  };
}

function rulePriority(rule: HolidayRuleLike, branchId?: string | null) {
  const isBranchRule = !!branchId && rule.branchId === branchId;
  const isOverride = rule.ruleType === 'WORKDAY_OVERRIDE';
  if (isBranchRule && isOverride) return 4;
  if (isBranchRule) return 3;
  if (isOverride) return 2;
  return 1;
}
