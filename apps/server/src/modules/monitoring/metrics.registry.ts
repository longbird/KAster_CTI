import { Registry, collectDefaultMetrics } from 'prom-client';

export const METRICS_REGISTRY = 'METRICS_REGISTRY';

export function createMetricsRegistry(): Registry {
  const registry = new Registry();

  collectDefaultMetrics({
    register: registry,
    prefix: 'cti_',
  });

  return registry;
}
