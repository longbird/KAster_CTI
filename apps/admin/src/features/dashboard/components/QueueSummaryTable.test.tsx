import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { QueueSummaryTable } from './QueueSummaryTable';

describe('QueueSummaryTable', () => {
  it('keeps the compact dashboard table within the card width by rendering only core columns', () => {
    const html = renderToStaticMarkup(
      <QueueSummaryTable
        compact
        items={[
          {
            queueName: '주말 심야 VIP 예약 상담 전용 큐',
            waiting: 3,
            talking: 8,
            availableAgents: 4,
            longestWaitSec: 95,
            answerRate: 92,
            abandoned: 0,
            slaBreached: 1,
          },
        ]}
      />,
    );

    expect(html).toContain('queue-summary-table');
    expect(html).toContain('queue-summary-table__table');
    expect(html).toContain('ant-table-cell-ellipsis');
    expect(html).not.toContain('width:156px');
    expect(html).toContain('width:160px');
    expect(html).toContain('width:40px');
    expect(html).toContain('width:58px');
    expect(html).toContain('>큐<');
    expect(html).toContain('>대기<');
    expect(html).toContain('>통화<');
    expect(html).toContain('>최장<');
    expect(html).not.toContain('>SLA<');
    expect(html).not.toContain('>초과<');
  });
});
