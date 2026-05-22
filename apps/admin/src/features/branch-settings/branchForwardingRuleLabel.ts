import { formatPhoneNumber } from '../../shared/lib/format';

export interface BranchForwardingRuleOption {
  id: string;
  forwardType: 'EXTENSION' | 'QUEUE' | 'EXTERNAL_NUMBER';
  targetValue: string;
  forwardTriggerMode?: 'IMMEDIATE' | 'AFTER_QUEUE_WAIT' | 'SMART_NO_READY' | null;
  queueWaitSeconds?: number | null;
  stickyCallbackWindowMinutes?: number | null;
  conditionType: 'ALWAYS' | 'TIME_RANGE';
  timeStart: string | null;
  timeEnd: string | null;
  daysOfWeek: string[];
  schedules?: Array<{
    conditionType: 'ALWAYS' | 'TIME_RANGE';
    timeStart: string | null;
    timeEnd: string | null;
    daysOfWeek: string[];
  }>;
  did: {
    id: string;
    did: string;
    description?: string | null;
  };
}

const FORWARD_TYPE_LABEL: Record<BranchForwardingRuleOption['forwardType'], string> = {
  EXTENSION: '내선',
  QUEUE: '호 분배룰',
  EXTERNAL_NUMBER: '외부 번호',
};

const WEEKDAY_LABELS: Record<string, string> = {
  mon: '월',
  tue: '화',
  wed: '수',
  thu: '목',
  fri: '금',
  sat: '토',
  sun: '일',
};

function formatTarget(rule: BranchForwardingRuleOption): string {
  if (rule.forwardType === 'EXTERNAL_NUMBER') {
    return formatPhoneNumber(rule.targetValue);
  }
  return rule.targetValue;
}

function formatTrigger(rule: BranchForwardingRuleOption): string {
  if (rule.forwardTriggerMode === 'AFTER_QUEUE_WAIT') {
    return `대기시간 초과 ${rule.queueWaitSeconds ?? '-'}초`;
  }
  if (rule.forwardTriggerMode === 'SMART_NO_READY') {
    return '상담원 없음';
  }
  return '즉시';
}

function formatSchedule(rule: BranchForwardingRuleOption): string {
  const schedules = (rule.schedules && rule.schedules.length > 0
    ? rule.schedules
    : [
        {
          conditionType: rule.conditionType,
          timeStart: rule.timeStart,
          timeEnd: rule.timeEnd,
          daysOfWeek: rule.daysOfWeek,
        },
      ]
  ).filter((item) => item.conditionType === 'TIME_RANGE');

  if (schedules.length === 0) {
    return '항상 적용';
  }

  const scheduleText = schedules
    .map((schedule) => {
      const days = schedule.daysOfWeek.map((day) => WEEKDAY_LABELS[day] ?? day).join(', ');
      return `${days || '요일 미지정'} ${schedule.timeStart ?? '--:--'}-${schedule.timeEnd ?? '--:--'}`;
    })
    .join(' / ');
  return `시간 조건 ${scheduleText}`;
}

export function formatBranchForwardingRuleLabel(rule: BranchForwardingRuleOption): string {
  const parts = [
    `${formatPhoneNumber(rule.did.did)} → ${FORWARD_TYPE_LABEL[rule.forwardType]} ${formatTarget(rule)}`,
    formatTrigger(rule),
    formatSchedule(rule),
  ];

  if (rule.stickyCallbackWindowMinutes) {
    parts.push(`동일 고객 ${rule.stickyCallbackWindowMinutes}분 내 재착신`);
  }

  return parts.join(' · ');
}
