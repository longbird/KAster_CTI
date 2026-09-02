import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CallCard } from './CallCard';
import type { CallRow } from '../../features/live-calls/CallDetailDrawer';

const call: CallRow = {
  callId: 'c1',
  linkedid: 'L1',
  ani: '01034623453',
  queueName: '대표',
  agentName: '홍길동',
  sessionStatus: 'TALKING',
  answeredAt: '2026-09-02T00:00:00.000Z',
};

const now = Date.parse('2026-09-02T00:00:30.000Z');

describe('CallCard 키보드 접근', () => {
  // 카드는 div 라서 onClick 만으로는 Tab 이 지나치지 않는다.
  // 대시보드에서 통화를 여는 유일한 길이라 키보드만 쓰는 사람은 열 수가 없었다.
  it.each(['full', 'mini'] as const)('%s 변형이 열 수 있으면 버튼처럼 초점을 받는다', (variant) => {
    const html = renderToStaticMarkup(
      <CallCard call={call} now={now} variant={variant} onClick={() => {}} />,
    );
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
  });

  it.each(['full', 'mini'] as const)('%s 변형이 열 곳이 없으면 초점을 받지 않는다', (variant) => {
    const html = renderToStaticMarkup(<CallCard call={call} now={now} variant={variant} />);
    expect(html).not.toContain('role="button"');
    expect(html).not.toContain('tabindex');
  });
});
