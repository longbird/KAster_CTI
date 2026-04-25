import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentStatusSummaryTable } from './AgentStatusSummaryTable';

describe('AgentStatusSummaryTable', () => {
  it('labels the table as agent status summary instead of team or queue status', () => {
    const html = renderToStaticMarkup(
      <AgentStatusSummaryTable
        compact
        items={[
          { statusCode: 'AVAILABLE', label: '대기', count: 1 },
          { statusCode: 'TALKING', label: '통화', count: 0 },
        ]}
      />,
    );

    expect(html).toContain('상담원 상태 현황');
    expect(html).toContain('대기');
    expect(html).toContain('통화');
    expect(html).not.toContain('팀별 상담원 현황');
    expect(html).not.toContain('큐');
  });
});
