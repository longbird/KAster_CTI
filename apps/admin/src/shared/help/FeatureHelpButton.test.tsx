import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FeatureHelpButton } from './FeatureHelpButton';

describe('FeatureHelpButton', () => {
  it('aria-label 에 기능명을 포함한다', () => {
    const html = renderToStaticMarkup(
      <FeatureHelpButton featureKey="system.timeSync" featureName="시간 동기화 상태" />,
    );
    expect(html).toContain('aria-label="도움말 보기: 시간 동기화 상태"');
  });

  it('초기 렌더에 Drawer 가 닫혀 있어 본문이 마크업에 없다', () => {
    const html = renderToStaticMarkup(
      <FeatureHelpButton featureKey="system.timeSync" featureName="시간 동기화 상태" />,
    );
    expect(html).not.toContain('마지막 갱신일');
  });
});
