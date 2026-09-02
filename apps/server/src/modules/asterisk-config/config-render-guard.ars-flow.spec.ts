import { findConfigRenderRegression } from './config-render-guard';

const HEALTHY_PJSIP = '[1001-auth]\ntype=auth\n';
const HEALTHY_AGENT = '[agent-phone-1001]\nexten => s,1,NoOp()\n';

function base(overrides: Record<string, unknown> = {}) {
  return {
    expectedAgentCount: 1,
    renderedPjsip: HEALTHY_PJSIP,
    renderedAgentDialplan: HEALTHY_AGENT,
    ...overrides,
  } as any;
}

describe('ARS 플로우 렌더 가드', () => {
  describe('8. 플로우 컨텍스트 누락', () => {
    it('플로우가 걸린 DID 가 있는데 컨텍스트가 없으면 막는다', () => {
      const reason = findConfigRenderRegression(base({
        expectedArsFlowSlugs: ['main-flow'],
        renderedExtensionsQueue: '[queue-entry]\n',
      }));

      expect(reason).toMatch(/ARS 플로우/);
      expect(reason).toContain('main-flow');
    });

    it('컨텍스트가 다 있으면 통과한다', () => {
      const reason = findConfigRenderRegression(base({
        expectedArsFlowSlugs: ['main-flow'],
        renderedExtensionsQueue: '[queue-entry]\n\n[ars-flow-main-flow]\nexten => s,1,NoOp()\n',
      }));

      expect(reason).toBeNull();
    });

    it('여러 플로우 중 하나만 빠져도 막는다', () => {
      const reason = findConfigRenderRegression(base({
        expectedArsFlowSlugs: ['main-flow', 'night-flow'],
        renderedExtensionsQueue: '[ars-flow-main-flow]\n',
      }));

      expect(reason).toContain('night-flow');
    });

    it('플로우를 쓰지 않는 사이트는 이 검사를 지나간다', () => {
      expect(findConfigRenderRegression(base({ expectedArsFlowSlugs: [] }))).toBeNull();
      expect(findConfigRenderRegression(base())).toBeNull();
    });
  });

  describe('9. 렌더 결과 축소', () => {
    // 2026-08-24 pjsip 사고와 같은 유형이다. 파일이 비어 있지 않아도 통화가 끊긴다.
    it('직전 적용본보다 크게 줄면 막는다', () => {
      const reason = findConfigRenderRegression(base({
        renderedExtensionsInbound: 'x'.repeat(300),
        previousExtensionsInbound: 'x'.repeat(1000),
      }));

      expect(reason).toMatch(/줄었다|축소/);
    });

    it('조금 줄어드는 것은 정상 변경으로 본다', () => {
      const reason = findConfigRenderRegression(base({
        renderedExtensionsInbound: 'x'.repeat(950),
        previousExtensionsInbound: 'x'.repeat(1000),
      }));

      expect(reason).toBeNull();
    });

    it('늘어나는 것은 막지 않는다', () => {
      const reason = findConfigRenderRegression(base({
        renderedExtensionsInbound: 'x'.repeat(5000),
        previousExtensionsInbound: 'x'.repeat(1000),
      }));

      expect(reason).toBeNull();
    });

    it('직전 적용본을 모르면(최초 적용) 이 검사를 건너뛴다', () => {
      const reason = findConfigRenderRegression(base({
        renderedExtensionsInbound: 'x'.repeat(10),
        previousExtensionsInbound: null,
      }));

      expect(reason).toBeNull();
    });

    it('직전이 비어 있었으면 비교하지 않는다', () => {
      const reason = findConfigRenderRegression(base({
        renderedExtensionsInbound: 'x'.repeat(10),
        previousExtensionsInbound: '',
      }));

      expect(reason).toBeNull();
    });
  });

  it('기존 내선 검사는 그대로 동작한다', () => {
    const reason = findConfigRenderRegression({
      expectedAgentCount: 3,
      renderedPjsip: '[global]\n',
      renderedAgentDialplan: '[from-queue]\n',
    });

    expect(reason).toMatch(/내선이 하나도 없다/);
  });
});
