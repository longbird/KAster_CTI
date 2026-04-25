import { describe, expect, it } from 'vitest';
import { mapDashboardPayload } from './dashboardApi';

describe('mapDashboardPayload', () => {
  it('uses queue waiting for call KPI and unique agent status distribution for available agent KPI', () => {
    const dashboard = mapDashboardPayload(
      {
        queues: [
          { queueName: 'support', waiting: 0, talking: 0, available: 4 },
        ],
        agentStatusDistribution: {
          AVAILABLE: 1,
          TALKING: 0,
        },
        today: { answered: 0, abandoned: 0 },
        teams: [],
        traffic: [],
        alerts: [],
        generatedAt: '2026-04-24T00:00:00.000Z',
      },
      [],
    );

    expect(dashboard.kpis).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'waiting', label: '대기 콜', value: '0' }),
        expect.objectContaining({ key: 'idle-agents', label: '대기 상담원', value: '1' }),
      ]),
    );
    expect(dashboard.kpis.map((kpi) => kpi.key)).toEqual(['waiting', 'live', 'idle-agents', 'today', 'abandon']);
    expect(dashboard.agentStatuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ statusCode: 'AVAILABLE', label: '대기', count: 1 }),
        expect.objectContaining({ statusCode: 'TALKING', label: '통화', count: 0 }),
      ]),
    );
    expect(dashboard.teams).toEqual([]);
  });
});
