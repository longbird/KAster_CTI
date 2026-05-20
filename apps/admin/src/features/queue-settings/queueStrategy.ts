export const QUEUE_STRATEGY_OPTIONS = [
  { value: 'rrmemory', label: '순차 분배(이력 유지)' },
  { value: 'leastrecent', label: '최근 미수신 우선' },
  { value: 'fewestcalls', label: '최소 응대한 상담원 우선' },
  { value: 'random', label: '무작위 분배' },
  { value: 'linear', label: '고정 순서 분배' },
];

const STRATEGY_LABEL_MAP = Object.fromEntries(
  QUEUE_STRATEGY_OPTIONS.map((item) => [item.value, item.label]),
) as Record<string, string>;

export function getQueueStrategyLabel(strategy?: string | null) {
  if (!strategy) return '-';
  return STRATEGY_LABEL_MAP[strategy] ?? strategy;
}

export const DISTRIBUTION_MODE_OPTIONS = [
  { value: 'SEQUENTIAL', label: '순차 착신' },
  { value: 'DISTRIBUTE', label: '분배 착신' },
  { value: 'UNCONDITIONAL', label: '무조건 착신' },
];

export const UNCONDITIONAL_TARGET_TYPE_OPTIONS = [
  { value: 'AGENT', label: '상담원' },
  { value: 'QUEUE', label: '분배룰' },
  { value: 'EXTERNAL_NUMBER', label: '외부번호' },
];

const DISTRIBUTION_MODE_LABEL_MAP = Object.fromEntries(
  DISTRIBUTION_MODE_OPTIONS.map((item) => [item.value, item.label]),
) as Record<string, string>;

export function getDistributionModeLabel(mode?: string | null) {
  if (!mode) return '분배 착신';
  return DISTRIBUTION_MODE_LABEL_MAP[mode] ?? mode;
}

const UNCONDITIONAL_TARGET_TYPE_LABEL_MAP = Object.fromEntries(
  UNCONDITIONAL_TARGET_TYPE_OPTIONS.map((item) => [item.value, item.label]),
) as Record<string, string>;

export function getUnconditionalTargetTypeLabel(type?: string | null) {
  if (!type) return '-';
  return UNCONDITIONAL_TARGET_TYPE_LABEL_MAP[type] ?? type;
}
