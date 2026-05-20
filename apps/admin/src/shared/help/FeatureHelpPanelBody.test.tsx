import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FeatureHelpPanelBody } from './FeatureHelpPanelBody';
import type { FeatureHelpEntry } from './types';

const entry: FeatureHelpEntry = {
  featureKey: 'demo.feature',
  title: '데모 기능',
  summary: '요약 문장',
  howTo: ['1단계', '2단계'],
  examples: ['예시 A'],
  warnings: ['주의 B'],
  relatedRoutes: [{ route: '/settings/branches', label: '지사 관리' }],
  sources: [
    { kind: 'manual', ref: '매뉴얼 X' },
    { kind: 'search', ref: 'https://e.com', retrievedAt: '2026-05-10' },
  ],
  reviewStatus: 'APPROVED',
  updatedAt: '2026-05-19',
};

describe('FeatureHelpPanelBody', () => {
  it('ready 면 제목/요약/howTo/주의/출처/갱신일을 렌더한다', () => {
    const html = renderToStaticMarkup(
      <FeatureHelpPanelBody resolution={{ status: 'ready', entry }} />,
    );
    expect(html).toContain('데모 기능');
    expect(html).toContain('요약 문장');
    expect(html).toContain('1단계');
    expect(html).toContain('주의 B');
    expect(html).toContain('매뉴얼 X');
    expect(html).toContain('2026-05-10');
    expect(html).toContain('2026-05-19');
  });

  it('draft-pending 이면 검토 대기 메시지를 렌더한다', () => {
    const html = renderToStaticMarkup(
      <FeatureHelpPanelBody resolution={{ status: 'draft-pending' }} />,
    );
    expect(html).toContain('검토 대기');
  });

  it('missing 이면 준비 중 메시지를 렌더한다', () => {
    const html = renderToStaticMarkup(
      <FeatureHelpPanelBody resolution={{ status: 'missing' }} />,
    );
    expect(html).toContain('준비 중');
  });
});
