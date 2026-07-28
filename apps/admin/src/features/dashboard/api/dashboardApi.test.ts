import { describe, expect, it, vi } from 'vitest';
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

  it('maps queue virtual buffer over-threshold calls to the dashboard breach count', () => {
    const dashboard = mapDashboardPayload(
      {
        queues: [
          {
            queueName: 'sales',
            queueDisplayName: '영업',
            waiting: 3,
            talking: 1,
            available: 2,
            longestWaitSeconds: 90,
            recentAnswered: 7,
            recentAbandoned: 3,
            virtualBuffer: {
              waitingCalls: 3,
              longestWaitSeconds: 90,
              overThresholdCalls: 2,
              status: 'OVER_THRESHOLD',
            },
          },
        ],
        agentStatusDistribution: {},
        today: { answered: 0, abandoned: 0 },
        teams: [],
        traffic: [],
        alerts: [],
        generatedAt: '2026-05-20T00:00:00.000Z',
      },
      [],
    );

    expect(dashboard.queues[0]).toEqual(
      expect.objectContaining({
        queueName: '영업',
        slaBreached: 2,
        virtualBuffer: {
          waitingCalls: 3,
          longestWaitSeconds: 90,
          overThresholdCalls: 2,
          status: 'OVER_THRESHOLD',
        },
      }),
    );
  });
});

describe('fetchDashboardData', () => {
  it('loads dashboard data from the backend APIs', async () => {
    vi.resetModules();
    const get = vi.fn((url: string) => {
      if (url === '/admin/dashboard') {
        return Promise.resolve({
          data: {
            data: {
              queues: [{ queueName: 'support', waiting: 2, talking: 1, available: 3 }],
              agentStatusDistribution: { AVAILABLE: 3 },
              today: { answered: 7, abandoned: 1 },
              teams: [],
              traffic: [],
              alerts: [],
              generatedAt: '2026-07-28T00:00:00.000Z',
            },
          },
        });
      }
      return Promise.resolve({
        data: {
          data: [{ callId: 'call-1', queueName: 'support', ani: '01012345678', sessionStatus: 'TALKING' }],
        },
      });
    });
    vi.doMock('../../../shared/lib/apiClient', () => ({ apiClient: { get } }));

    const { fetchDashboardData } = await import('./dashboardApi');
    const data = await fetchDashboardData('branch-1');

    expect(get).toHaveBeenCalledWith('/admin/dashboard', { params: { branchId: 'branch-1' } });
    expect(get).toHaveBeenCalledWith('/calls/active', { params: { branchId: 'branch-1', limit: 500 } });
    expect(data.kpis).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'waiting', value: '2' }),
      expect.objectContaining({ key: 'today', value: '7' }),
    ]));
    expect(data.activeCalls).toEqual([
      expect.objectContaining({ id: 'call-1', customerPhone: '01012345678' }),
    ]);
  });
});
