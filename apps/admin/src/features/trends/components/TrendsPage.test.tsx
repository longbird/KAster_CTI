import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TrendsPage } from './TrendsPage';

vi.mock('../api/trendsApi', () => ({
  fetchTrends: () => new Promise(() => {}),
  fetchQueueOptions: () => Promise.resolve([]),
}));

describe('TrendsPage', () => {
  const markup = () => renderToStaticMarkup(<TrendsPage />);

  it('네 개의 축을 모두 보여준다', () => {
    const html = markup();

    for (const title of ['호 흐름', '대기 상황', '상담원', '리소스']) {
      expect(html).toContain(title);
    }
  });

  it('기간과 해상도를 고를 수 있다', () => {
    const html = markup();

    for (const label of ['오늘', '어제', '7일', '30일', '자동', '1분', '1시간']) {
      expect(html).toContain(label);
    }
  });

  it('색을 하드코딩하지 않는다 — 다크/라이트가 같이 따라가야 한다', () => {
    // 2026-08 에 흰색을 박아 라이트 모드에서 글자가 안 보이는 사고가 있었다.
    const html = markup();

    expect(html).not.toMatch(/(fill|stroke|background)\s*:\s*#[0-9a-fA-F]{3,6}/);
    expect(html).toContain('var(--');
  });
});
