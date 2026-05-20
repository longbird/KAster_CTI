import { describe, expect, it } from 'vitest';
import { getDistributionRuleLabels } from './agentGroupDistributionRules';

describe('getDistributionRuleLabels', () => {
  it('연결된 호 분배룰 표시명을 만든다', () => {
    expect(
      getDistributionRuleLabels([
        { queueId: 'queue-1', queueName: 'sales', queueDisplayName: '영업 대표' },
        { queueId: 'queue-2', queueName: 'support', queueDisplayName: null },
      ]),
    ).toEqual(['영업 대표', 'support']);
  });

  it('연결된 호 분배룰이 없으면 빈 목록을 반환한다', () => {
    expect(getDistributionRuleLabels(undefined)).toEqual([]);
  });
});
