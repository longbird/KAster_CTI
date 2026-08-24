import { findConfigRenderRegression } from './config-render-guard';

const HEALTHY_PJSIP = `[global]
type=global

[trunk-carrier-auth]
type=auth
password=x

[3301-auth]
type=auth
password=12345678

[3301]
type=endpoint
`;

const HEALTHY_DIALPLAN = `[agent-phone-3301]
exten => _[123]XXX,1,NoOp(Internal endpoint call 3301)
`;

/** 2026-08-24 사고 당시 디스크에 실제로 남아 있던 모양: 비어 있진 않지만 내선이 없다. */
const WIPED_PJSIP = `[global]
type=global
user_agent=KAster_CTI

[transport-udp]
type=transport
bind=0.0.0.0:48950

[trunk-070-5234-6380-auth]
type=auth
password=x

[trunk-070-5234-6380]
type=endpoint
context=inbound-main
`;

describe('findConfigRenderRegression', () => {
  it('상담원이 있는데 내선이 통째로 사라진 렌더는 막는다', () => {
    const reason = findConfigRenderRegression({
      expectedAgentCount: 7,
      renderedPjsip: WIPED_PJSIP,
      renderedAgentDialplan: '[from-queue]\nexten => _X.,1,NoOp()\n',
    });

    expect(reason).toContain('7명');
    expect(reason).toContain('하나도 없다');
  });

  it('트렁크 auth 는 상담원으로 세지 않는다 — 트렁크만 남은 파일이 통과하면 안 된다', () => {
    expect(findConfigRenderRegression({
      expectedAgentCount: 1,
      renderedPjsip: WIPED_PJSIP,
      renderedAgentDialplan: '',
    })).not.toBeNull();
  });

  it('정상 렌더는 통과한다', () => {
    expect(findConfigRenderRegression({
      expectedAgentCount: 1,
      renderedPjsip: HEALTHY_PJSIP,
      renderedAgentDialplan: HEALTHY_DIALPLAN,
    })).toBeNull();
  });

  it('SIP 비밀번호가 전부 비어 pjsip 만 0 인 것은 정상이다 — 오탐을 내지 않는다', () => {
    // 렌더러는 비밀번호 없는 상담원을 의도적으로 pjsip 에서 건너뛴다. dialplan 에는 남는다.
    expect(findConfigRenderRegression({
      expectedAgentCount: 3,
      renderedPjsip: WIPED_PJSIP,
      renderedAgentDialplan: HEALTHY_DIALPLAN,
    })).toBeNull();
  });

  it('상담원이 없는 현장은 검사하지 않는다', () => {
    expect(findConfigRenderRegression({
      expectedAgentCount: 0,
      renderedPjsip: WIPED_PJSIP,
      renderedAgentDialplan: '',
    })).toBeNull();
  });
});
