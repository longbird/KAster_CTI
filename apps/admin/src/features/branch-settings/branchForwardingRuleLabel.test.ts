import { describe, expect, it } from 'vitest';
import { formatBranchForwardingRuleLabel } from './branchForwardingRuleLabel';

describe('formatBranchForwardingRuleLabel', () => {
  it('대기 후 착신, 시간표, 재착신 조건을 한 줄 요약으로 표시한다', () => {
    expect(
      formatBranchForwardingRuleLabel({
        id: 'rule-1',
        forwardType: 'EXTERNAL_NUMBER',
        targetValue: '01012345678',
        forwardTriggerMode: 'AFTER_QUEUE_WAIT',
        queueWaitSeconds: 30,
        stickyCallbackWindowMinutes: 15,
        conditionType: 'TIME_RANGE',
        timeStart: '22:00',
        timeEnd: '06:00',
        daysOfWeek: ['mon', 'tue'],
        schedules: [
          {
            conditionType: 'TIME_RANGE',
            timeStart: '22:00',
            timeEnd: '06:00',
            daysOfWeek: ['mon', 'tue'],
          },
        ],
        did: {
          id: 'did-1',
          did: '0212345678',
          description: '대표 DID',
        },
      }),
    ).toBe(
      '02-1234-5678 → 외부 번호 010-1234-5678 · 대기 후 착신 30초 · 월, 화 22:00-06:00 · 동일 고객 15분 내 재착신',
    );
  });

  it('스마트 착신과 항상 적용 규칙을 간단히 표시한다', () => {
    expect(
      formatBranchForwardingRuleLabel({
        id: 'rule-2',
        forwardType: 'QUEUE',
        targetValue: 'support',
        forwardTriggerMode: 'SMART_NO_READY',
        queueWaitSeconds: null,
        stickyCallbackWindowMinutes: null,
        conditionType: 'ALWAYS',
        timeStart: null,
        timeEnd: null,
        daysOfWeek: [],
        schedules: [{ conditionType: 'ALWAYS', timeStart: null, timeEnd: null, daysOfWeek: [] }],
        did: {
          id: 'did-2',
          did: '0311112222',
          description: null,
        },
      }),
    ).toBe('031-111-2222 → 호 분배룰 support · 대기 상담원 없을 때 착신 · 항상 적용');
  });
});
