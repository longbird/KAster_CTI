export const DISTRIBUTION_MODES = ['SEQUENTIAL', 'DISTRIBUTE', 'UNCONDITIONAL'] as const;
export type DistributionMode = (typeof DISTRIBUTION_MODES)[number];

/** DISTRIBUTE 모드에서 허용되는 PBX 분배 전략. */
const ADVANCED_QUEUE_STRATEGIES = ['rrmemory', 'leastrecent', 'fewestcalls', 'random'] as const;

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
