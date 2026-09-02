import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ArsFlowBuilderPage } from './ArsFlowBuilderPage';

/**
 * 빌더는 캔버스가 본체다. 카드가 남는 높이를 안 쓰면 아래가 통째로 빈다.
 * 높이 배분은 CSS 가 하고, 이 클래스가 그 CSS 가 붙는 자리다.
 */
describe('ArsFlowBuilderPage layout', () => {
  it('본문 높이를 다 쓰도록 카드에 레이아웃 클래스를 붙인다', () => {
    expect(renderToStaticMarkup(<ArsFlowBuilderPage />)).toContain('ars-builder');
  });
});
