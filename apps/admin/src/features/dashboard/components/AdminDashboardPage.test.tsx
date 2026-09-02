import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AdminDashboardPage } from './AdminDashboardPage';

const state = { refreshing: false, error: undefined as string | undefined };

vi.mock('../hooks/useDashboardData', () => ({
  useDashboardData: () => ({
    loading: false,
    refreshing: state.refreshing,
    error: state.error,
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

function renderWith(refreshing: boolean): string {
  state.refreshing = refreshing;
  return renderToStaticMarkup(<AdminDashboardPage />);
}

function countSpaceItems(html: string): number {
  return (html.match(/ant-space-item/g) ?? []).length;
}

describe('AdminDashboardPage layout', () => {
  it('renders the operations-room header for live monitoring', () => {
    const html = renderWith(false);

    expect(html).toContain('ops-room');
    expect(html).toContain('ops-room__bar');
    expect(html).toContain('콜센터 운영 대시보드');
    expect(html).toContain('API OK');
  });

  it('갱신 표시 자리를 항상 잡아 둔다', () => {
    expect(renderWith(false)).toContain('ops-room__refresh');
    expect(renderWith(true)).toContain('ops-room__refresh');
  });

  /**
   * 5초마다 도는 갱신에서 헤더 항목 수가 바뀌면 그 줄이 통째로 흔들린다.
   * `.ant-space-item:last-child { margin-left: auto }` 규칙 때문에 마지막 항목이
   * 바뀌면 오른쪽 끝으로 밀리는 대상까지 달라져 눈에 띄게 튄다.
   */
  it('갱신 중에도 헤더 항목 수가 그대로다 — 5초마다 줄이 흔들리지 않는다', () => {
    expect(countSpaceItems(renderWith(true))).toBe(countSpaceItems(renderWith(false)));
  });

  // `ant-spin` 만으로는 안 된다 — 표의 `ant-spin-nested-loading` 래퍼에도 걸린다.
  it('갱신 중일 때만 회전 표시를 그린다', () => {
    expect(renderWith(true)).toContain('ant-spin-dot');
    expect(renderWith(false)).not.toContain('ant-spin-dot');
  });
});
