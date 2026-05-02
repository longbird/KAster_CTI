import type { KpiItem } from '../types/dashboard';

// v2 Operator — adm-kpis hairline-divided grid.
// Trend color: up → signal (more of good is good), down → accent-warn, flat → fg-3.
const TREND_COLOR: Record<KpiItem['trend'], string> = {
  up: 'var(--signal)',
  down: 'var(--accent-warn)',
  flat: 'var(--fg-3)',
};

export function KpiCards({ items }: { items: KpiItem[] }) {
  const cols = items.length > 0 ? Math.min(items.length, 6) : 1;
  return (
    <div className="adm-kpis" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {items.map((item) => (
        <div className="adm-kpi" key={item.key}>
          <div className="adm-kpi-label">
            <span>{item.label}</span>
            <span className="k-mono" style={{ color: TREND_COLOR[item.trend] }}>
              {item.delta}
            </span>
          </div>
          <div className="adm-kpi-value">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
