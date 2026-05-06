import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AdminDashboardPage } from './AdminDashboardPage';

vi.mock('../hooks/useDashboardData', () => ({
  useDashboardData: () => ({
    loading: false,
    refreshing: false,
    error: undefined,
    data: {
      updatedAt: '2026-05-05T14:30:00.000Z',
      kpis: [
        { key: 'waiting', label: '대기', value: 3, delta: '+1', trend: 'up' },
        { key: 'answerRate', label: '응답률', value: '92%', delta: '-2%', trend: 'down' },
      ],
      alerts: [],
      activeCalls: [],
      queues: [],
      agentStatuses: [],
      traffic: [],
    },
  }),
}));

vi.mock('../../../shared/branches/BranchFilterSelect', () => ({
  BranchFilterSelect: () => <div className="branch-filter-select">지점 필터</div>,
}));

vi.mock('../../monitoring/components/InfraStatusBar', () => ({
  InfraStatusBar: () => <div className="infra-status-bar">API OK</div>,
}));

describe('AdminDashboardPage layout', () => {
  it('renders the operations-room header for live monitoring', () => {
    const html = renderToStaticMarkup(<AdminDashboardPage />);

    expect(html).toContain('ops-room');
    expect(html).toContain('ops-room__bar');
    expect(html).toContain('콜센터 운영 대시보드');
    expect(html).toContain('API OK');
  });
});
