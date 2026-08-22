export const DISTRIBUTION_MODES = ['SEQUENTIAL', 'DISTRIBUTE', 'UNCONDITIONAL'] as const;
export type DistributionMode = (typeof DISTRIBUTION_MODES)[number];
export const UNCONDITIONAL_TARGET_TYPES = ['AGENT', 'QUEUE', 'EXTERNAL_NUMBER'] as const;
export type UnconditionalTargetType = (typeof UNCONDITIONAL_TARGET_TYPES)[number];

/** DISTRIBUTE 모드에서 허용되는 PBX 분배 전략. */
const ADVANCED_QUEUE_STRATEGIES = ['rrmemory', 'leastrecent', 'fewestcalls', 'random', 'ringall'] as const;

export function isDistributionMode(value: unknown): value is DistributionMode {
  return DISTRIBUTION_MODES.includes(value as DistributionMode);
}

/**
 * 외부 착신 방식 + 고급 전략 -> PBX queue strategy.
 * SEQUENTIAL/UNCONDITIONAL 은 우선순위 순서대로 1명씩 호출하므로 linear.
 */
export function resolveQueueStrategy(
  mode: DistributionMode,
  requestedStrategy = 'leastrecent',
): string {
  if (mode === 'SEQUENTIAL' || mode === 'UNCONDITIONAL') return 'linear';
  return ADVANCED_QUEUE_STRATEGIES.includes(requestedStrategy as any)
    ? requestedStrategy
    : 'leastrecent';
}

export function isUnconditionalTargetType(value: unknown): value is UnconditionalTargetType {
  return UNCONDITIONAL_TARGET_TYPES.includes(value as UnconditionalTargetType);
}

export function normalizeUnconditionalTarget(
  mode: DistributionMode,
  targetType?: string | null,
  targetValue?: string | null,
) {
  if (mode !== 'UNCONDITIONAL') {
    return {
      unconditionalTargetType: null,
      unconditionalTargetValue: null,
    };
  }

  if (!isUnconditionalTargetType(targetType)) {
    throw new Error('무조건 착신 대상 유형을 지정하세요.');
  }

  const normalizedValue =
    targetType === 'EXTERNAL_NUMBER'
      ? (targetValue ?? '').replace(/\D/g, '')
      : (targetValue ?? '').trim();

  if (!normalizedValue) {
    throw new Error('무조건 착신 대상 값을 지정하세요.');
  }

  return {
    unconditionalTargetType: targetType,
    unconditionalTargetValue: normalizedValue,
  };
}
